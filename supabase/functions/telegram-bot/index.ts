/**
 * Telegram bot: what you write to it
 * -----------------------------------------------------------------------------
 * Called by Telegram. Deployed with --no-verify-jwt, so it checks by itself:
 *  - header X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET
 *  - private chat whose id is TELEGRAM_CHAT_ID; anybody else is ignored
 * Writes only rows of OWNER_USER_ID. Each update is handled once (message_log).
 * Register it with telegram-notify { kind: 'setup' }.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { categorize, matchOwnRule } from '../apple-pay-webhook/normalize.ts'
import { HELP, NOT_UNDERSTOOD, parseCommand, type Command } from '../_shared/bot.ts'
import { dayMessage, localInstant, localNow, weekMessage } from '../_shared/brief.ts'
import { cardAnswer } from '../_shared/cardload.ts'
import { claim, loadDay, loadMonth, loadWeek } from '../_shared/load.ts'
import { categoryLabel, escapeHtml, euro, sendTelegram } from '../_shared/telegram.ts'

const ok = () => new Response('ok', { status: 200 })

async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const va = new Uint8Array(ha), vb = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

const dayText = (k: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${k}T00:00:00Z`))

async function answer(db: SupabaseClient, owner: string, tz: string, cmd: Command, today: string): Promise<string> {
  const add = async (table: string, row: Record<string, unknown>, label: string) => {
    const { data, error } = await db.from(table).insert({ ...row, user_id: owner }).select('id').single()
    if (error) throw error
    const { error: e2 } = await db.from('bot_actions').insert({ user_id: owner, table_name: table, row_id: data.id, label })
    if (e2) console.error('telegram-bot: undo log', e2)
  }
  switch (cmd.kind) {
    case 'help':
      return HELP
    case 'error':
      return `🤔 ${escapeHtml(cmd.message)}`
    case 'card':
      return (await cardAnswer(db, owner, cmd.query, today)) ?? ''
    case 'unknown':
      // Just the name of a card I own also works.
      return (await cardAnswer(db, owner, cmd.text, today, true)) ?? `🤔 ${NOT_UNDERSTOOD}`
    case 'expense':
    case 'income': {
      const [rules, accounts] = await Promise.all([
        db.from('category_rules').select('pattern, category').eq('user_id', owner).eq('type', cmd.kind),
        db.from('accounts').select('name, is_primary').eq('user_id', owner),
      ])
      if (accounts.error) throw accounts.error
      const own = matchOwnRule(rules.data ?? [], cmd.concept)
      const category = own ?? (cmd.kind === 'expense' ? categorize(cmd.concept) : 'other')
      const account = accounts.data?.find((a) => a.is_primary)?.name ?? accounts.data?.[0]?.name ?? 'main'
      await add('transactions', { type: cmd.kind, date: today, amount: cmd.amount, concept: cmd.concept, category, account }, `${euro(cmd.amount)} ${cmd.concept}`.trim())
      return `${cmd.kind === 'expense' ? '💸 Gasto' : '💰 Ingreso'}: <b>${euro(cmd.amount)}</b> ${escapeHtml(cmd.concept)}\n${escapeHtml(categoryLabel(category))} · ${escapeHtml(account)}`
    }
    case 'task':
      await add('project_tasks', { title: cmd.title, status: 'todo', category: cmd.jira ? 'work' : 'personal', jira_key: cmd.jira, due_date: cmd.due }, cmd.title)
      return `✅ Tarea: <b>${escapeHtml(cmd.title)}</b>${cmd.jira ? ` (${escapeHtml(cmd.jira)})` : ''}${cmd.due ? `\nPara el ${dayText(cmd.due)}` : ''}`
    case 'event': {
      const at = (hm: string) => localInstant(cmd.date, Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)), tz)
      await add('events', { title: cmd.title, start_at: at(cmd.start), end_at: at(cmd.end), category: 'personal', all_day: false }, cmd.title)
      return `📅 <b>${escapeHtml(cmd.title)}</b>\n${dayText(cmd.date)}, ${cmd.start}–${cmd.end}`
    }
    case 'hours':
      await add('work_logs', { date: today, hours: cmd.hours, description: cmd.description, jira_key: cmd.jira }, `${cmd.hours} h`)
      return `🕗 <b>${cmd.hours.toLocaleString('es-ES')} h</b> registradas hoy${cmd.jira ? ` · ${escapeHtml(cmd.jira)}` : ''}${cmd.description ? `\n${escapeHtml(cmd.description)}` : ''}`
    case 'day':
      return dayMessage(await loadDay(db, owner, cmd.date, tz), '📋', tz)
    case 'week':
      return weekMessage(await loadWeek(db, owner, today, tz))
    case 'month': {
      const m = await loadMonth(db, owner, today)
      const budgets = m.budgets.map((b) => `${b.spent >= b.limit ? '🚨' : b.spent >= b.limit * 0.8 ? '⚠️' : '•'} ${escapeHtml(categoryLabel(b.name))}: ${euro(b.spent)} de ${euro(b.limit)}`)
      return `📊 <b>Este mes</b>\nIngresos: ${euro(m.income)}\nGastos: ${euro(m.expense)}\nBalance: <b>${euro(m.income - m.expense)}</b>${budgets.length ? `\n\n<b>Presupuestos</b>\n${budgets.join('\n')}` : ''}`
    }
    case 'undo': {
      const { data, error } = await db.from('bot_actions').select('id, table_name, row_id, label').eq('user_id', owner).order('id', { ascending: false }).limit(1)
      if (error) throw error
      const last = data?.[0]
      if (!last) return 'No hay nada que deshacer.'
      const { error: e1 } = await db.from(last.table_name).delete().eq('id', last.row_id).eq('user_id', owner)
      if (e1) throw e1
      await db.from('bot_actions').delete().eq('id', last.id)
      return `↩️ Quitado: ${escapeHtml(last.label)}`
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('', { status: 405 })
  const env = (k: string) => Deno.env.get(k) ?? ''
  const hook = env('TELEGRAM_WEBHOOK_SECRET')
  const token = env('TELEGRAM_BOT_TOKEN')
  const chatId = env('TELEGRAM_CHAT_ID')
  const owner = env('OWNER_USER_ID')
  const tz = env('TIMEZONE') || 'Europe/Madrid'
  if (hook.length < 24 || !token || !chatId || !owner) {
    console.error('telegram-bot: missing configuration')
    return new Response('', { status: 500 })
  }
  if (!(await safeEqual(req.headers.get('x-telegram-bot-api-secret-token') ?? '', hook))) return new Response('', { status: 401 })

  let update: { update_id?: number; message?: { text?: string; chat?: { id?: number; type?: string }; from?: { id?: number } } }
  try {
    const raw = await req.text()
    if (raw.length > 32_768) return ok()
    update = JSON.parse(raw)
  } catch {
    return ok()
  }
  const m = update.message
  // Only the owner's private chat. Strangers get no answer at all.
  if (!m || typeof update.update_id !== 'number' || m.chat?.type !== 'private' || String(m.chat.id) !== chatId || String(m.from?.id) !== chatId) return ok()

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    if (!(await claim(db, `tg:${update.update_id}`))) return ok()
    const today = localNow(Date.now(), tz).date
    const text = typeof m.text === 'string' ? m.text : ''
    const reply = text ? await answer(db, owner, tz, parseCommand(text, today), today) : 'Por ahora solo entiendo texto. Escribe «ayuda».'
    await sendTelegram(token, chatId, reply)
  } catch (e) {
    console.error('telegram-bot: error', e)
    await sendTelegram(token, chatId, '⚠️ No he podido hacerlo. Inténtalo de nuevo.')
  }
  return ok()
})
