/**
 * Official Spanish holidays, shared by the app (src/lib/holidays.ts) and the
 * Telegram functions. Sources: BOE-A-2025-21667 (2026) and BOE-A-2026-21254 (2027).
 * Other years: fixed national holidays + Good Friday, estimated.
 */
export type HolidayScope = 'ES' | 'AN' | 'VC'

export const OFFICIAL: [string, string, HolidayScope][] = [
  ['2026-01-01', 'Año Nuevo', 'ES'],
  ['2026-01-06', 'Epifanía del Señor', 'ES'],
  ['2026-02-28', 'Día de Andalucía', 'AN'],
  ['2026-03-19', 'San José', 'VC'],
  ['2026-04-02', 'Jueves Santo', 'AN'],
  ['2026-04-03', 'Viernes Santo', 'ES'],
  ['2026-04-06', 'Lunes de Pascua', 'VC'],
  ['2026-05-01', 'Fiesta del Trabajo', 'ES'],
  ['2026-06-24', 'San Juan', 'VC'],
  ['2026-08-15', 'Asunción de la Virgen', 'ES'],
  ['2026-10-09', 'Día de la Comunitat Valenciana', 'VC'],
  ['2026-10-12', 'Fiesta Nacional de España', 'ES'],
  ['2026-11-02', 'Día siguiente a Todos los Santos', 'AN'],
  ['2026-12-07', 'Lunes siguiente al Día de la Constitución Española', 'AN'],
  ['2026-12-08', 'Inmaculada Concepción', 'ES'],
  ['2026-12-25', 'Natividad del Señor', 'ES'],
  ['2027-01-01', 'Año Nuevo', 'ES'],
  ['2027-01-06', 'Epifanía del Señor', 'ES'],
  ['2027-03-01', 'Día de Andalucía', 'AN'],
  ['2027-03-19', 'San José', 'VC'],
  ['2027-03-25', 'Jueves Santo', 'AN'],
  ['2027-03-26', 'Viernes Santo', 'ES'],
  ['2027-03-29', 'Lunes de Pascua', 'VC'],
  ['2027-05-01', 'Fiesta del Trabajo', 'ES'],
  ['2027-08-16', 'Lunes siguiente a asunción de la Virgen', 'AN'],
  ['2027-10-09', 'Día de la Comunitat Valenciana', 'VC'],
  ['2027-10-12', 'Fiesta Nacional de España', 'ES'],
  ['2027-11-01', 'Todos los Santos', 'ES'],
  ['2027-12-06', 'Día de la Constitución Española', 'ES'],
  ['2027-12-08', 'Inmaculada Concepción', 'ES'],
  ['2027-12-25', 'Natividad del Señor', 'ES'],
]

export const OFFICIAL_YEARS = new Set(OFFICIAL.map(([d]) => Number(d.slice(0, 4))))

/** Good Friday, YYYY-MM-DD (Meeus/Jones/Butcher). */
export function goodFriday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day - 2)).toISOString().slice(0, 10)
}

export const FIXED: [string, string][] = [
  ['01-01', 'Año Nuevo'],
  ['01-06', 'Epifanía del Señor'],
  ['05-01', 'Fiesta del Trabajo'],
  ['08-15', 'Asunción de la Virgen'],
  ['10-12', 'Fiesta Nacional de España'],
  ['11-01', 'Todos los Santos'],
  ['12-06', 'Día de la Constitución Española'],
  ['12-08', 'Inmaculada Concepción'],
  ['12-25', 'Natividad del Señor'],
]

/** Public holiday for work (national plus one community)? Used by the functions. */
export function isHoliday(date: string, region: HolidayScope): boolean {
  const year = Number(date.slice(0, 4))
  if (OFFICIAL_YEARS.has(year)) return OFFICIAL.some(([d, , s]) => d === date && (s === 'ES' || s === region))
  return FIXED.some(([md]) => `${year}-${md}` === date) || goodFriday(year) === date
}
/** An official holiday in any of the three scopes. */
export const isOfficialAnywhere = (date: string) => OFFICIAL.some(([d]) => d === date)
