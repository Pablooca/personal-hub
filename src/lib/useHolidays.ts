import { useEffect, useMemo, useState } from 'react'
import { useData } from '../state/data'
import { toDateKey } from './dates'
import {
  DISPLAY_SCOPES,
  RULES_EVENT,
  holidayLabel,
  holidayMap,
  readHolidayRules,
  writeHolidayRules,
  type HolidayRegion,
  type HolidayRules,
} from './holidays'

/** Per-category holiday rules, shared across views (kept in sync via a window event). */
export function useHolidayRules(): [HolidayRules, (r: HolidayRules) => void] {
  const [rules, setRules] = useState(readHolidayRules)
  useEffect(() => {
    const sync = () => setRules(readHolidayRules())
    window.addEventListener(RULES_EVENT, sync)
    return () => window.removeEventListener(RULES_EVENT, sync)
  }, [])
  return [rules, writeHolidayRules]
}

/**
 * Holidays for the years around `around`.
 * `region` = a specific calendar (e.g. the one for an event's category);
 * omitted = national + Andalucía + C. Valenciana (what the calendar always shows).
 */
export function useHolidays(around: Date = new Date(), region?: HolidayRegion) {
  const y = around.getFullYear()
  return useMemo(() => holidayMap(region ?? DISPLAY_SCOPES, [y - 1, y, y + 1]), [region, y])
}

/**
 * Non-working days around `around`: official holidays for `region`
 * (default: the "resto" calendar, which covers work) plus, unless `includeEvents` is false:
 *  - days with a "Vacaciones" event,
 *  - days with a manual "Festivo" event on a date that is NOT an official
 *    holiday anywhere (e.g. a local holiday you added). Auto-created
 *    "Festivo" events always sit on official dates, so they never leak a
 *    Valencian holiday into the work calendar or vice versa.
 * dateKey → reason.
 */
export function useOffDays(around: Date = new Date(), region?: HolidayRegion, includeEvents = true): Map<string, string> {
  const [rules] = useHolidayRules()
  const holidays = useHolidays(around, region ?? rules.other)
  const y = around.getFullYear()
  const anyOfficial = useMemo(() => holidayMap(['ES', 'AN', 'VC'], [y - 1, y, y + 1]), [y])
  const { data } = useData()
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const [k, hs] of holidays) m.set(k, `Festivo · ${holidayLabel(hs)}`)
    if (!includeEvents) return m
    for (const e of data.events) {
      if (e.category !== 'vacation' && e.category !== 'holiday') continue
      const k = toDateKey(new Date(e.start_at))
      if (m.has(k)) continue
      if (e.category === 'vacation') m.set(k, 'Vacaciones')
      else if (!anyOfficial.has(k)) m.set(k, e.title)
    }
    return m
  }, [holidays, anyOfficial, data.events, includeEvents])
}
