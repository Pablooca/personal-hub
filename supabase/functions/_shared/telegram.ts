/**
 * Telegram helpers shared by the Edge Functions (apple-pay-webhook, telegram-notify).
 * Message builders are pure (no Deno APIs → testable in Node). Messages use
 * Telegram's HTML parse mode, so every dynamic value is escaped.
 */

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const euro = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })} €`

export const time = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso))

const CATEGORY_LABELS: Record<string, string> = {
  groceries: 'Supermercado', dining: 'Restaurantes', transport: 'Transporte', housing: 'Vivienda',
  subscriptions: 'Suscripciones', health: 'Salud', education: 'Formación', leisure: 'Ocio', shopping: 'Compras',
  other: 'Otros', uncategorized: 'Sin categorizar', savings_withdrawal: 'Retirada de ahorro',
}
export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c.replace(/_/g, ' ').replace(/^\p{L}/u, (x) => x.toUpperCase())

export interface ExpenseRow {
  amount: number
  concept: string
  category: string
  account: string
  date: string
}

/** Up to `maxItems` individual lines; beyond that a single summary (e.g. a bank import). */
export function expensesMessage(rows: ExpenseRow[], maxItems = 5): string | null {
  if (rows.length === 0) return null
  if (rows.length === 1) {
    const r = rows[0]
    const review = r.category === 'uncategorized' ? '\n⚠️ <i>Pendiente de categorizar</i>' : ''
    return `💸 <b>Nuevo gasto: ${euro(r.amount)}</b>\n${escapeHtml(r.concept || 'Sin concepto')}\n${escapeHtml(categoryLabel(r.category))} · ${escapeHtml(r.account)}${review}`
  }
  const total = rows.reduce((a, r) => a + r.amount, 0)
  if (rows.length <= maxItems) {
    const lines = rows.map((r) => `• ${euro(r.amount)} · ${escapeHtml(r.concept || 'Sin concepto')}`)
    return `💸 <b>${rows.length} gastos nuevos · ${euro(total)}</b>\n${lines.join('\n')}`
  }
  const pending = rows.filter((r) => r.category === 'uncategorized').length
  return `📥 <b>${rows.length} gastos registrados · ${euro(total)}</b>${pending ? `\n⚠️ ${pending} pendientes de categorizar` : ''}`
}

export interface EventRow {
  title: string
  start_at: string
  end_at: string
  category: string
}

const EVENT_LABELS: Record<string, string> = {
  work: 'Trabajo', master: 'Máster', research: 'Investigación', training: 'Entrenamiento', personal: 'Personal',
}

/**
 * Reminder slots before an event starts, e.g. [10, 5]. Given the minutes left,
 * returns the slot that applies now (the smallest slot ≥ minutes left), or null.
 *   10 min left → 10 · 7 → 10 (if the 10-min tick was missed) · 5 → 5 · 2 → 5
 */
export function reminderSlot(minutesLeft: number, slots: number[]): number | null {
  const fitting = slots.filter((s) => minutesLeft <= s).sort((a, b) => a - b)
  return fitting.length ? fitting[0] : null
}

export function parseSlots(raw: string | undefined, fallback = [10, 5]): number[] {
  const slots = (raw ?? '')
    .split(',')
    .map((x) => Math.round(Number(x.trim())))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 240)
  return slots.length ? [...new Set(slots)].sort((a, b) => b - a) : fallback
}

/** Send a message; never throws (notifications must not break the caller). */
export async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    })
    if (!res.ok) console.error('telegram: API error', res.status, (await res.text()).slice(0, 200))
    return res.ok
  } catch (err) {
    console.error('telegram: network error', err)
    return false
  }
}

export function eventStartMessage(e: EventRow, minutesLeft: number, timeZone: string): string {
  const when = minutesLeft <= 1 ? 'Empieza ya' : `Empieza en ${minutesLeft} min`
  return `⏰ <b>${when}: ${escapeHtml(e.title)}</b>\n${time(e.start_at, timeZone)}–${time(e.end_at, timeZone)} · ${escapeHtml(EVENT_LABELS[e.category] ?? e.category)}`
}

export function eventEndMessage(e: EventRow, timeZone: string): string {
  return `✅ <b>Ha terminado: ${escapeHtml(e.title)}</b>\n${time(e.start_at, timeZone)}–${time(e.end_at, timeZone)}`
}
