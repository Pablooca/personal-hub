/**
 * Final standing chances with the real tiebreaker (Op Win %).
 * The field is simulated player by player; my own opponents use the records I noted.
 */
import type { RivalRecord, RoundResult, TopCutType } from '../types'
import { mulberry32, type SimConfig } from './simulate.ts'

/** Handbook 5.3.3.1: wins ÷ rounds, 25 %–100 % (75 % after dropping); byes are ignored. */
export function winPct(wins: number, rounds: number, dropped = false): number {
  if (rounds <= 0) return 0.25
  return Math.min(dropped ? 0.75 : 1, Math.max(0.25, wins / rounds))
}
export const recordRounds = (r: RivalRecord) => r.w + r.l + r.t
export function rivalWinPct(r: RivalRecord): number {
  const bye = r.bye && r.w > 0 ? 1 : 0
  return winPct(r.w - bye, recordRounds(r) - bye, r.dropped)
}

// --------------------------------------------------------------------- field
export interface FieldSim {
  /** Active players per final score. */
  count: Int32Array
  /** Op Win % of the players on each score, ascending. */
  owp: Float64Array[]
}

export function simulateField(cfg: SimConfig, sims?: number): FieldSim[] {
  const n = Math.max(2, Math.floor(cfg.players))
  const R = Math.max(1, Math.min(30, Math.floor(cfg.rounds)))
  const runs = sims ?? Math.max(60, Math.min(500, Math.floor(1_600_000 / (n * R))))
  const rnd = mulberry32(cfg.seed ?? 20261125)
  const out: FieldSim[] = []
  const opp = new Int32Array(n * R)

  for (let s = 0; s < runs; s++) {
    const pts = new Int32Array(n)
    const wins = new Int32Array(n) // without byes
    const rounds = new Int32Array(n) // without byes
    const met = new Int32Array(n)
    const gone = new Uint8Array(n) // 1 dropped · 2 did not reach phase two
    let active = Array.from({ length: n }, (_, i) => i)

    for (let r = 1; r <= R; r++) {
      // Score groups, shuffled inside.
      const groups: number[][] = Array.from({ length: r * 3 + 1 }, () => [])
      for (const p of active) groups[pts[p]].push(p)
      const queue: number[] = []
      for (let g = groups.length - 1; g >= 0; g--) {
        const list = groups[g]
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1))
          ;[list[i], list[j]] = [list[j], list[i]]
        }
        queue.push(...list)
      }
      for (let i = 0; i + 1 < queue.length; i += 2) {
        const [a, b] = [queue[i], queue[i + 1]]
        opp[a * R + met[a]++] = b
        opp[b * R + met[b]++] = a
        rounds[a]++
        rounds[b]++
        const x = rnd()
        if (x < cfg.tieRate) {
          pts[a]++
          pts[b]++
        } else {
          const w = x < cfg.tieRate + (1 - cfg.tieRate) / 2 ? a : b
          pts[w] += 3
          wins[w]++
        }
      }
      if (queue.length % 2) pts[queue[queue.length - 1]] += 3 // bye
      if (r === R) break
      const known = cfg.drops[r - 1]
      let drop = known !== undefined ? known : Math.round(active.length * cfg.dropRate)
      drop = Math.min(drop, Math.max(0, active.length - 2))
      for (let guard = 0; drop > 0 && guard < n * 30; guard++) {
        const p = active[Math.floor(rnd() * active.length)]
        // Players with more losses are the ones who leave.
        if (!gone[p] && rnd() < ((r * 3 - pts[p]) / (r * 3)) ** 2) {
          gone[p] = 1
          drop--
        }
      }
      if (cfg.phase && r === cfg.phase.rounds) for (const p of active) if (!gone[p] && pts[p] < cfg.phase.threshold) gone[p] = 2
      active = active.filter((p) => !gone[p])
    }

    const size = R * 3 + 1
    const count = new Int32Array(size)
    const lists: number[][] = Array.from({ length: size }, () => [])
    for (const p of active) {
      let sum = 0
      for (let k = 0; k < met[p]; k++) {
        const o = opp[p * R + k]
        sum += winPct(wins[o], rounds[o], gone[o] === 1)
      }
      count[pts[p]]++
      lists[pts[p]].push(met[p] ? sum / met[p] : 0)
    }
    out.push({ count, owp: lists.map((l) => Float64Array.from(l).sort()) })
  }
  return out
}

