/**
 * Daily reference prices of the card collection, from Cardmarket's official
 * price guide (published every night). Called by telegram-notify at PRICES_AT
 * (default 09:00); once a day (message_log), retried if it fails.
 * Auth: `Authorization: Bearer <NOTIFY_SECRET>`. Deployed with --no-verify-jwt.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { localNow } from '../_shared/brief.ts'
import { claim, release } from '../_shared/load.ts'
import { GUIDE_URL, checkGuide, pickPrices } from '../_shared/prices.ts'

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

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
  const env = (k: string) => Deno.env.get(k) ?? ''
  const secret = env('NOTIFY_SECRET')
  const owner = env('OWNER_USER_ID')
  if (secret.length < 24 || !owner) return json(500, { ok: false })
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ') || !(await safeEqual(auth.slice(7).trim(), secret))) return json(401, { ok: false })

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  const today = localNow(Date.now(), env('TIMEZONE') || 'Europe/Madrid').date
  const key = `prices:${today}`
  try {
    if (!(await claim(db, key))) return json(200, { ok: true, skipped: 'already done today' })
  } catch (e) {
    console.error('card-prices: claim', e)
    return json(500, { ok: false })
  }
  try {
    const cards: { cm_product: number | null; finish: string }[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('owned_cards').select('cm_product, finish').eq('user_id', owner).not('cm_product', 'is', null).order('id').range(from, from + 999)
      if (error) throw error
      cards.push(...data)
      if (data.length < 1000) break
    }
    if (!cards.length) return json(200, { ok: true, updated: 0 })

    const res = await fetch(GUIDE_URL, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`price guide: HTTP ${res.status}`)
    const guide = checkGuide(await res.json(), Date.now())
    const { data, error } = await db.rpc('set_card_prices', { p_user: owner, p_date: today, p_rows: pickPrices(guide, cards) })
    if (error) throw error
    return json(200, { ok: true, updated: data, guide: guide.createdAt })
  } catch (e) {
    // Free the day so the next attempt can try again.
    await release(db, key)
    console.error('card-prices:', e)
    return json(502, { ok: false })
  }
})
