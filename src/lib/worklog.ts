import { addDays, monthKey, startOfMonth, toDateKey } from './dates'
import { LOCALE } from './format'
import type { WorkLog } from './types'

export const DEFAULT_DAILY_TARGET = 8
const TARGET_KEY = 'ph-hours-target'

export function readDailyTarget(): number {
  try {
    const n = Number(localStorage.getItem(TARGET_KEY))
    return n > 0 && n <= 24 ? n : DEFAULT_DAILY_TARGET
  } catch {
    return DEFAULT_DAILY_TARGET
  }
}

export function writeDailyTarget(n: number) {
  try {
    localStorage.setItem(TARGET_KEY, String(n))
  } catch {
    /* ignore */
  }
}

/** "7,5 h" */
export const fmtHours = (h: number) => `${h.toLocaleString(LOCALE, { maximumFractionDigits: 2 })} h`

/** Accepts "7,5", "7.5", "7:30", "1h30", "90m". Returns hours rounded to 0.05, or null. */
export function parseHours(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(',', '.')
  let h: number
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{1,2}):(\d{1,2})$/))) h = Number(m[1]) + Number(m[2]) / 60
  else if ((m = s.match(/^(\d{1,2})\s*h\s*(\d{1,2})?\s*(m|min)?$/))) h = Number(m[1]) + Number(m[2] ?? 0) / 60
  else if ((m = s.match(/^(\d{1,4})\s*(m|min)$/))) h = Number(m[1]) / 60
  else h = Number(s)
  if (!Number.isFinite(h) || h <= 0 || h > 24) return null
  return Math.round(h * 20) / 20
}

/** Every day of the month (local), flagged as weekend or not. */
export function monthDays(month: Date): { date: Date; key: string; weekend: boolean }[] {
  const first = startOfMonth(month)
  const out = []
  for (let d = first; d.getMonth() === first.getMonth(); d = addDays(d, 1)) {
    const dow = d.getDay()
    out.push({ date: d, key: toDateKey(d), weekend: dow === 0 || dow === 6 })
  }
  return out
}

export const inLogMonth = (logs: WorkLog[], month: Date) => {
  const ym = monthKey(month)
  return logs.filter((l) => l.date.startsWith(ym))
}

export function hoursByDay(logs: WorkLog[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of logs) m.set(l.date, (m.get(l.date) ?? 0) + l.hours)
  return m
}

export const NO_KEY = '—'

/** Timesheet matrix: Jira key → (day → hours), plus totals. */
export function timesheet(logs: WorkLog[]) {
  const rows = new Map<string, Map<string, number>>()
  for (const l of logs) {
    const k = l.jira_key ?? NO_KEY
    const row = rows.get(k) ?? new Map<string, number>()
    row.set(l.date, (row.get(l.date) ?? 0) + l.hours)
    rows.set(k, row)
  }
  return [...rows.entries()]
    .map(([key, days]) => ({ key, days, total: [...days.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => (a.key === NO_KEY ? 1 : b.key === NO_KEY ? -1 : b.total - a.total))
}

const csvCell = (v: string) => {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** One line per entry — the format you'd paste into Jira/Tempo or a spreadsheet. */
export function worklogCsv(logs: WorkLog[], taskTitle: (id: string | null) => string): string {
  const head = ['fecha', 'clave_jira', 'horas', 'descripcion', 'tarea']
  const rows = [...logs]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.jira_key ?? '').localeCompare(b.jira_key ?? ''))
    .map((l) => [l.date, l.jira_key ?? '', l.hours.toFixed(2).replace('.', ','), l.description, taskTitle(l.task_id)].map(csvCell).join(';'))
  return [head.join(';'), ...rows].join('\n')
}
