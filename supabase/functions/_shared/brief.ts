/**
 * Daily and weekly messages. Pure functions (no Deno APIs): rows in, HTML text out.
 */
import { categoryLabel, escapeHtml, euro, time } from './telegram.ts'

const DAY = 86_400_000
const utc = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)))
export const addDay = (k: string, n: number) => new Date(utc(k) + n * DAY).toISOString().slice(0, 10)

export interface LocalNow {
  date: string // YYYY-MM-DD
  minutes: number // since midnight
  weekday: number // 0 = Sunday
}
/** Date and time in the user's time zone. */
export function localNow(ms: number, timeZone: string): LocalNow {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))
  const g = (t: string) => p.find((x) => x.type === t)!.value
  const date = `${g('year')}-${g('month')}-${g('day')}`
  return { date, minutes: Number(g('hour')) * 60 + Number(g('minute')), weekday: new Date(utc(date)).getUTCDay() }
}
/** UTC instant of a local midnight (DST-safe). */
export function localMidnight(date: string, timeZone: string): number {
  const guess = utc(date)
  for (const off of [0, 60, 120, 180, -60, -120, -180, -240, -300, 330, 540]) {
    const t = guess - off * 60_000
    const l = localNow(t, timeZone)
    if (l.date === date && l.minutes === 0) return t
  }
  return guess
}

/** UTC instant of a local date and time (DST-safe). */
export function localInstant(date: string, minutes: number, timeZone: string): string {
  let t = localMidnight(date, timeZone) + minutes * 60_000
  const l = localNow(t, timeZone)
  t += (minutes - (l.date === date ? l.minutes : l.minutes - 1440)) * 60_000
  return new Date(t).toISOString()
}

export function parseAt(raw: string | undefined, fallback: string): number | null {
  const v = (raw ?? fallback).trim()
  if (/^(off|no)$/i.test(v)) return null
  const m = v.match(/^(\d{1,2}):(\d{2})$/)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return parseAt(undefined, fallback)
  return Number(m[1]) * 60 + Number(m[2])
}
/** A slot is open for half an hour, in case a tick is missed. */
export const isDue = (at: number | null, now: LocalNow, window = 30) => at !== null && now.minutes >= at && now.minutes < at + window

