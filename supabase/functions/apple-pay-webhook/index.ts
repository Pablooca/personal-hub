/**
 * Apple Pay → Supabase webhook
 * -----------------------------------------------------------------------------
 * Called by an iOS Shortcuts "Transaction" personal automation after every
 * Apple Pay payment. Registers the payment as an expense for the owner.
 *
 * Security model
 *  - Deployed with --no-verify-jwt (iOS cannot mint Supabase JWTs), so this
 *    function authenticates the caller itself with a shared secret:
 *      Authorization: Bearer <APPLE_PAY_WEBHOOK_SECRET>
 *  - It writes with the service-role key (bypasses RLS) but ONLY ever for
 *    OWNER_USER_ID, with fully server-controlled columns. Nothing in the
 *    request body can choose the user, the type or the table.
 *  - No secret or user id is hard-coded: everything comes from Supabase Secrets.
 *
 * Env (Supabase Secrets):
 *   APPLE_PAY_WEBHOOK_SECRET  long random string shared with the Shortcut
 *   OWNER_USER_ID             UUID of your user in auth.users
 *   TIMEZONE                  optional, IANA zone for "today" (default Europe/Madrid)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  injected automatically by Supabase
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { categorize, categoryLabel, formatEuro, parseAmount, parseDate } from './normalize.ts'

const MAX_BODY_BYTES = 8 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

/** Constant-time comparison (hash both sides so lengths never leak). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const va = new Uint8Array(ha)
  const vb = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, message: 'Method Not Allowed' })

  // ------------------------------------------------------------ config
  const secret = Deno.env.get('APPLE_PAY_WEBHOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const ownerId = Deno.env.get('OWNER_USER_ID')
  const timeZone = Deno.env.get('TIMEZONE') || 'Europe/Madrid'

  if (!secret || secret.length < 24 || !supabaseUrl || !serviceKey || !ownerId || !UUID_RE.test(ownerId)) {
    console.error('apple-pay-webhook: missing or invalid environment configuration')
    return json(500, { ok: false, message: 'Server misconfigured' })
  }

  // ------------------------------------------------------------ auth
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token || !(await safeEqual(token, secret))) {
    return json(401, { ok: false, message: 'Unauthorized' })
  }

  // ------------------------------------------------------------ body
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) return json(413, { ok: false, message: 'Payload too large' })

  let body: Record<string, unknown>
  try {
    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) return json(413, { ok: false, message: 'Payload too large' })
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return json(400, { ok: false, message: 'JSON no válido' })
  }

  const amount = parseAmount(body.amount)
  if (amount === null) return json(400, { ok: false, message: `Importe no válido: ${clean(body.amount, 40) || '(vacío)'}` })

  const merchant = clean(body.merchant, 200) || 'Apple Pay'
  const card = clean(body.card, 60)
  const date = parseDate(body.date, timeZone)
  const category = categorize(merchant)

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // ---------------------------------------------------------- account
    // Card name matching one of your accounts → that account;
    // otherwise your primary account; otherwise the card name / "Apple Pay".
    const { data: accounts, error: accErr } = await db.from('accounts').select('name, is_primary').eq('user_id', ownerId)
    if (accErr) throw accErr
    const cardKey = card.toLowerCase()
    const matched = cardKey
      ? accounts?.find((a) => a.name.toLowerCase() === cardKey) ??
        accounts?.find((a) => cardKey.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(cardKey))
      : undefined
    const account = matched?.name ?? accounts?.find((a) => a.is_primary)?.name ?? (card || 'Apple Pay')

    // ---------------------------------------------------------- de-duplicate
    // Automations occasionally fire twice for the same payment.
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString()
    const { data: dupes, error: dupErr } = await db
      .from('transactions')
      .select('id')
      .eq('user_id', ownerId)
      .eq('date', date)
      .eq('amount', amount)
      .eq('concept', merchant)
      .gte('created_at', since)
      .limit(1)
    if (dupErr) throw dupErr
    if (dupes && dupes.length > 0) {
      return json(200, { ok: true, duplicate: true, message: `Ya registrado: ${formatEuro(amount)} en ${merchant}` })
    }

    // ---------------------------------------------------------- insert
    const { error: insErr } = await db.from('transactions').insert({
      user_id: ownerId,
      type: 'expense',
      date,
      amount,
      concept: merchant,
      category,
      account,
    })
    if (insErr) throw insErr

    return json(200, {
      ok: true,
      message: `Registrado: ${formatEuro(amount)} en ${merchant} (${categoryLabel(category)})`,
    })
  } catch (err) {
    console.error('apple-pay-webhook: database error', err)
    return json(500, { ok: false, message: 'No se ha podido registrar el pago' })
  }
})
