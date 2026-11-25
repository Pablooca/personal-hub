import { addDays, toDateKey } from '../lib/dates'
import { uid } from '../lib/format'
import { shiftDay, weekOf } from '../lib/running'
import type { Dataset, RaceGoal, Run, RunPlanSession } from '../lib/types'

/** Fictional half-marathon block for Demo Mode: 6 weeks behind, 5 to go. */
export function buildDemoRunning(today: Date): Pick<Dataset, 'race_goals' | 'run_plan' | 'runs'> {
  const now = new Date().toISOString()
  const key = toDateKey(today)
  const goal: RaceGoal = { id: uid(), name: 'Media maratón de ejemplo', date: toDateKey(addDays(today, 35)), distance_km: 21.097, previous_best_s: 5940, target_s: 5700, notes: '', created_at: now }
  const monday = weekOf(key)
  const run_plan: RunPlanSession[] = []
  const runs: Run[] = []
  for (let w = -6; w < 5; w++) {
    const base = shiftDay(monday, w * 7)
    const long = w < 3 ? 14 + Math.min(6, w + 6) : w === 3 ? 14 : 8
    const week: [number, RunPlanSession['type'], number, number, string][] = [
      [1, 'easy', 8, 335, 'Suave'],
      [3, w % 2 ? 'interval' : 'tempo', 10, w % 2 ? 248 : 268, w % 2 ? '5 × 1000 m' : '3 × 10 min a umbral'],
      [4, 'easy', 7, 340, ''],
      [6, 'long', long, 320, ''],
    ]
    week.forEach(([d, type, km, pace, description], i) => {
      const s: RunPlanSession = { id: uid(), goal_id: goal.id, date: shiftDay(base, d), type, distance_km: km, pace_s: pace, description, created_at: now }
      if (s.date >= goal.date) return
      run_plan.push(s)
      if (s.date >= key || (w === -4 && i === 2) || (w === -2 && i === 1)) return
      const wobble = ((w * 7 + i * 5) % 9) - 3
      runs.push({
        id: uid(), plan_id: s.id, date: s.date, type, distance_km: km, duration_s: Math.round(km * (type === 'interval' ? 300 : type === 'tempo' ? 288 : pace + wobble)),
        work_pace_s: type === 'interval' || type === 'tempo' ? pace + wobble : null, avg_hr: type === 'easy' ? 141 : type === 'long' ? 149 : 164,
        rpe: type === 'easy' ? 4 : type === 'long' ? 6 : 7, is_test: false, notes: '', created_at: now,
      })
    })
  }
  runs.push({ id: uid(), plan_id: null, date: shiftDay(key, -10), type: 'race', distance_km: 10, duration_s: 2592, work_pace_s: null, avg_hr: 174, rpe: 9, is_test: true, notes: 'Test de 10K', created_at: now })
  return { race_goals: [goal], run_plan, runs }
}
