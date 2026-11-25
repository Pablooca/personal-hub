import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bracketChances, chances, currentOwp, estimatedRival, recordsBefore, rivalWinPct, simulateField, winPct, winsNeeded, type MyRound } from './standings.ts'
import { simulateSwiss, type SimConfig } from './simulate.ts'
import type { RivalRecord } from '../types.ts'

const rec = (w: number, l: number, t = 0, o: Partial<RivalRecord> = {}): RivalRecord => ({ w, l, t, dropped: false, bye: false, ...o })
const cfg: SimConfig = { players: 64, rounds: 6, tieRate: 0, drops: [], dropRate: 0, phase: null, topCut: 8, topCutType: 'standard', cap: 16, seed: 7 }
const KS = [8, 4, 2]
const opts = { winRate: 0.5, ks: KS, topCutType: 'standard' as const }
const near = (a: number, b: number, e = 0.03) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`)
const won = (n: number, rival: RivalRecord | null = null): MyRound[] => Array.from({ length: n }, () => ({ result: 'win', rival }))

test('win percentage follows the handbook examples', () => {
  assert.deepEqual([winPct(1, 5), winPct(3, 5), winPct(5, 5)], [0.25, 0.6, 1])
  assert.deepEqual([winPct(1, 5, true), winPct(3, 5, true), winPct(5, 5, true)], [0.25, 0.6, 0.75])
  // A bye is neither a win nor a round.
  assert.equal(rivalWinPct(rec(3, 2, 0, { bye: true })), 0.5)
  assert.equal(rivalWinPct(rec(2, 2, 1)), 0.4)
})

test('Op Win %: byes of mine are skipped, missing records are estimated from the Swiss pairing', () => {
  assert.equal(currentOwp([{ result: 'win', rival: rec(1, 1) }, { result: 'bye', rival: null }]), 0.5)
  assert.deepEqual(recordsBefore([{ result: 'win', rival: null }, { result: 'bye', rival: null }, { result: 'loss', rival: null }]), [{ w: 0, l: 0, t: 0 }, { w: 1, l: 0, t: 0 }, { w: 2, l: 0, t: 0 }])
  assert.deepEqual(estimatedRival({ w: 2, l: 0, t: 0 }, 'loss'), rec(3, 0))
  assert.equal(currentOwp([]), null)
})

test('the field agrees with the score simulator and keeps every player', () => {
  const f = simulateField(cfg, 80)
  for (const s of f) assert.equal(s.count.reduce((a, b) => a + b, 0), 64)
  assert.ok(f.every((s) => s.count[18] === 1))
  const avg = f.reduce((a, s) => a + s.count[15], 0) / f.length
  near(avg, simulateSwiss(cfg).lines.find((l) => l.points === 15)!.players, 0.01)
  assert.ok(f.every((s) => s.owp.every((l) => l.every((x) => x >= 0.25 && x <= 1))))
})

test('drops leave the field and cap their win percentage', () => {
  for (const s of simulateField({ ...cfg, drops: [0, 6, 8] }, 30)) assert.equal(s.count.reduce((a, b) => a + b, 0), 50)
})

test('certain and impossible cases', () => {
  const f = simulateField(cfg, 120)
  const first = chances(cfg, f, won(6), opts)
  assert.equal(first.cut, 1)
  assert.deepEqual([...first.swiss.values()], [1, 1, 1])
  near(first.final.get(8)!, 1)
  near(first.final.get(4)!, 0.5, 0.001)
  near(first.final.get(2)!, 0.25, 0.001)
  const last = chances(cfg, f, Array.from({ length: 4 }, () => ({ result: 'loss' as const, rival: null })), opts)
  assert.equal(last.cut, 0)
})

test('at 4-2 (one seat for fifteen) strong opponents make the difference', () => {
  const f = simulateField(cfg, 300)
  const history = (rival: RivalRecord): MyRound[] => (['win', 'win', 'win', 'win', 'loss', 'loss'] as const).map((result) => ({ result, rival }))
  const good = chances(cfg, f, history(rec(5, 1)), opts).cut!
  const bad = chances(cfg, f, history(rec(1, 5)), opts).cut!
  assert.ok(good > 0.75, String(good))
  assert.ok(bad < 0.01, String(bad))
})

test('noting better opponents never lowers the chances, and later rounds matter', () => {
  const f = simulateField(cfg, 200)
  const base: MyRound[] = [...won(3, rec(1, 2)), { result: 'loss', rival: rec(3, 1) }]
  const up: MyRound[] = [...won(3, rec(3, 1)), { result: 'loss', rival: rec(4, 0) }]
  assert.ok(chances(cfg, f, up, opts).cut! >= chances(cfg, f, base, opts).cut!)
  const c = chances(cfg, f, base, opts)
  assert.ok(c.final.get(8)! >= c.final.get(4)! && c.final.get(4)! >= c.final.get(2)!)
  assert.ok(c.rank![0] <= c.rank![1] && c.rank![1] <= c.rank![2])
})

test('without top cut the final result is the Swiss standing', () => {
  const c = { ...cfg, topCut: 0 }
  const r = chances(c, simulateField(c, 60), won(5), opts)
  assert.equal(r.cut, null)
  assert.deepEqual([...r.final], [...r.swiss])
})

test('a smaller cut than K falls back to the Swiss standing for those left out', () => {
  const c = { ...cfg, topCut: 4 }
  const r = chances(c, simulateField(c, 100), won(5), opts)
  near(r.final.get(8)!, r.swiss.get(8)!, 1e-9)
  near(r.final.get(4)!, r.cut!, 1e-9)
})

test('asymmetrical cut: everyone tied with 8th gets in, byes save a match', () => {
  const c: SimConfig = { ...cfg, topCutType: 'asymmetric' }
  const f = simulateField(c, 200)
  const lost: MyRound[] = [{ result: 'loss', rival: null }, { result: 'loss', rival: null }]
  // 22 players with 4-2 or better, at most 16 seats: 9 of the 15 tied ones.
  // Losing late means tougher opponents, so a better tiebreaker than losing early.
  const late = chances(c, f, [...won(4), ...lost], { ...opts, topCutType: 'asymmetric' }).cut!
  const early = chances(c, f, [...lost, ...won(4)], { ...opts, topCutType: 'asymmetric' }).cut!
  assert.ok(late > 0.9 && early < 0.5, `${late} ${early}`)
  assert.equal(winsNeeded(8, 1, 4), 1)
  assert.equal(winsNeeded(12, 1, 8), 0)
  assert.equal(winsNeeded(12, 9, 8), 1)
  assert.equal(winsNeeded(12, 1, 2), 2)
  assert.equal(winsNeeded(4, 6, 8), 0)
})

test('two-phase events: missing the threshold means out', () => {
  const c: SimConfig = { ...cfg, players: 1500, rounds: 13, phase: { rounds: 8, threshold: 16 }, topCutType: 'asymmetric' }
  const f = simulateField(c, 10)
  const out = chances(c, f, Array.from({ length: 4 }, () => ({ result: 'loss' as const, rival: null })), { ...opts, topCutType: 'asymmetric', draws: 200 })
  assert.equal(out.cut, 0)
  assert.equal(out.rank![1], Number.POSITIVE_INFINITY)
})

test('during the top cut only the bracket counts', () => {
  assert.deepEqual([...bracketChances(8, [], 0.5, KS)], [[8, 1], [4, 0.5], [2, 0.25]])
  assert.deepEqual([...bracketChances(8, ['win'], 0.6, KS)], [[8, 1], [4, 1], [2, 0.6]])
  assert.deepEqual([...bracketChances(8, ['win', 'loss'], 0.6, KS)], [[8, 1], [4, 1], [2, 0]])
  assert.deepEqual([...bracketChances(16, ['bye'], 0.5, KS)], [[8, 1], [4, 0.5], [2, 0.25]])
})

test('fast enough for a Regional', () => {
  const t = performance.now()
  const c: SimConfig = { ...cfg, players: 2600, rounds: 14, phase: { rounds: 8, threshold: 16 } }
  chances(c, simulateField(c), won(3), opts)
  assert.ok(performance.now() - t < 4000)
})