// ------------------------------------------------------------------------ me
export interface MyRound {
  result: RoundResult
  /** What I know about that opponent; null = not noted. */
  rival: RivalRecord | null
}

export interface Chances {
  /** Probability of making the top cut (null when there is none). */
  cut: number | null
  /** Swiss standing in the first K. */
  swiss: Map<number, number>
  /** Final result of the event in the first K (after the top cut). */
  final: Map<number, number>
  /** Likely Swiss standing: 10 %, 50 % and 90 %. */
  rank: [number, number, number] | null
  /** Expected final Op Win %. */
  owp: number | null
}

/** Record of an opponent right after our match, assuming Swiss pairing (same score as me). */
export function estimatedRival(before: { w: number; l: number; t: number }, mine: RoundResult): RivalRecord {
  return {
    w: before.w + (mine === 'loss' ? 1 : 0),
    l: before.l + (mine === 'win' ? 1 : 0),
    t: before.t + (mine === 'tie' ? 1 : 0),
    dropped: false,
    bye: false,
  }
}

/** My record before each of my rounds. */
export function recordsBefore(rounds: readonly MyRound[]) {
  const acc = { w: 0, l: 0, t: 0 }
  return rounds.map((r) => {
    const before = { ...acc }
    if (r.result === 'win' || r.result === 'bye') acc.w++
    else if (r.result === 'loss') acc.l++
    else acc.t++
    return before
  })
}

/** Current Op Win % with what I noted (estimates fill the gaps). */
export function currentOwp(rounds: readonly MyRound[]): number | null {
  const before = recordsBefore(rounds)
  const list = rounds.flatMap((r, i) => (r.result === 'bye' ? [] : [rivalWinPct(r.rival ?? estimatedRival(before[i], r.result))]))
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null
}

const log2 = Math.log2

/** Match wins needed from a cut of `m` players to be in the last `k`, for a given seed. */
export function winsNeeded(m: number, seed: number, k: number): number {
  if (k >= m) return seed <= k ? 0 : Number.POSITIVE_INFINITY
  const bracket = 2 ** Math.ceil(log2(Math.max(2, m)))
  const bye = seed <= bracket - m ? 1 : 0
  return Math.max(0, Math.round(log2(bracket / k)) - bye)
}

