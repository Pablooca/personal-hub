/** What the bot understands. Pure: text in, command out. */
import { addDay } from './brief.ts'

export type Command =
  | { kind: 'expense' | 'income'; amount: number; concept: string }
  | { kind: 'task'; title: string; due: string | null; jira: string | null }
  | { kind: 'event'; title: string; date: string; start: string; end: string }
  | { kind: 'hours'; hours: number; description: string; jira: string | null }
  | { kind: 'day'; date: string }
  | { kind: 'week' }
  | { kind: 'month' }
  | { kind: 'card'; query: string }
  | { kind: 'unknown'; text: string }
  | { kind: 'undo' }
  | { kind: 'help' }
  | { kind: 'error'; message: string }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function parseAmount(s: string): number | null {
  let t = s.replace(/[€\s]/g, '')
  if (!/^\d[\d.,]*$/.test(t)) return null
  if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null
}

/** Pulls a date out of the text: hoy, mañana, pasado mañana, el viernes, 5/12, 5 de diciembre. */
export function takeDate(text: string, today: string): { date: string | null; rest: string } {
  const f = fold(text)
  const cut = (m: RegExpMatchArray) => `${text.slice(0, m.index)} ${text.slice(m.index! + m[0].length)}`.replace(/\s+/g, ' ').trim()
  const year = Number(today.slice(0, 4))
  const valid = (y: number, mo: number, d: number) => {
    const t = new Date(Date.UTC(y, mo - 1, d))
    return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null
  }
  const upcoming = (mo: number, d: number) => {
    const k = valid(year, mo, d)
    return k && k < today ? valid(year + 1, mo, d) : k
  }
  let m = f.match(/\bpasado manana\b/)
  if (m) return { date: addDay(today, 2), rest: cut(m) }
  m = f.match(/\bmanana\b/)
  if (m) return { date: addDay(today, 1), rest: cut(m) }
  m = f.match(/\bhoy\b/)
  if (m) return { date: today, rest: cut(m) }
  m = f.match(/\b(?:el |para el )?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/)
  if (m) {
    const k = m[3] ? valid(Number(m[3]), Number(m[2]), Number(m[1])) : upcoming(Number(m[2]), Number(m[1]))
    if (k) return { date: k, rest: cut(m) }
  }
  m = f.match(new RegExp(`\\b(?:el |para el )?(\\d{1,2}) de (${MONTHS.join('|')})\\b`))
  if (m) {
    const k = upcoming(MONTHS.indexOf(m[2]) + 1, Number(m[1]))
    if (k) return { date: k, rest: cut(m) }
  }
  m = f.match(new RegExp(`\\b(?:el |este |para el )?(${WEEKDAYS.join('|')})\\b`))
  if (m) {
    const now = new Date(`${today}T00:00:00Z`).getUTCDay()
    return { date: addDay(today, (WEEKDAYS.indexOf(m[1]) - now + 7) % 7 || 7), rest: cut(m) }
  }
  return { date: null, rest: text.trim() }
}

const JIRA = /^([A-Za-z][A-Za-z0-9]+-\d+)[\s:·-]+(.+)$/
const splitJira = (s: string) => {
  const m = s.match(JIRA)
  return m ? { jira: m[1].toUpperCase(), text: m[2].trim() } : { jira: null, text: s.trim() }
}
const pad = (n: number) => String(n).padStart(2, '0')