const km = (n: number) => `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`
const dayName = (k: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' }).format(new Date(utc(k)))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const RUN: Record<string, string> = { easy: 'Rodaje suave', interval: 'Series', tempo: 'Tempo', long: 'Tirada larga', race: 'Test' }

// ---------------------------------------------------------------- workout text
interface Block {
  kind: string
  reps: number
  reps_max: number | null
  unit: 's' | 'm'
  amount: number
  recovery_s: number | null
  target_kind: 'time' | 'pace' | null
  target_s: number | null
  hill?: { recovery_s: number | null; down: number }
}
const clock = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const p = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(Math.round(s % 60))}` : `${m}:${p(Math.round(s % 60))}`
}
const secs = (s: number) => (s < 60 ? `${s} s` : s % 60 ? clock(s) : `${s / 60} min`)
const size = (b: Pick<Block, 'unit' | 'amount'>) => (b.unit === 's' ? secs(b.amount) : b.amount >= 1000 && b.amount % 100 === 0 ? `${String(b.amount / 1000).replace('.', ',')} km` : `${b.amount} m`)
const NAMES: Record<string, string> = { warmup: 'Calentamiento', cooldown: 'Enfriamiento', strides: 'cortas', progressive: 'aceleración gradual', main: '', hills: 'colina', easy: 'suave' }

export function blockText(b: Block): string {
  const reps = b.reps_max && b.reps_max > b.reps ? `${b.reps}–${b.reps_max} × ` : b.reps > 1 ? `${b.reps} × ` : ''
  if (b.kind === 'hills' && b.hill) return `${reps}${size(b)} subida${b.hill.recovery_s ? `, rec ${secs(b.hill.recovery_s)}` : ''}, ${size({ unit: b.unit, amount: b.hill.down })} bajada`
  const target = b.target_s ? (b.target_kind === 'time' ? ` en ${clock(b.target_s)}` : ` a ${clock(b.target_s)}/km`) : ''
  const rec = b.recovery_s ? ` (rec ${secs(b.recovery_s)})` : ''
  const name = NAMES[b.kind] ?? ''
  return b.kind === 'warmup' || b.kind === 'cooldown' ? `${name}: ${size(b)}` : `${reps}${size(b)}${name ? ` ${name}` : ''}${target}${rec}`
}

export interface PlanRow {
  id: string
  date: string
  type: string
  distance_km: number
  description: string
  blocks: Block[] | null
}
export function runReminder(s: PlanRow, when: string): string {
  const lines = (s.blocks ?? []).map((b) => `• ${escapeHtml(blockText(b))}`)
  return [`👟 <b>${when}: ${RUN[s.type] ?? 'Entreno'} · ${km(s.distance_km)}</b>`, s.description && escapeHtml(s.description), ...lines].filter(Boolean).join('\n')
}

// --------------------------------------------------------------------- charges
export interface BillRow {
  id: string
  name: string
  amount: number
  period: string
  anchor_date: string
  notify_days: number
}
const MONTHS: Record<string, number> = { monthly: 1, bimonthly: 2, quarterly: 3, yearly: 12 }
/** Is there a charge on this exact day? Counted from the anchor, months clamped. */
export function chargesOn(b: Pick<BillRow, 'period' | 'anchor_date'>, day: string): boolean {
  const a = new Date(utc(b.anchor_date))
  const d = new Date(utc(day))
  if (d < a) return false
  const step = MONTHS[b.period]
  if (!step) return Math.round((d.getTime() - a.getTime()) / DAY) % 7 === 0
  const n = (d.getUTCFullYear() - a.getUTCFullYear()) * 12 + d.getUTCMonth() - a.getUTCMonth()
  if (n % step) return false
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  return d.getUTCDate() === Math.min(a.getUTCDate(), last)
}
export const billMessage = (b: BillRow, days: number) => `💳 <b>${days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`} se cobra ${escapeHtml(b.name)}</b>\n${euro(Number(b.amount))}`

// --------------------------------------------------------------------- budgets
export function budgetAlert(name: string, spent: number, limit: number): { level: 80 | 100; text: string } | null {
  const pct = limit > 0 ? (spent / limit) * 100 : 0
  if (pct >= 100) return { level: 100, text: `🚨 <b>Presupuesto superado: ${escapeHtml(categoryLabel(name))}</b>\nLlevas ${euro(spent)} de ${euro(limit)}` }
  if (pct >= 80) return { level: 80, text: `⚠️ <b>${escapeHtml(categoryLabel(name))}: ${Math.floor(pct)} % del presupuesto</b>\nLlevas ${euro(spent)} de ${euro(limit)}, quedan ${euro(limit - spent)}` }
  return null
}

// --------------------------------------------------------------------- morning
export interface DayData {
  date: string
  events: { title: string; start_at: string; end_at: string; all_day: boolean }[]
  runs: PlanRow[]
  tasks: { title: string; due_date: string | null; priority: string }[]
  assessments: { name: string; kind: string; due_at: string; subject: string }[]
  tournaments: { name: string; game: string }[]
  races: { name: string; distance_km: number }[]
  bills: { name: string; amount: number }[]
  review?: number
}
/** `title` e.g. "Buenos días". Empty sections are left out. */
export function dayMessage(d: DayData, title: string, timeZone: string): string {
  const out = [`${title} <b>${cap(dayName(d.date))}</b>`]
  const section = (head: string, rows: string[]) => rows.length && out.push(`\n<b>${head}</b>\n${rows.join('\n')}`)
  section('📅 Agenda', d.events.slice(0, 20).map((e) => `• ${e.all_day ? 'Todo el día' : `${time(e.start_at, timeZone)}–${time(e.end_at, timeZone)}`} ${escapeHtml(e.title)}`))
  section('👟 Entreno', d.runs.flatMap((r) => [`• ${RUN[r.type] ?? 'Entreno'} · ${km(r.distance_km)}`, ...(r.blocks ?? []).map((b) => `   ${escapeHtml(blockText(b))}`)]))
  section('🏁 Carrera', d.races.map((r) => `• ${escapeHtml(r.name)} · ${km(r.distance_km)}`))
  section('🏆 Torneo', d.tournaments.map((t) => `• ${escapeHtml(t.name)} (${t.game.toUpperCase()})`))
  const late = d.tasks.filter((t) => t.due_date && t.due_date < d.date)
  section('✅ Tareas', d.tasks.filter((t) => t.due_date === d.date).slice(0, 15).map((t) => `• ${t.priority === 'high' ? '❗ ' : ''}${escapeHtml(t.title)}`))
  section('⏰ Atrasadas', [...late.slice(0, 5).map((t) => `• ${escapeHtml(t.title)}`), ...(late.length > 5 ? [`… y ${late.length - 5} más`] : [])])
  section('🎓 Entregas y exámenes', d.assessments.map((a) => `• ${a.kind === 'exam' ? 'Examen' : 'Entrega'}: ${escapeHtml(a.name)} (${escapeHtml(a.subject)}) · ${new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(a.due_at))}`))
  section('💳 Cobros', d.bills.map((b) => `• ${escapeHtml(b.name)}: ${euro(Number(b.amount))}`))
  if (d.review) out.push(`\n💸 ${d.review} ${d.review === 1 ? 'movimiento' : 'movimientos'} sin categorizar`)
  if (out.length === 1) out.push('\nNo tienes nada previsto.')
  return out.join('\n')
}

// --------------------------------------------------------------------- week
export interface WeekData {
  from: string
  to: string
  expense: number
  previousExpense: number
  top: { category: string; total: number }[]
  kmDone: number
  kmPlanned: number
  sessionsDone: number
  sessionsPlanned: number
  hours: number
  rounds: { w: number; l: number; t: number }
  nextWeek: string[]
  openTasks: number
}
export function weekMessage(w: WeekData): string {
  const out = [`📊 <b>Tu semana</b> (${dayName(w.from, { day: 'numeric', month: 'short' })} – ${dayName(w.to, { day: 'numeric', month: 'short' })})`]
  const diff = w.previousExpense > 0 ? Math.round(((w.expense - w.previousExpense) / w.previousExpense) * 100) : null
  out.push(`\n💸 <b>Gastos: ${euro(w.expense)}</b>${diff === null ? '' : ` (${diff >= 0 ? '+' : '−'}${Math.abs(diff)} % que la anterior)`}${w.top.length ? `\n${w.top.map((t) => `• ${escapeHtml(categoryLabel(t.category))}: ${euro(t.total)}`).join('\n')}` : ''}`)
  if (w.kmDone || w.kmPlanned) out.push(`\n👟 <b>${km(w.kmDone)}</b>${w.kmPlanned ? ` de ${km(w.kmPlanned)} · ${w.sessionsDone} de ${w.sessionsPlanned} sesiones` : ''}`)
  if (w.hours) out.push(`\n🕗 <b>${w.hours.toLocaleString('es-ES', { maximumFractionDigits: 2 })} h</b> de trabajo registradas`)
  const r = w.rounds
  if (r.w + r.l + r.t) out.push(`\n🎴 Pokémon: <b>${r.w}-${r.l}${r.t ? `-${r.t}` : ''}</b>`)
  out.push(`\n✅ ${w.openTasks} ${w.openTasks === 1 ? 'tarea abierta' : 'tareas abiertas'}`)
  if (w.nextWeek.length) out.push(`\n<b>La semana que viene</b>\n${w.nextWeek.slice(0, 10).map((x) => `• ${x}`).join('\n')}`)
  return out.join('\n')
}

export const hoursReminder = () => '🕗 <b>Hoy no has registrado horas</b>\nApúntalas antes de que se te olviden. También puedes escribirme: <code>horas 8 descripción</code>'
