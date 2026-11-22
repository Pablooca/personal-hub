/**
 * Spanish public holidays (fiestas laborales).
 *
 * Source: official BOE resolutions of the Dirección General de Trabajo
 *   - 2026: BOE-A-2025-21667 (BOE núm. 259, 28/10/2025)
 *   - 2027: BOE-A-2026-21254 (BOE núm. 254, 13/10/2026)
 * Scope 'ES' = holiday in every autonomous community; 'AN' = Andalucía;
 * 'VC' = Comunitat Valenciana. Local (municipal) holidays are not in the BOE:
 * add them as events with the "Festivo" category.
 *
 * For years not listed, only the fixed national holidays + Good Friday are
 * computed (marked as estimated) until the year's resolution is added here.
 */
import { addDays, toDateKey } from './dates'

export type HolidayScope = 'ES' | 'AN' | 'VC'
export interface Holiday {
  date: string // YYYY-MM-DD
  name: string
  scope: HolidayScope
  estimated?: boolean
}

export const SCOPE_LABELS: Record<HolidayScope, string> = { ES: 'Nacional', AN: 'Andalucía', VC: 'C. Valenciana' }

const OFFICIAL: [string, string, HolidayScope][] = [
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

const OFFICIAL_YEARS = new Set(OFFICIAL.map(([d]) => Number(d.slice(0, 4))))

/** Anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
function easterSunday(year: number): Date {
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
  return new Date(year, month - 1, day)
}

function estimatedNational(year: number): Holiday[] {
  const fixed: [string, string][] = [
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
  return [
    ...fixed.map(([md, name]) => ({ date: `${year}-${md}`, name, scope: 'ES' as const, estimated: true })),
    { date: toDateKey(addDays(easterSunday(year), -2)), name: 'Viernes Santo', scope: 'ES', estimated: true },
  ]
}

export function holidaysForYear(year: number): Holiday[] {
  if (OFFICIAL_YEARS.has(year)) {
    return OFFICIAL.filter(([d]) => d.startsWith(`${year}-`)).map(([date, name, scope]) => ({ date, name, scope }))
  }
  return estimatedNational(year)
}

// ---------------------------------------------------------------- settings
/** Which regional calendars apply to you (national ones always do). */
export type HolidayRegion = 'AN' | 'VC' | 'AN+VC' | 'ES'
export const REGION_OPTIONS: { value: HolidayRegion; label: string }[] = [
  { value: 'AN', label: 'Andalucía' },
  { value: 'VC', label: 'C. Valenciana' },
  { value: 'AN+VC', label: 'Andalucía + C. Valenciana' },
  { value: 'ES', label: 'Solo nacionales' },
]
const REGION_KEY = 'ph-holiday-region'

export function readHolidayRegion(): HolidayRegion {
  try {
    const v = localStorage.getItem(REGION_KEY) as HolidayRegion | null
    return v && REGION_OPTIONS.some((o) => o.value === v) ? v : 'AN'
  } catch {
    return 'AN'
  }
}

export function writeHolidayRegion(r: HolidayRegion) {
  try {
    localStorage.setItem(REGION_KEY, r)
    window.dispatchEvent(new Event('ph-holiday-region'))
  } catch {
    /* ignore */
  }
}

const scopesFor = (r: HolidayRegion): HolidayScope[] => (r === 'AN+VC' ? ['ES', 'AN', 'VC'] : r === 'ES' ? ['ES'] : ['ES', r])

/** dateKey → holidays that apply for the chosen region, for the given years. */
export function holidayMap(region: HolidayRegion, years: number[]): Map<string, Holiday[]> {
  const scopes = new Set(scopesFor(region))
  const m = new Map<string, Holiday[]>()
  for (const y of new Set(years)) {
    for (const h of holidaysForYear(y)) {
      if (!scopes.has(h.scope)) continue
      m.set(h.date, [...(m.get(h.date) ?? []), h])
    }
  }
  return m
}

export const holidayLabel = (hs: Holiday[]) => hs.map((h) => h.name).join(' · ')
