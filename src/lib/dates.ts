/** Local-time date helpers. Weeks start on Monday. */

const pad = (n: number) => String(n).padStart(2, '0')

/** YYYY-MM-DD in local time. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parse YYYY-MM-DD as a local date (not UTC). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toTimeValue(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Combine a YYYY-MM-DD and HH:mm (local) into an ISO string. */
export function combineDateTime(dateKey: string, time: string): string {
  const [h, m] = time.split(':').map(Number)
  const d = fromDateKey(dateKey)
  d.setHours(h || 0, m || 0, 0, 0)
  return d.toISOString()
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  const day = (x.getDay() + 6) % 7 // Monday = 0
  return addDays(x, -day)
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** YYYY-MM key for month grouping. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** 6×7 grid of dates covering the month of `d`. */
export function monthGrid(d: Date): Date[] {
  const first = startOfWeek(startOfMonth(d))
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

export function weekDays(d: Date): Date[] {
  const first = startOfWeek(d)
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

export function daysUntil(dateKey: string, from = new Date()): number {
  const ms = fromDateKey(dateKey).getTime() - startOfDay(from).getTime()
  return Math.round(ms / 86_400_000)
}
