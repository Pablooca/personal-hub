import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, fmtDuration, fmtKm, fmtPace, goalPace, matchRuns, parseDate, parseDuration, parsePace, parsePlan, parseRunType, planToCsv, project, riegel, weekOf } from './running.ts'
import type { RaceGoal, Run, RunPlanSession, RunType } from './types.ts'

const goal: RaceGoal = { id: 'g', name: 'Media', date: '2027-01-31', distance_km: 21.097, previous_best_s: null, target_s: 5700, notes: '', created_at: '2026-11-01T00:00:00Z' }
let n = 0
const P = (date: string, type: RunType, km: number, pace: number | null = null): RunPlanSession => ({ id: `p${++n}`, goal_id: 'g', date, type, distance_km: km, pace_s: pace, description: '', created_at: '' })
const R = (date: string, type: RunType, km: number, s: number, o: Partial<Run> = {}): Run => ({ id: `r${++n}`, plan_id: null, date, type, distance_km: km, duration_s: s, work_pace_s: null, avg_hr: null, rpe: null, is_test: false, notes: '', created_at: '', ...o })

test('durations and paces', () => {
  assert.equal(parseDuration('1:35:00'), 5700)
  assert.equal(parseDuration('45:20'), 2720)
  assert.equal(parseDuration('45'), 2700)
  assert.equal(parseDuration('1h45'), 6300)
  assert.equal(parseDuration('1:75'), null)
  assert.equal(parseDuration('abc'), null)
  assert.equal(parsePace('5:30/km'), 330)
  assert.equal(parsePace("4'05"), 245)
  assert.equal(parsePace('5,5'), 330)
  assert.equal(parsePace('0:30'), null)
  assert.equal(fmtDuration(5700), '1:35:00')
  assert.equal(fmtPace(299.6), '5:00')
  assert.deepEqual([fmtKm(40.75), fmtKm(21.097), fmtKm(38.716), fmtKm(8)], ['40,8', '21,097', '38,7', '8'])
  assert.equal(fmtPace(goalPace(goal)), '4:30')
})

test('Riegel: 10K in 45:00 → half ≈ 1:39:17', () => {
  assert.ok(Math.abs(riegel(2700, 10, 21.0975) - 5957) < 2)
  assert.equal(Math.round(riegel(2700, 10, 10)), 2700)
})

test('plan import: CSV with ; and decimal comma, Spanish types and dates', () => {
  const r = parsePlan('Fecha;Tipo;Distancia (km);Ritmo;Descripción\n01/12/2026;Rodaje suave;8,5;5:40;"fácil; sin reloj"\n2026-12-03;Series;10;4:10;6x1000\n2026-12-06;Tirada larga;16;;\n32/12/2026;Tempo;8;;\n2026-12-07;Natación;2;;')
  assert.equal(r.sessions.length, 3)
  assert.deepEqual(r.sessions[0], { date: '2026-12-01', type: 'easy', distance_km: 8.5, pace_s: 340, description: 'fácil; sin reloj' })
  assert.deepEqual(r.sessions.map((s) => s.type), ['easy', 'interval', 'long'])
  assert.equal(r.errors.length, 2)
})

test('plan import: JSON, headerless CSV, and CSV round trip', () => {
  const j = parsePlan('{"sessions":[{"date":"2026-12-01","type":"tempo","distance_km":9,"pace":"4:30"}]}')
  assert.deepEqual(j.sessions[0], { date: '2026-12-01', type: 'tempo', distance_km: 9, pace_s: 270, description: '' })
  assert.equal(parsePlan('2026-12-01,easy,8,5:30').sessions.length, 1)
  assert.deepEqual(parsePlan(planToCsv(j.sessions)).sessions, j.sessions)
  assert.ok(parsePlan('{nope').errors.length)
  assert.ok(parsePlan('').errors.length)
})

test('types and dates', () => {
  assert.equal(parseRunType('Umbral 3x10'), 'tempo')
  assert.equal(parseRunType('Tirada larga'), 'long')
  assert.equal(parseDate('2026-02-30'), null)
  assert.equal(weekOf('2026-11-25'), '2026-11-23')
  assert.equal(weekOf('2026-11-29'), '2026-11-23')
})

test('runs match their session by link, then by day, preferring the same type', () => {
  const a = P('2026-11-02', 'easy', 8)
  const b = P('2026-11-02', 'long', 16)
  const c = P('2026-11-04', 'tempo', 9)
  const r1 = R('2026-11-02', 'long', 16, 5000)
  const r2 = R('2026-11-05', 'tempo', 9, 2500, { plan_id: c.id })
  const m = matchRuns([a, b, c], [r1, r2])
  assert.equal(m.get(b.id)?.id, r1.id)
  assert.equal(m.get(c.id)?.id, r2.id)
  assert.equal(m.has(a.id), false)
})

