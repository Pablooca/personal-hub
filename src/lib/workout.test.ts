import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HILLS, SERIES_800 } from './workout.samples.ts'
import { highlight, blockPace, defaultBlocks, ensureSections, missingSections, padRunBlocks, sectionOf, blockTime, completion, easyPace, estimate, fmtSeconds, formatWorkout, newBlock, parseAmount, parseRecovery, parseWorkout, repDrift, repsDone, targetPace, toRunBlocks, workPace } from './workout.ts'
import { evaluate, parsePlan, planToCsv } from './running.ts'
import type { RaceGoal, Run, RunPlanSession } from './types.ts'

test('the 800s session written by hand is understood exactly', () => {
  const r = parseWorkout(`5' cal + 4x30" rec 30" + 4x30" prog + 5-6x800 en 4:30 r3' + 5' enf`)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.blocks, SERIES_800.blocks)
})

test('format → parse round trip', () => {
  assert.equal(formatWorkout(SERIES_800.blocks), '5 min cal + 4 × 30 s cortas (rec 30 s) + 4 × 30 s prog + 5–6 × 800 m en 4:30 (rec 3 min) + 5 min enf')
  for (const blocks of [SERIES_800.blocks, [newBlock('warmup'), { ...newBlock('main'), unit: 's' as const, amount: 30 }, newBlock('easy'), newBlock('cooldown')], [{ ...newBlock('main'), amount: 1200, target_kind: 'pace' as const, target_s: 285, recovery_s: 90 }]]) {
    const back = parseWorkout(formatWorkout(blocks))
    assert.deepEqual(back.errors, [])
    assert.deepEqual(back.blocks, blocks)
  }
})

test('other ways of writing it', () => {
  const one = (t: string) => parseWorkout(t).blocks[0]
  assert.deepEqual([one('6x1000 @4:10 r2').target_kind, one('6x1000 @4:10 r2').target_s, one('6x1000 @4:10 r2').recovery_s], ['pace', 250, 120])
  assert.deepEqual([one('3 x 10 min a 5:00/km rec 2 min').amount, one('3 x 10 min a 5:00/km rec 2 min').target_kind], [600, 'pace'])
  assert.equal(one('10x1 km').amount, 1000)
  assert.equal(one('4x30s/30s').recovery_s, 30)
  assert.equal(one('4x30s/30s').kind, 'strides')
  assert.equal(one('4x30s aceleración gradual').kind, 'progressive')
  assert.equal(one('8x400 en 1:45 (rec 1:30 min)').recovery_s, 90)
  assert.deepEqual(parseWorkout('10 min + 6x800 + 10 min').blocks.map((b) => b.kind), ['warmup', 'main', 'cooldown'])
  assert.equal(parseWorkout('bla + 5x800').errors.length, 1)
  assert.equal(parseWorkout('6-5x800').errors.length, 1)
})

test('amounts and recoveries', () => {
  assert.deepEqual(parseAmount('800'), { unit: 'm', amount: 800 })
  assert.deepEqual(parseAmount('1,5 km'), { unit: 'm', amount: 1500 })
  assert.deepEqual(parseAmount("5'"), { unit: 's', amount: 300 })
  assert.deepEqual(parseAmount("30''"), { unit: 's', amount: 30 })
  assert.deepEqual(parseAmount('1:30'), { unit: 's', amount: 90 })
  assert.equal(parseAmount('30'), null)
  assert.equal(parseRecovery('3'), 180)
  assert.equal(parseRecovery('30'), 30)
  assert.equal(parseRecovery('800 m'), null)
  assert.deepEqual([fmtSeconds(30), fmtSeconds(90), fmtSeconds(75), fmtSeconds(180)], ['30 s', '1:30 min', '75 s', '3 min'])
})

test('time per rep and pace are equivalent: 800 m in 4:30 = 5:37.5/km', () => {
  const main = SERIES_800.blocks[3]
  assert.equal(blockPace(main), 337.5)
  assert.equal(blockTime({ ...main, target_kind: 'pace', target_s: 270 }), 216) // 4:30/km → 3:36
  assert.equal(targetPace(SERIES_800.blocks), 338)
  assert.equal(targetPace([newBlock('warmup')]), null)
})