export function chances(
  cfg: SimConfig,
  field: readonly FieldSim[],
  mine: readonly MyRound[],
  opts: { winRate: number; ks: readonly number[]; topCutType: TopCutType; draws?: number; seed?: number },
): Chances {
  const R = cfg.rounds
  const rnd = mulberry32(opts.seed ?? 4242)
  const perField = Math.max(1, Math.ceil((opts.draws ?? 4000) / field.length))
  const before = recordsBefore(mine)
  const swiss = new Map(opts.ks.map((k) => [k, 0]))
  const final = new Map(opts.ks.map((k) => [k, 0]))
  const ranks: number[] = []
  let inCut = 0
  let owpSum = 0
  let total = 0
  const w0 = (1 - cfg.tieRate) / 2

  /** Win % at the end of an opponent whose record is known up to now. */
  const finish = (rec: RivalRecord): number => {
    if (rec.dropped) return rivalWinPct(rec)
    let { w, l, t } = rec
    for (let g = w + l + t; g < R; g++) {
      if (cfg.phase && g === cfg.phase.rounds && w * 3 + t < cfg.phase.threshold) break
      const x = rnd()
      if (x < w0) w++
      else if (x < 2 * w0) l++
      else t++
    }
    return rivalWinPct({ ...rec, w, l, t })
  }

  for (const sim of field) {
    for (let d = 0; d < perField; d++) {
      total++
      const me = { w: 0, l: 0, t: 0 }
      let sum = 0
      let opps = 0
      let out = false
      for (let r = 0; r < R; r++) {
        const known = mine[r]
        if (cfg.phase && r === cfg.phase.rounds && me.w * 3 + me.t < cfg.phase.threshold) {
          out = true
          break
        }
        let result: RoundResult
        if (known) result = known.result
        else {
          const x = rnd()
          result = x < cfg.tieRate ? 'tie' : x < cfg.tieRate + (1 - cfg.tieRate) * opts.winRate ? 'win' : 'loss'
        }
        if (result !== 'bye') {
          sum += finish(known?.rival ?? estimatedRival(known ? before[r] : me, result))
          opps++
        }
        if (result === 'win' || result === 'bye') me.w++
        else if (result === 'loss') me.l++
        else me.t++
      }
      const owp = opps ? sum / opps : 0
      owpSum += owp
      if (out) {
        ranks.push(Number.POSITIVE_INFINITY)
        continue
      }
      const points = me.w * 3 + me.t
      let above = 0
      let players = 0
      for (let p = 0; p < sim.count.length; p++) {
        players += sim.count[p]
        if (p > points) above += sim.count[p]
      }
      const list = sim.owp[points] ?? new Float64Array()
      // How many of those tied with me have a better Op Win %.
      let lo = 0
      let hi = list.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (list[mid] <= owp) lo = mid + 1
        else hi = mid
      }
      // One of the simulated players is me: leave one out of my score group.
      const better = list.length ? ((list.length - lo) * (list.length - 1)) / list.length : 0
      const rank = 1 + above + Math.floor(better) + (rnd() < better % 1 ? 1 : 0)
      ranks.push(rank)

      // Players in the cut, and whether I am one of them.
      let m = 0
      let made = false
      if (cfg.topCut) {
        if (opts.topCutType === 'asymmetric') {
          let seen = 0
          let line = 0
          for (let p = sim.count.length - 1; p >= 0; p--) {
            seen += sim.count[p]
            if (seen >= cfg.topCut) {
              line = p
              break
            }
          }
          m = Math.min(Math.max(cfg.cap, cfg.topCut), Math.max(seen, cfg.topCut))
          made = above < cfg.topCut && points >= line && rank <= m
        } else {
          m = Math.min(cfg.topCut, players)
          made = rank <= m
        }
        if (made) inCut++
      }
      for (const k of opts.ks) {
        if (rank <= k) swiss.set(k, swiss.get(k)! + 1)
        if (!cfg.topCut) {
          if (rank <= k) final.set(k, final.get(k)! + 1)
        } else if (made) final.set(k, final.get(k)! + opts.winRate ** winsNeeded(m, rank, k))
        else if (k > m && rank <= k) final.set(k, final.get(k)! + 1)
      }
    }
  }
  ranks.sort((a, b) => a - b)
  const q = (x: number) => ranks[Math.min(ranks.length - 1, Math.floor(ranks.length * x))]
  const norm = (map: Map<number, number>) => new Map([...map].map(([k, v]) => [k, v / total]))
  return {
    cut: cfg.topCut ? inCut / total : null,
    swiss: norm(swiss),
    final: norm(final),
    rank: ranks.length ? [q(0.1), q(0.5), q(0.9)] : null,
    owp: mine.length || R ? owpSum / total : null,
  }
}

/** Once the top cut is being played only the bracket matters. */
export function bracketChances(size: number, results: readonly RoundResult[], winRate: number, ks: readonly number[]): Map<number, number> {
  let left = 2 ** Math.ceil(log2(Math.max(2, size)))
  let out = false
  for (const r of results) {
    if (r === 'loss') {
      out = true
      break
    }
    left = Math.max(1, left / 2)
  }
  return new Map(ks.map((k) => [k, k >= left ? 1 : out ? 0 : winRate ** Math.round(log2(left / k))]))
}
