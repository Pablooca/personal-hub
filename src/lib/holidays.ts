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
import { FIXED, OFFICIAL, OFFICIAL_YEARS, goodFriday, type HolidayScope } from '../../supabase/functions/_shared/holidays.ts'

export type { HolidayScope }
export interface Holiday {
  date: string // YYYY-MM-DD
  name: string
  scope: HolidayScope
  estimated?: boolean
}

export const SCOPE_LABELS: Record<HolidayScope, string> = { ES: 'Nacional', AN: 'Andalucía', VC: 'C. Valenciana' }

function estimatedNational(year: number): Holiday[] {
  return [
    ...FIXED.map(([md, name]) => ({ date: `${year}-${md}`, name, scope: 'ES' as const, estimated: true })),
    { date: goodFriday(year), name: 'Viernes Santo', scope: 'ES', estimated: true },
  ]
}

export function holidaysForYear(year: number): Holiday[] {
  if (OFFICIAL_YEARS.has(year)) {
    return OFFICIAL.filter(([d]) => d.startsWith(`${year}-`)).map(([date, name, scope]) => ({ date, name, scope }))
  }
  return estimatedNational(year)
}

// ---------------------------------------------------------------- settings
/** A set of regional calendars (national holidays always apply). */
export type HolidayRegion = 'AN' | 'VC' | 'AN+VC' | 'ES'
export const REGION_OPTIONS: { value: HolidayRegion; label: string }[] = [
  { value: 'AN', label: 'Nacionales + Andalucía' },
  { value: 'VC', label: 'Nacionales + C. Valenciana' },
  { value: 'AN+VC', label: 'Nacionales + Andalucía + C. Valenciana' },
  { value: 'ES', label: 'Solo nacionales' },
]

/**
 * Which holidays affect which kind of event:
 *   Máster → national + Comunitat Valenciana
 *   Resto (work, Horas, everything else) → national + Andalucía
 * The calendar always *displays* national, Andalusian and Valencian holidays.
 */
export interface HolidayRules {
  master: HolidayRegion
  other: HolidayRegion
}
export const DEFAULT_HOLIDAY_RULES: HolidayRules = { master: 'VC', other: 'AN' }
export const RULE_LABELS: Record<keyof HolidayRules, string> = { master: 'Máster', other: 'Resto (Trabajo, Horas y demás categorías)' }
/** What the calendar always shows. */
export const DISPLAY_SCOPES: HolidayScope[] = ['ES', 'AN', 'VC']

const RULES_KEY = 'ph-holiday-rules-v2'
export const RULES_EVENT = 'ph-holiday-rules'
const isRegion = (v: unknown): v is HolidayRegion => REGION_OPTIONS.some((o) => o.value === v)

export function readHolidayRules(): HolidayRules {
  try {
    const raw = JSON.parse(localStorage.getItem(RULES_KEY) ?? 'null') as Partial<HolidayRules> | null
    if (!raw) return DEFAULT_HOLIDAY_RULES
    return {
      master: isRegion(raw.master) ? raw.master : DEFAULT_HOLIDAY_RULES.master,
      other: isRegion(raw.other) ? raw.other : DEFAULT_HOLIDAY_RULES.other,
    }
  } catch {
    return DEFAULT_HOLIDAY_RULES
  }
}

export function writeHolidayRules(r: HolidayRules) {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(r))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(RULES_EVENT))
}

/** Region whose holidays apply to an event of this category. */
export function regionForCategory(rules: HolidayRules, category: string): HolidayRegion {
  return category === 'master' ? rules.master : rules.other
}

const scopesFor = (r: HolidayRegion): HolidayScope[] => (r === 'AN+VC' ? ['ES', 'AN', 'VC'] : r === 'ES' ? ['ES'] : ['ES', r])

/** dateKey → holidays in the given scopes (or region), for the given years. */
export function holidayMap(regionOrScopes: HolidayRegion | HolidayScope[], years: number[]): Map<string, Holiday[]> {
  const scopes = new Set(Array.isArray(regionOrScopes) ? regionOrScopes : scopesFor(regionOrScopes))
  const m = new Map<string, Holiday[]>()
  for (const y of new Set(years)) {
    for (const h of holidaysForYear(y)) {
      if (!scopes.has(h.scope)) continue
      m.set(h.date, [...(m.get(h.date) ?? []), h])
    }
  }
  return m
}

/** "Inmaculada Concepción" · regional ones get their community: "Día de Andalucía (Andalucía)". */
export const holidayLabel = (hs: Holiday[]) => hs.map((h) => (h.scope === 'ES' ? h.name : `${h.name} (${SCOPE_LABELS[h.scope]})`)).join(' · ')