test('projection: best recent continuous effort; intervals and old runs do not count', () => {
  const today = '2026-11-25'
  const runs = [R('2026-11-10', 'race', 10, 2600, { is_test: true }), R('2026-11-12', 'interval', 10, 2000), R('2026-06-01', 'race', 10, 2300), R('2026-11-14', 'easy', 8, 2700)]
  const p = project(goal, runs, today)!
  assert.equal(p.run.duration_s, 2600)
  assert.ok(p.gap > 0 && !p.lowConfidence)
  assert.equal(project(goal, [], today), null)
  assert.ok(project(goal, [R('2026-11-20', 'race', 3, 720)], today)!.lowConfidence)
})

const block = (paces: { tempo: number; long: number }) => {
  const plan: RunPlanSession[] = []
  for (const monday of ['2026-11-02', '2026-11-09', '2026-11-16']) {
    const d = (k: number) => `2026-11-${String(Number(monday.slice(8)) + k).padStart(2, '0')}`
    plan.push(P(d(1), 'easy', 8, 340), P(d(3), 'tempo', 10, paces.tempo), P(d(6), 'long', 16, paces.long))
  }
  plan.push(P('2026-12-01', 'easy', 8), P('2026-12-06', 'long', 18))
  return plan
}

test('everything done at the planned pace and a projection under the goal → green', () => {
  const plan = block({ tempo: 270, long: 320 })
  const runs = plan.filter((p) => p.date < '2026-11-25').map((p) => R(p.date, p.type, p.distance_km, p.distance_km * p.pace_s!, { plan_id: p.id, rpe: 5 }))
  runs.push(R('2026-11-23', 'race', 10, 2520, { is_test: true, rpe: 7 }))
  const r = evaluate(goal, plan, runs, '2026-11-25')
  assert.equal(r.light, 'green')
  assert.equal(r.adherence.pct, 100)
  assert.equal(r.key.pct, 100)
  assert.deepEqual([r.key.long, r.key.quality], [{ due: 3, done: 3 }, { due: 3, done: 3 }])
  assert.ok(r.projection!.gap < 0)
  assert.deepEqual([r.volume.remainingKm, r.volume.remainingSessions, r.volume.weeklyRemaining], [26, 2, 26])
  assert.deepEqual(r.alerts, [])
})

test('half the sessions missed and far from the goal pace → red, with alerts', () => {
  const plan = block({ tempo: 270, long: 320 })
  const runs = plan.filter((p) => p.date < '2026-11-25' && p.type === 'easy').map((p) => R(p.date, 'easy', 8, 8 * 360, { rpe: 8 }))
  const r = evaluate(goal, plan, runs, '2026-11-25')
  assert.equal(r.light, 'red')
  assert.ok(r.alerts.some((a) => a.text.includes('sesiones clave')))
  assert.ok(r.alerts.some((a) => a.text.includes('Fatiga acumulada: 3')))
})

test('good adherence with a goal pace more than 3 % away is never green', () => {
  const plan = block({ tempo: 270, long: 320 })
  const runs = plan.filter((p) => p.date < '2026-11-25').map((p) => R(p.date, p.type, p.distance_km, p.distance_km * p.pace_s!, { plan_id: p.id, rpe: 5 }))
  const r = evaluate({ ...goal, target_s: 5300 }, plan, runs, '2026-11-25')
  assert.equal(r.light, 'amber')
})

test('slow key sessions raise a pace alert; the recorded work pace is what counts for intervals', () => {
  const plan = [P('2026-11-10', 'interval', 10, 250), P('2026-11-17', 'interval', 10, 250), P('2026-11-24', 'interval', 10, 250)]
  const runs = plan.map((p, i) => R(p.date, 'interval', 10, 3300, { plan_id: p.id, work_pace_s: i ? 268 : 250 }))
  const r = evaluate(goal, plan, runs, '2026-11-25')
  assert.deepEqual(r.key.list.map((k) => k.ok), [true, false, false])
  assert.ok(r.alerts.some((a) => a.text.includes('más lentas')))
})

test('no data → no verdict; today’s pending session is not missed yet', () => {
  assert.equal(evaluate(goal, [], [], '2026-11-25').light, 'none')
  const r = evaluate(goal, [P('2026-11-25', 'easy', 8)], [], '2026-11-25')
  assert.equal(r.adherence.due, 0)
  assert.equal(r.volume.remainingSessions, 1)
})
