/**
 * Swiss simulator. Inside a score group wins and losses cancel out, so only
 * ties, pair-downs, byes and drops are random: simulating *counts per score*
 * instead of individual players makes thousands of runs instant, even with
 * 8 000 players.
 */
import type { TopCutType } from '../types'

export interface SimConfig {
  players: number
  rounds: number
  /** Probability that a match ends in a tie (TCG BO3 ≈ 0.02; 0 for BO1 and VGC). */
  tieRate: number
  /** Players that dropped after each round already played (index 0 = after round 1). */
  drops: number[]
  /** Expected fraction of the remaining players that drops after each future round. */
  dropRate: number
  phase: { rounds: number; threshold: number } | null
  topCut: number
  topCutType: TopCutType
  cap: number
  sims?: number
  seed?: number
}

export interface ScoreLine {
  points: number
  /** Average number of active players finishing with these points. */
  players: number
  /** Probability that a player with these points is in the top cut. */
  qualify: number
  /** Average standing range (1-based). */
  from: number
  to: number
}

export interface SimResult {
  lines: ScoreLine[] // highest score first
  byPoints: Map<number, number>
  /** Fewest points that practically always / sometimes make the cut. */
  safe: number | null
  bubble: number | null
  /** Active players left at the end (average) and seats in the cut (average). */
  active: number
  seats: number
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function binomial(n: number, p: number, rnd: () => number): number {
  if (n <= 0 || p <= 0) return 0
  if (p >= 1) return n
  if (n > 60) {
    // Normal approximation (Box–Muller) is plenty for big groups.
    const z = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())
    return Math.max(0, Math.min(n, Math.round(n * p + z * Math.sqrt(n * p * (1 - p)))))
  }
  let k = 0
  for (let i = 0; i < n; i++) if (rnd() < p) k++
  return k
}

/** One round of Swiss pairings over counts per score. */
export function playRound(counts: Float64Array, tieRate: number, rnd: () => number): Float64Array {
  const next = new Float64Array(counts.length + 3)
  let floater = -1 // score of the player paired down from the group above
  const duel = (a: number, b: number) => {
    const r = rnd()
    if (r < tieRate) {
      next[a + 1]++
      next[b + 1]++
    } else if (r < tieRate + (1 - tieRate) / 2) {
      next[a + 3]++
      next[b]++
    } else {
      next[a]++
      next[b + 3]++
    }
  }
  for (let p = counts.length - 1; p >= 0; p--) {
    let n = counts[p]
    if (!n) continue
    if (floater >= 0) {
      duel(floater, p)
      floater = -1
      n--
    }
    if (n % 2 === 1) {
      floater = p
      n--
    }
    const pairs = n / 2
    const ties = binomial(pairs, tieRate, rnd)
    next[p + 1] += 2 * ties
    next[p + 3] += pairs - ties
    next[p] += pairs - ties
  }
  if (floater >= 0) next[floater + 3]++ // bye
  return next
}

/** Remove `n` players, mostly from the lowest scores (people who are out of contention). */
export function applyDrops(counts: Float64Array, n: number, round: number, rnd: () => number): void {
  let active = 0
  for (const c of counts) active += c
  let left = Math.min(Math.round(n), Math.max(0, active - 2))
  const max = round * 3
  while (left > 0) {
    let sum = 0
    for (let p = 0; p < counts.length; p++) sum += counts[p] * (max - p) ** 2
    if (sum <= 0) return // only undefeated players left: nobody drops
    let batch = 0
    const goal = left
    for (let p = 0; p < counts.length && batch < goal; p++) {
      if (!counts[p] || p >= max) continue
      const want = (goal * counts[p] * (max - p) ** 2) / sum
      const take = Math.min(counts[p], goal - batch, Math.floor(want) + (rnd() < want % 1 ? 1 : 0))
      counts[p] -= take
      batch += take
    }
    left -= batch
    if (!batch) {
      // Rounding left nothing to take: drop one from the bottom.
      const p = counts.findIndex((c) => c > 0)
      if (p < 0) return
      counts[p]--
      left--
    }
  }
}

/** Seats and the chance of one player tied on `points` getting one of them. */
export function cutChance(above: number, equal: number, size: number, type: TopCutType, cap: number): number {
  if (!size || equal <= 0) return 0
  if (type === 'asymmetric') {
    // Everyone tied on points with the Nth player gets in, up to the cap.
    if (above >= size) return 0
    const limit = Math.max(cap, size)
    return above + equal <= limit ? 1 : Math.max(0, (limit - above) / equal)
  }
  if (above >= size) return 0
  return above + equal <= size ? 1 : (size - above) / equal
}

