import { useEffect, useMemo, useState } from 'react'
import { useData } from '../state/data'
import { toDateKey } from './dates'
import { holidayLabel } from './holidays'
import { holidayMap, readHolidayRegion, writeHolidayRegion, type HolidayRegion } from './holidays'

/** Region setting shared across views (kept in sync via a window event). */
export function useHolidayRegion(): [HolidayRegion, (r: HolidayRegion) => void] {
  const [region, setRegion] = useState(readHolidayRegion)
  useEffect(() => {
    const sync = () => setRegion(readHolidayRegion())
    window.addEventListener('ph-holiday-region', sync)
    return () => window.removeEventListener('ph-holiday-region', sync)
  }, [])
  return [region, (r) => writeHolidayRegion(r)]
}

/** Holidays for the years around `around` (previous, current, next). */
export function useHolidays(around: Date = new Date()) {
  const [region] = useHolidayRegion()
  const y = around.getFullYear()
  return useMemo(() => holidayMap(region, [y - 1, y, y + 1]), [region, y])
}

/**
 * Non-working days around `around`: official holidays for your region, plus
 * days with a "Vacaciones" or "Festivo" event (e.g. local holidays you added).
 * dateKey → reason.
 */
export function useOffDays(around: Date = new Date()): Map<string, string> {
  const holidays = useHolidays(around)
  const { data } = useData()
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const [k, hs] of holidays) m.set(k, `Festivo · ${holidayLabel(hs)}`)
    for (const e of data.events) {
      if (e.category !== 'vacation' && e.category !== 'holiday') continue
      const k = toDateKey(new Date(e.start_at))
      if (!m.has(k)) m.set(k, e.category === 'vacation' ? 'Vacaciones' : e.title)
    }
    return m
  }, [holidays, data.events])
}
