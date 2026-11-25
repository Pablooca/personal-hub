/** Personal records, evolution over time and shoe mileage. Pure functions. */
import { riegel, runPace, weekOf } from './running.ts'
import { splitPace } from './workout.ts'
import type { Run, Shoe } from './types'

export interface RunRecord {
  id: string
  label: string
  value: number
  kind: 'time' | 'km' | 'pace'
  date: string
  run: Run | null
  /** Derived from a longer run at constant pace, not run as that exact distance. */
  estimated: boolean
}

const TARGETS: [string, number][] = [['1K', 1], ['5K', 5], ['10K', 10], ['Media maratón', 21.097], ['Maratón', 42.195]]

/** Best time per distance: exact efforts first, else the average pace of a longer continuous run. */
export function records(runs: readonly Run[]): RunRecord[] {
  const out: RunRecord[] = []
  for (const [label, km] of TARGETS) {
    const exact = runs.filter((r) => r.type !== 'interval' && Math.abs(r.distance_km - km) <= km * 0.03).map((run) => ({ run, t: (run.duration_s / run.distance_km) * km, estimated: false }))
    const longer = km === 1 ? [] : runs.filter((r) => r.type !== 'interval' && r.distance_km > km * 1.03).map((run) => ({ run, t: runPace(run) * km, estimated: true }))
    const best = [...exact, ...longer].sort((a, b) => a.t - b.t)[0]
    if (best) out.push({ id: label, label, value: Math.round(best.t), kind: 'time', date: best.run.date, run: best.run, estimated: best.estimated })
  }
  const longest = [...runs].sort((a, b) => b.distance_km - a.distance_km)[0]
  if (longest) out.push({ id: 'longest', label: 'Tirada más larga', value: longest.distance_km, kind: 'km', date: longest.date, run: longest, estimated: false })
  const weeks = new Map<string, number>()
  for (const r of runs) weeks.set(weekOf(r.date), (weeks.get(weekOf(r.date)) ?? 0) + r.distance_km)
  const week = [...weeks].sort((a, b) => b[1] - a[1])[0]
  if (week) out.push({ id: 'week', label: 'Semana con más km', value: Math.round(week[1] * 100) / 100, kind: 'km', date: week[0], run: null, estimated: false })
  // Best rep of each distance, from the structured sessions.
  const reps = new Map<number, { pace: number; s: number; run: Run }>()
  for (const r of runs)
    for (const b of r.blocks ?? [])
      if (b.kind === 'main' && b.unit === 'm' && b.done)
        for (const s of b.splits) if (s && (!reps.has(b.amount) || s < reps.get(b.amount)!.s)) reps.set(b.amount, { s, pace: splitPace(b, s), run: r })
  for (const [m, x] of [...reps].sort((a, b) => a[0] - b[0])) if (m < 5000) out.push({ id: `rep-${m}`, label: `Mejor serie de ${m} m`, value: x.s, kind: 'time', date: x.run.date, run: x.run, estimated: false })
  return out
}

export interface TrendPoint {
  date: string
  value: number
  run: Run
}

/** Average pace per run of a type (continuous runs only, except `interval`, which uses the reps). */
export const paceTrend = (runs: readonly Run[], type: Run['type']): TrendPoint[] =>
  runs
    .filter((r) => r.type === type)
    .flatMap((run) => {
      const v = type === 'interval' ? run.work_pace_s : runPace(run)
      return v ? [{ date: run.date, value: v, run }] : []
    })
    .sort((a, b) => a.date.localeCompare(b.date))

export const hrTrend = (runs: readonly Run[], type: Run['type']): TrendPoint[] => runs.filter((r) => r.type === type && r.avg_hr).map((run) => ({ date: run.date, value: run.avg_hr!, run })).sort((a, b) => a.date.localeCompare(b.date))

/** For each date with a continuous run: the best Riegel projection over the previous 42 days. */
export function projectionTrend(runs: readonly Run[], km: number): TrendPoint[] {
  const list = runs.filter((r) => r.type !== 'interval' && r.distance_km >= Math.max(3, km * 0.2)).sort((a, b) => a.date.localeCompare(b.date))
  return list.map((run) => {
    const from = new Date(Date.parse(run.date) - 42 * 86_400_000).toISOString().slice(0, 10)
    const best = list.filter((r) => r.date <= run.date && r.date >= from).map((r) => riegel(r.duration_s, r.distance_km, km)).sort((a, b) => a - b)[0]
    return { date: run.date, value: Math.round(best), run }
  })
}

export interface ShoeUse {
  shoe: Shoe
  km: number
  runs: number
  pct: number
  state: 'ok' | 'warn' | 'over'
}
export function shoeUse(shoes: readonly Shoe[], runs: readonly Run[]): ShoeUse[] {
  return shoes
    .map((shoe) => {
      const own = runs.filter((r) => r.shoe_id === shoe.id)
      const km = Math.round((shoe.start_km + own.reduce((a, r) => a + r.distance_km, 0)) * 10) / 10
      const pct = shoe.limit_km > 0 ? (km / shoe.limit_km) * 100 : 0
      return { shoe, km, runs: own.length, pct, state: (pct >= 100 ? 'over' : pct >= 85 ? 'warn' : 'ok') as ShoeUse['state'] }
    })
    .sort((a, b) => Number(a.shoe.retired) - Number(b.shoe.retired) || b.km - a.km)
}