export function parseCommand(raw: string, today: string): Command {
  const text = raw.normalize('NFC').trim().replace(/^[¿¡/\s]+/, '').replace(/[?!\s]+$/, '').replace(/@\w+bot\b/i, '').trim().slice(0, 1000)
  const word = fold(text.split(/\s/, 1)[0] ?? '')
  const rest = text.slice(text.split(/\s/, 1)[0].length).trim()

  if (!text || ['start', 'ayuda', 'help', 'hola'].includes(word)) return { kind: 'help' }
  if (word === 'hoy' && !rest) return { kind: 'day', date: today }
  if (word === 'manana' && !rest) return { kind: 'day', date: addDay(today, 1) }
  if (word === 'semana' && !rest) return { kind: 'week' }
  if (['mes', 'saldo', 'gastos'].includes(word) && !rest) return { kind: 'month' }
  if (['deshacer', 'undo', 'borrar'].includes(word) && !rest) return { kind: 'undo' }

  if (['gasto', 'gaste', 'ingreso', 'cobro', 'cobre'].includes(word) || /^[-+]?\d/.test(text)) {
    const income = ['ingreso', 'cobro', 'cobre'].includes(word) || text.startsWith('+')
    const body = /^[-+]?\d/.test(text) ? text.replace(/^[-+]/, '') : rest
    const m = body.match(/^(\d[\d.,]*)\s*(?:€|euros?|eur)?(?:\s+(?:en\s+|de\s+)?(.*))?$/i) ?? body.match(/^(.*?)\s+(\d[\d.,]*)\s*(?:€|euros?|eur)?$/i)
    const first = m && /^\d/.test(m[1])
    const amount = m ? parseAmount(first ? m[1] : m[2]) : null
    const concept = m ? ((first ? m[2] : m[1]) ?? '').trim() : ''
    if (amount === null) return { kind: 'error', message: 'No entiendo el importe. Prueba: gasto 12,50 café' }
    return { kind: income ? 'income' : 'expense', amount, concept: concept.slice(0, 200) }
  }
  if (['tarea', 'todo', 'recordar', 'recuerda'].includes(word)) {
    const { date, rest: t } = takeDate(rest, today)
    const { jira, text: title } = splitJira(t)
    if (!title) return { kind: 'error', message: 'Dime la tarea. Prueba: tarea llamar al banco mañana' }
    return { kind: 'task', title: title.charAt(0).toUpperCase() + title.slice(1, 300), due: date, jira }
  }
  if (['evento', 'cita', 'agenda'].includes(word)) {
    const { date, rest: t } = takeDate(rest, today)
    const m = t.match(/\b(?:a las? )?(\d{1,2})[:.h](\d{2})?\s*(?:(?:-|–|a|hasta)\s*(?:las? )?(\d{1,2})[:.h](\d{2})?)?/i)
    if (!m || Number(m[1]) > 23 || Number(m[2] ?? 0) > 59) return { kind: 'error', message: 'Dime la hora. Prueba: evento mañana 18:00 dentista' }
    const title = `${t.slice(0, m.index)} ${t.slice(m.index! + m[0].length)}`.replace(/\s+/g, ' ').replace(/^(a las?|de|con)\s+/i, '').trim()
    if (!title) return { kind: 'error', message: 'Dime qué es. Prueba: evento mañana 18:00 dentista' }
    const start = Number(m[1]) * 60 + Number(m[2] ?? 0)
    const end = m[3] ? Number(m[3]) * 60 + Number(m[4] ?? 0) : Math.min(start + 60, 1439)
    if (end <= start) return { kind: 'error', message: 'La hora de fin debe ser posterior a la de inicio.' }
    const hm = (x: number) => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`
    return { kind: 'event', title: title.charAt(0).toUpperCase() + title.slice(1, 200), date: date ?? today, start: hm(start), end: hm(end) }
  }
  if (['horas', 'hora'].includes(word)) {
    const m = rest.match(/^(\d{1,2})(?::(\d{2})|[.,](\d{1,2}))?\s*h?\b\s*(.*)$/i)
    const hours = m ? Number(m[1]) + (m[2] ? Number(m[2]) / 60 : m[3] ? Number(`0.${m[3]}`) : 0) : 0
    if (!m || hours <= 0 || hours > 24) return { kind: 'error', message: 'Dime las horas. Prueba: horas 7,5 PLAT-142 revisión' }
    const { jira, text: description } = splitJira(m[4].replace(/^(de|en)\s+/i, ''))
    const only = m[4].trim().match(/^[A-Za-z][A-Za-z0-9]+-\d+$/)
    return { kind: 'hours', hours: Math.round(hours * 100) / 100, description: only ? '' : description.slice(0, 2000), jira: only ? only[0].toUpperCase() : jira }
  }
  // ¿Tengo…? · ¿Cuántas … tengo? · ¿Dónde está …? · carta …
  const f = fold(text)
  const ask = f.match(/^(?:cartas?|busca(?:r)?|tengo|donde (?:esta|estan|tengo)|cuant[ao]s(?: copias)?(?: de)?(?: tengo(?: de)?)?)(?=\s|$)\s*/)
  if (ask && !/^tengo que\b/.test(f)) {
    let query = text.slice(ask[0].length)
    if (/^cuant|^donde/.test(f)) query = query.replace(/\s+(?:la |lo )?tengo$/i, '')
    query = query.replace(/^(?:(?:la|el|las|los|una|un|alguna?|algún)\s+)?(?:cartas?|copias?)\s+(?:de\s+)?/i, '').replace(/^(?:alguna?|algún)\s+/i, '').replace(/[«»"]/g, '').trim()
    return query ? { kind: 'card', query: query.slice(0, 100) } : { kind: 'error', message: 'Dime qué carta. Prueba: carta Latias ex, o carta SSP 76' }
  }
  return { kind: 'unknown', text: text.slice(0, 100) }
}
/** Nothing matched. */
export const NOT_UNDERSTOOD = 'No te he entendido. Escribe «ayuda» para ver lo que puedo hacer.'

export const HELP = `👋 <b>Esto es lo que entiendo</b>

💸 <code>gasto 12,50 café</code> · <code>ingreso 30 bizum</code>
✅ <code>tarea llamar al banco mañana</code>
📅 <code>evento viernes 18:00 dentista</code>
🕗 <code>horas 8 PLAT-142 revisión</code>

🎴 <code>carta Latias ex</code> · <code>¿tengo SSP 76?</code>

ℹ️ <code>hoy</code> · <code>mañana</code> · <code>semana</code> · <code>mes</code>
↩️ <code>deshacer</code> quita lo último que me has dictado`
