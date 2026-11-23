/**
 * Telegram event reminders
 * -----------------------------------------------------------------------------
 * Called every minute by pg_cron from inside the database ({ kind: 'tick' }),
 * or manually ({ kind: 'test' }). New Apple Pay expenses are announced by the
 * apple-pay-webhook function itself.
 *
 * For each timed event: one message per reminder slot before it starts
 * (default 10 and 5 minutes, EVENT_REMINDERS="10,5") and one when it ends.
 * public.notification_log guarantees each message is sent once.
 *
 * Auth: `Authorization: Bearer <NOTIFY_SECRET>` (the database reads the same
 * value from Supabase Vault). Deployed with --no-verify-jwt.
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, NOTIFY_SECRET, optional
 * EVENT_REMINDERS, TIMEZONE. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { eventEndMessage, eventStartMessage, parseSlots, reminderSlot, sendTelegram } from '../_shared/telegram.ts'

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const va = new Uint8Array(ha), vb = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false })

  const secret = Deno.env.get('NOTIFY_SECRET')
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const timeZone = Deno.env.get('TIMEZONE') || 'Europe/Madrid'
  const slots = parseSlots(Deno.env.get('EVENT_REMINDERS'))

  if (!secret || secret.length < 24 || !url || !serviceKey) {
    console.error('telegram-notify: missing NOTIFY_SECRET or Supabase env')
    return json(500, { ok: false })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ') || !(await safeEqual(auth.slice(7).trim(), secret))) return json(401, { ok: false })
  if (!token || !chatId) return json(200, { ok: true, skipped: 'telegram not configured' })

  let body: { kind?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false })
  }

  if (body.kind === 'test') {
    const ok = await sendTelegram(token, chatId, '🔔 <b>Personal Hub</b>\nLas notificaciones están funcionando.')
    return json(ok ? 200 : 502, { ok })
  }
  if (body.kind !== 'tick') return json(400, { ok: false, message: 'unknown kind' })

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const now = Date.now()
    const iso = (ms: number) => new Date(ms).toISOString()
    const maxLead = Math.max(...slots)
    const cols = 'id, title, start_at, end_at, category'
    const [starting, ending] = await Promise.all([
      db.from('events').select(cols).eq('all_day', false).gt('start_at', iso(now)).lte('start_at', iso(now + maxLead * 60_000)),
      db.from('events').select(cols).eq('all_day', false).gt('end_at', iso(now - 5 * 60_000)).lte('end_at', iso(now)),
    ])
    if (starting.error) throw starting.error
    if (ending.error) throw ending.error

    let sent = 0
    // Claim first (insert … on conflict do nothing), send only if we won the claim.
    const once = async (eventId: string, kind: string, text: string) => {
      const { data, error } = await db
        .from('notification_log')
        .upsert({ event_id: eventId, kind }, { onConflict: 'event_id,kind', ignoreDuplicates: true })
        .select('event_id')
      if (error) throw error
      if (data && data.length && (await sendTelegram(token, chatId, text))) sent++
    }

    for (const e of starting.data ?? []) {
      const minutesLeft = Math.max(1, Math.ceil((new Date(e.start_at).getTime() - now) / 60_000))
      const slot = reminderSlot(minutesLeft, slots)
      if (slot !== null) await once(e.id, `start${slot}`, eventStartMessage(e, minutesLeft, timeZone))
    }
    for (const e of ending.data ?? []) await once(e.id, 'end', eventEndMessage(e, timeZone))
    return json(200, { ok: true, sent })
  } catch (err) {
    console.error('telegram-notify: error', err)
    return json(500, { ok: false })
  }
})