export function simulateSwiss(cfg: SimConfig): SimResult {
  const rounds = Math.max(1, Math.min(30, Math.floor(cfg.rounds)))
  const players = Math.max(2, Math.floor(cfg.players))
  const sims = cfg.sims ?? 600
  const rnd = mulberry32(cfg.seed ?? 20261125)
  const size = rounds * 3 + 1
  const sumCount = new Float64Array(size)
  const sumIn = new Float64Array(size)
  const hypo = new Float64Array(size)
  const sumAbove = new Float64Array(size)
  let seats = 0
  let activeSum = 0

  for (let s = 0; s < sims; s++) {
    let counts = new Float64Array(1)
    counts[0] = players
    for (let r = 1; r <= rounds; r++) {
      counts = playRound(counts, cfg.tieRate, rnd) as Float64Array<ArrayBuffer>
      const known = cfg.drops[r - 1]
      if (r < rounds) {
        let active = 0
        for (const c of counts) active += c
        const n = known !== undefined ? known : binomial(active, cfg.dropRate, rnd)
        if (n > 0) applyDrops(counts, n, r, rnd)
        if (cfg.phase && r === cfg.phase.rounds) for (let p = 0; p < Math.min(counts.length, cfg.phase.threshold); p++) counts[p] = 0
      } else if (known) applyDrops(counts, known, r, rnd)
    }
    let above = 0
    for (let p = size - 1; p >= 0; p--) {
      const c = counts[p] ?? 0
      const chance = cutChance(above, c, cfg.topCut, cfg.topCutType, cfg.cap)
      sumCount[p] += c
      sumIn[p] += chance * c
      seats += chance * c
      // "If I were the only one with this score": used when a score almost never happens.
      hypo[p] += cutChance(above, Math.max(1, c), cfg.topCut, cfg.topCutType, cfg.cap)
      sumAbove[p] += above
      above += c
    }
    activeSum += above
  }

  const lines: ScoreLine[] = []
  const byPoints = new Map<number, number>()
  for (let p = size - 1; p >= 0; p--) {
    const avg = sumCount[p] / sims
    const qualify = sumCount[p] > 0 ? sumIn[p] / sumCount[p] : hypo[p] / sims
    byPoints.set(p, qualify)
    if (avg < 0.005) continue
    const from = sumAbove[p] / sims + 1
    lines.push({ points: p, players: avg, qualify, from, to: from + Math.max(1, avg) - 1 })
  }
  const asc = [...lines].reverse()
  return {
    lines,
    byPoints,
    safe: cfg.topCut ? (asc.find((l) => l.qualify >= 0.99)?.points ?? null) : null,
    bubble: cfg.topCut ? (asc.find((l) => l.qualify >= 0.02)?.points ?? null) : null,
    active: activeSum / sims,
    seats: seats / sims,
  }
}

export interface MyState {
  wins: number
  losses: number
  ties: number
}

/** Distribution of my final points, given my record and my expected win / tie rate. */
export function myFinalPoints(me: MyState, rounds: number, winRate: number, tieRate: number, phase: SimConfig['phase']): Map<number, number> {
  const played = me.wins + me.losses + me.ties
  let dist = new Map<number, number>([[me.wins * 3 + me.ties, 1]])
  const gate = (round: number, d: Map<number, number>) => {
    if (!phase || round !== phase.rounds) return d
    const out = new Map<number, number>()
    for (const [p, v] of d) if (p >= phase.threshold) out.set(p, v)
    return out // whoever is missing here is out: their probability is simply lost
  }
  if (played >= 1) dist = gate(played, dist)
  for (let r = played + 1; r <= rounds; r++) {
    const next = new Map<number, number>()
    const add = (p: number, v: number) => v > 0 && next.set(p, (next.get(p) ?? 0) + v)
    for (const [p, v] of dist) {
      add(p + 3, v * (1 - tieRate) * winRate)
      add(p + 1, v * tieRate)
      add(p, v * (1 - tieRate) * (1 - winRate))
    }
    dist = gate(r, next)
  }
  return dist
}

export const myChance = (dist: Map<number, number>, sim: SimResult) => {
  let c = 0
  for (const [p, v] of dist) c += v * (sim.byPoints.get(p) ?? 0)
  return Math.min(1, c)
}

/** For each possible number of further wins (no ties): final points and chance of making the cut. */
export function scenarios(me: MyState, rounds: number, sim: SimResult, phase: SimConfig['phase'] = null): { wins: number; losses: number; points: number; qualify: number }[] {
  const played = me.wins + me.losses + me.ties
  const left = Math.max(0, rounds - played)
  const out = []
  for (let w = left; w >= 0; w--) {
    const points = (me.wins + w) * 3 + me.ties
    // Can this number of wins reach phase two at all? (best case: win first)
    const firstLeft = phase ? Math.max(0, phase.rounds - played) : 0
    const dead = phase !== null && played <= phase.rounds && me.wins * 3 + me.ties + Math.min(w, firstLeft) * 3 < phase.threshold
    out.push({ wins: w, losses: left - w, points, qualify: dead ? 0 : (sim.byPoints.get(points) ?? 0) })
  }
  return out
}