test('recording reps: work pace, completion of 5–6 and drift', () => {
  const blocks = toRunBlocks(SERIES_800.blocks)
  assert.equal(blocks[3].splits.length, 6)
  assert.equal(workPace(blocks), null)
  assert.equal(repsDone(blocks[3]), 5) // ticked without times → the minimum
  blocks[3].splits = [270, 268, 272, 271, 269, null]
  assert.equal(workPace(blocks), 338)
  assert.deepEqual(completion(SERIES_800.blocks, blocks), { done: 5, min: 5, max: 6 })
  assert.equal(completion([], blocks), null)
  assert.ok(Math.abs(repDrift(blocks)!) < 0.01)
  blocks[3].splits = [255, 260, 270, 275, 280, 290]
  assert.ok(repDrift(blocks)! > 0.05)
  blocks[3].done = false
  assert.equal(completion(SERIES_800.blocks, blocks)!.done, 0)
})

test('estimate of the whole session', () => {
  const e = estimate(SERIES_800.blocks, 400)
  // 5' + (4×30 + 3×30) + 4×30 + (5×270 + 4×180) + 5' = 48 min
  assert.equal(e.seconds, 300 + 210 + 120 + 1350 + 720 + 300)
  assert.ok(e.km > 6.5 && e.km < 8, String(e.km))
  const six = toRunBlocks(SERIES_800.blocks)
  six[3].splits = [270, 270, 270, 270, 270, 270]
  assert.equal(estimate(six, 400).seconds, e.seconds + 270 + 180)
})

test('easy pace: median of easy runs, or from the goal', () => {
  const r = (d: string, s: number) => ({ type: 'easy', date: d, distance_km: 1, duration_s: s })
  assert.equal(easyPace([r('2026-01-01', 400), r('2026-01-02', 390), r('2026-01-03', 500)], null), 400)
  assert.equal(easyPace([], 330), 330 * 1.18)
})

const goal: RaceGoal = { id: 'g', name: 'M', date: '2027-04-07', distance_km: 21.097, previous_best_s: null, target_s: 6960, notes: '', created_at: '2026-11-01' }
const plan = (id: string, date: string): RunPlanSession => ({ id, goal_id: 'g', date, type: 'interval', distance_km: 7, pace_s: 338, description: '', blocks: SERIES_800.blocks, created_at: '' })
const run = (id: string, plan_id: string, date: string, splits: (number | null)[]): Run => {
  const blocks = toRunBlocks(SERIES_800.blocks).map((b) => (b.kind === 'main' ? { ...b, splits } : b))
  return { id, plan_id, date, type: 'interval', distance_km: 4, duration_s: 3000, work_pace_s: workPace(blocks), avg_hr: null, rpe: 7, is_test: false, notes: '', blocks, created_at: '' }
}

test('readiness: five good reps of 5–6 fulfil the session even if the total distance is short', () => {
  const r = evaluate(goal, [plan('a', '2026-11-23')], [run('1', 'a', '2026-11-23', [270, 269, 271, 270, 272, null])], '2026-11-25')
  assert.deepEqual([r.key.list[0].ok, r.key.list[0].reps], [true, { done: 5, min: 5, max: 6 }])
})

test('readiness: missing reps and slow reps are flagged', () => {
  const r = evaluate(goal, [plan('a', '2026-11-18'), plan('b', '2026-11-23')], [run('1', 'a', '2026-11-18', [270, 270, 270, null, null, null]), run('2', 'b', '2026-11-23', [290, 295, 290, 292, 291, 290])], '2026-11-25')
  assert.deepEqual(r.key.list.map((k) => k.ok), [false, false])
  assert.ok(r.alerts.some((a) => a.text.includes('no completaste')))
})

test('the structure travels in the plan CSV and JSON', () => {
  const csv = planToCsv([plan('a', '2026-11-25')])
  const back = parsePlan(csv)
  assert.deepEqual(back.errors, [])
  assert.deepEqual(back.sessions[0].blocks, SERIES_800.blocks)
  const j = parsePlan('[{"fecha":"2026-11-25","tipo":"series","km":7,"estructura":"5\' + 5-6x800 en 4:30 r3\' + 5\'"}]')
  assert.equal(j.sessions[0].blocks.length, 3)
  assert.equal(j.sessions[0].pace_s, 338)
})

test('every session has warm-up, main part and cool-down', () => {
  for (const type of ['easy', 'interval', 'tempo', 'long', 'race'] as const) {
    const blocks = defaultBlocks(type, 10, 330, 400)
    assert.deepEqual(blocks.map(sectionOf), ['warmup', 'main', 'cooldown'])
    assert.equal(targetPace(blocks), 330)
    assert.ok(Math.abs(estimate(blocks, 400).km - 10) < 0.2, `${type} ${estimate(blocks, 400).km}`)
  }
  assert.deepEqual(ensureSections(parseWorkout('6x800 en 4:30 r3').blocks).map((b) => b.kind), ['warmup', 'main', 'cooldown'])
  assert.deepEqual(missingSections(parseWorkout('6x800').blocks), ['warmup', 'cooldown'])
  assert.deepEqual(missingSections(SERIES_800.blocks), [])
})

