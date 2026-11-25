/**
 * Telegram event reminders
 * -----------------------------------------------------------------------------
 * Called every minute by pg_cron from inside the database ({ kind: 'tick' }),
 * or manually: { kind: 'test' }, { kind: 'message', text } and { kind: 'setup' }
 * (registers the telegram-bot webhook). New Apple Pay expenses are announced by the
 * apple-pay-webhook function itself.
 *
 * For each timed event: one message per reminder slot before it starts
 * (default 10 and 5 minutes, EVENT_REMINDERS="10,5") and one when it ends.
 * For each study assessment not yet done/graded, one message per slot:
 *   deliveries: 1 day, 3 h, 1 h, 30 min, 5 min   (DELIVERY_REMINDERS)
 *   exams:      1 month, 2 weeks, 1 week, 2 days, 1 day, 3 h, 1 h   (EXAM_REMINDERS)
 * Summaries and alerts (morning, hours, workout, week, charges, budgets): _shared/daily.ts.
 * notification_log / study_notification_log / message_log guarantee each message is sent once.
 *
 * Auth: `Authorization: Bearer <NOTIFY_SECRET>` (the database reads the same
 * value from Supabase Vault). Deployed with --no-verify-jwt.
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, NOTIFY_SECRET, optional
 * EVENT_REMINDERS, TIMEZONE, OWNER_USER_ID, TELEGRAM_WEBHOOK_SECRET and the times
 * in _shared/daily.ts. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { localNow, parseAt } from '../_shared/brief.ts'
import { runDaily } from '../_shared/daily.ts'
import { isPriceTime } from '../_shared/prices.ts'
import { DELIVERY_SLOTS, EXAM_SLOTS, deadlineMessage, eventEndMessage, eventStartMessage, escapeHtml, examMessage, parseSlots, reminderSlot, sendTelegram } from '../_shared/telegram.ts'

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
  const deliverySlots = parseSlots(Deno.env.get('DELIVERY_REMINDERS'), DELIVERY_SLOTS)
  const examSlots = parseSlots(Deno.env.get('EXAM_REMINDERS'), EXAM_SLOTS)

  if (!secret || secret.length < 24 || !url || !serviceKey) {
    console.error('telegram-notify: missing NOTIFY_SECRET or Supabase env')
    return json(500, { ok: false })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ') || !(await safeEqual(auth.slice(7).trim(), secret))) return json(401, { ok: false })
  if (!token || !chatId) return json(200, { ok: true, skipped: 'telegram not configured' })

  let body: { kind?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false })
  }

  if (body.kind === 'test') {
    const ok = await sendTelegram(token, chatId, '🔔 <b>Personal Hub</b>\nLas notificaciones están funcionando.')
    return json(ok ? 200 : 502, { ok })
  }
  if (body.kind === 'message') {
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 3500) : ''
    if (!text) return json(400, { ok: false })
    const ok = await sendTelegram(token, chatId, escapeHtml(text))
    return json(ok ? 200 : 502, { ok })
  }
  if (body.kind === 'setup') {
    const hook = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
    if (!hook || hook.length < 24) return json(500, { ok: false, message: 'missing TELEGRAM_WEBHOOK_SECRET' })
    const call = async (method: string, payload: unknown) =>
      (await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).ok
    const webhook = await call('setWebhook', { url: `${url}/functions/v1/telegram-bot`, secret_token: hook, allowed_updates: ['message'], drop_pending_updates: true, max_connections: 2 })
    const commands = await call('setMyCommands', {
      commands: [
        { command: 'hoy', description: 'Tu día' },
        { command: 'manana', description: 'Tu día de mañana' },
        { command: 'semana', description: 'Resumen de la semana' },
        { command: 'mes', description: 'Gastos y presupuestos del mes' },
        { command: 'deshacer', description: 'Quitar lo último que has dictado' },
        { command: 'ayuda', description: 'Qué puedo hacer' },
      ],
    })
    return json(webhook && commands ? 200 : 502, { ok: webhook && commands, webhook, commands })
  }
  if (body.kind !== 'tick') return json(400, { ok: false, message: 'unknown kind' })

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const now = Date.now()
    const iso = (ms: number) => new Date(ms).toISOString()
    const maxLead = Math.max(...slots)
    const cols = 'id, title, start_at, end_at, category'
    const maxDeadline = Math.max(...deliverySlots, ...examSlots)
    const [starting, ending, deadlines] = await Promise.all([
      db.from('events').select(cols).eq('all_day', false).gt('start_at', iso(now)).lte('start_at', iso(now + maxLead * 60_000)),
      db.from('events').select(cols).eq('all_day', false).gt('end_at', iso(now - 5 * 60_000)).lte('end_at', iso(now)),
      db
        .from('study_assessments')
        .select('id, name, kind, due_at, weight, subject:study_subjects(name)')
        .eq('is_done', false)
        .is('grade', null)
        .gt('due_at', iso(now))
        .lte('due_at', iso(now + maxDeadline * 60_000)),
    ])
    if (starting.error) throw starting.error
    if (ending.error) throw ending.error
    if (deadlines.error) throw deadlines.error

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

    for (const a of deadlines.data ?? []) {
      const minutesLeft = Math.max(1, Math.ceil((new Date(a.due_at as string).getTime() - now) / 60_000))
      const isExam = a.kind === 'exam'
      const slot = reminderSlot(minutesLeft, isExam ? examSlots : deliverySlots)
      if (slot === null) continue
      const { data: claimed, error } = await db
        .from('study_notification_log')
        .upsert({ assessment_id: a.id, kind: `before${slot}` }, { onConflict: 'assessment_id,kind', ignoreDuplicates: true })
        .select('assessment_id')
      if (error) throw error
      const subject = Array.isArray(a.subject) ? a.subject[0] : a.subject
      const row = { name: a.name, due_at: a.due_at as string, weight: Number(a.weight) }
      const subjectName = (subject as { name?: string } | null)?.name ?? 'Estudios'
      const text = (isExam ? examMessage : deadlineMessage)(row, subjectName, minutesLeft, timeZone)
      if (claimed && claimed.length && (await sendTelegram(token, chatId, text))) sent++
    }

    const owner = Deno.env.get('OWNER_USER_ID')
    if (owner) sent += await runDaily(db, owner, timeZone, (k) => Deno.env.get(k), (text) => sendTelegram(token, chatId, text), now)

    // Daily Cardmarket prices, in their own function: the guide is a 16 MB file.
    if (owner && isPriceTime(parseAt(Deno.env.get('PRICES_AT'), '09:00'), localNow(now, timeZone).minutes))
      try {
        const r = await fetch(`${url}/functions/v1/card-prices`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(90_000) })
        console.log('card-prices:', r.status, (await r.text()).slice(0, 200))
      } catch (e) {
        console.error('card-prices: not reachable', e)
      }
    return json(200, { ok: true, sent })
  } catch (err) {
    console.error('telegram-notify: error', err)
    return json(500, { ok: false })
  }
})