test('a long run is judged by distance and its main-part pace', () => {
  const blocks = defaultBlocks('long', 16, 380, 400)
  const p: RunPlanSession = { ...plan('l', '2026-11-22'), type: 'long', distance_km: 16, pace_s: 380, blocks }
  const b = toRunBlocks(blocks)
  b[1].splits = [Math.round((b[1].amount / 1000) * 382)]
  const done = (km: number): Run => ({ ...run('r', 'l', '2026-11-22', []), type: 'long', distance_km: km, duration_s: km * 385, work_pace_s: workPace(b), blocks: b })
  assert.equal(workPace(b), 382)
  // Saved without times → the fields come back when it is reopened.
  assert.equal(padRunBlocks(toRunBlocks(SERIES_800.blocks).map((x) => ({ ...x, splits: [] })))[3].splits.length, 6)
  assert.equal(evaluate(goal, [p], [done(16)], '2026-11-25').key.list[0].ok, true)
  assert.equal(evaluate(goal, [p], [done(10)], '2026-11-25').key.list[0].ok, false)
})

test('hill reps: 15 s up, 1 min recovery, 15 s down', () => {
  const want = HILLS.blocks[1]
  assert.deepEqual([want.amount, want.hill], [15, { recovery_s: 60, down: 15 }])
  assert.equal(formatWorkout(HILLS.blocks), '5 min cal + 6 × 15 s subida, rec 1 min, 15 s bajada + 5 min enf')
  assert.deepEqual(parseWorkout(formatWorkout(HILLS.blocks)).blocks, HILLS.blocks)
  // As it was described, word for word.
  assert.deepEqual(parseWorkout('6 x 15 segundos ascendente, 1 minuto de recuperación y 15 segundos descendente').blocks, [want])
  assert.deepEqual(parseWorkout(`8-10x15" subida rec 1' 15" bajada (rec 2')`).blocks[0], { ...want, reps: 8, reps_max: 10, recovery_s: 120 })
  const metres = { ...want, unit: 'm' as const, amount: 60, hill: { recovery_s: null, down: 60 } }
  assert.deepEqual(parseWorkout(formatWorkout([metres])).blocks, [metres])
  assert.equal(parseWorkout('6x cuesta').errors.length, 1)
})

test('hill reps are counted, not timed', () => {
  const blocks = toRunBlocks(HILLS.blocks)
  assert.deepEqual(blocks[1].splits, [])
  assert.equal(workPace(blocks), null)
  assert.equal(targetPace(HILLS.blocks), null)
  assert.deepEqual(completion(HILLS.blocks, blocks), { done: 6, min: 6, max: 6 })
  blocks[1].reps_done = 4
  assert.equal(completion(HILLS.blocks, blocks)!.done, 4)
  assert.deepEqual(highlight(blocks).map((b) => b.kind), ['hills'])
  assert.deepEqual(missingSections(HILLS.blocks), [])
  // 5 min + 6 × (15 + 60 + 15) + 5 min
  assert.equal(estimate(HILLS.blocks, 400).seconds, 300 + 540 + 300)
  const p: RunPlanSession = { ...plan('h', '2026-11-22'), pace_s: null, blocks: HILLS.blocks }
  const done = (n: number): Run => ({ ...run('r', 'h', '2026-11-22', []), work_pace_s: null, blocks: toRunBlocks(HILLS.blocks).map((b) => (b.kind === 'hills' ? { ...b, reps_done: n } : b)) })
  assert.equal(evaluate(goal, [p], [done(6)], '2026-11-25').key.list[0].ok, true)
  assert.equal(evaluate(goal, [p], [done(4)], '2026-11-25').key.list[0].ok, false)
})

test('a session can mix 800s and hills', () => {
  const mix = parseWorkout("5' + 3x800 en 4:30 r3' + 4x15s subida, rec 1 min, 15s bajada + 5'").blocks
  assert.deepEqual(mix.map((b) => b.kind), ['warmup', 'main', 'hills', 'cooldown'])
  assert.equal(completion(mix, toRunBlocks(mix))!.done, 7)
  assert.equal(targetPace(mix), 338)
})
