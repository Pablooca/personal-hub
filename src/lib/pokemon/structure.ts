/**
 * Official tournament structures and Championship Points.
 *  - Rounds: Play! Pokémon Tournament Rules Handbook (May 2026), §5.5.4 variants 1, 2, 3 and 5.
 *  - Asymmetrical top cut caps (TCG 16 / VGC 32): Q3 2026 rules update (1 Sep 2026).
 *  - CP: 2027 season tables. Kickers count attendance in your age division.
 */
import type { PokemonGame, TopCutType, TournamentCategory } from '../types'

export type EventKind = 'league_challenge' | 'league_cup' | 'major' | 'online'

export interface Structure {
  variant: string
  /** Total Swiss rounds (both phases). */
  swiss: number
  /** Two-day events: who keeps playing after phase one. */
  phase: { rounds: number; threshold: number } | null
  /** 0 = no top cut. */
  topCut: number
  topCutType: TopCutType
}

export const MIN_PLAYERS = 4

/** [max players, Swiss rounds, single-elimination rounds] */
type Row = [number, number, number]
const VG_SINGLE: Row[] = [[7, 3, 0], [8, 3, 1], [16, 4, 2], [32, 5, 3], [64, 6, 3], [128, 7, 3], [226, 8, 3], [256, 8, 4], [409, 9, 4], [512, 9, 5], [Infinity, 10, 5]]
const TCG_SWISS: Row[] = [[8, 3, 0], [16, 4, 0], [32, 5, 0], [64, 6, 0], [128, 7, 0], [256, 8, 0], [512, 9, 0], [Infinity, 10, 0]]
const TCG_SINGLE: Row[] = [[8, 3, 0], [12, 4, 2], [20, 5, 2], [32, 5, 3], [64, 6, 3], [128, 7, 3], [226, 8, 3], [409, 9, 3], [Infinity, 10, 3]]
/** [max players, total Swiss, phase-one rounds, match points to reach phase two, asymmetrical top N] */
const TWO_PHASE: [number, number, number, number | null, number][] = [
  [8, 3, 3, null, 0], [16, 4, 4, null, 2], [32, 6, 6, null, 4], [64, 7, 7, null, 6], [128, 9, 7, 13, 8], [256, 10, 8, 16, 8],
  [512, 11, 8, 16, 8], [1024, 12, 8, 16, 8], [2048, 13, 8, 16, 8], [4096, 14, 8, 16, 8], [Infinity, 15, 9, 19, 8],
]

export const asymmetricCap = (game: PokemonGame) => (game === 'tcg' ? 16 : 32)

export const naturalRounds = (players: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, players))))

export function structureFor(game: PokemonGame, kind: EventKind, players: number): Structure | null {
  if (!Number.isFinite(players) || players < MIN_PLAYERS) return null
  const n = Math.floor(players)
  const single = (rows: Row[], variant: string): Structure => {
    const r = rows.find((x) => n <= x[0])!
    return { variant, swiss: r[1], phase: null, topCut: r[2] ? 2 ** r[2] : 0, topCutType: 'standard' }
  }
  if (kind === 'major') {
    const r = TWO_PHASE.find((x) => n <= x[0])!
    return {
      variant: 'Variante 5 · Dos fases',
      swiss: r[1],
      phase: r[3] === null ? null : { rounds: r[2], threshold: r[3] },
      topCut: r[4],
      topCutType: 'asymmetric',
    }
  }
  if (kind === 'online') {
    // No official table: natural Swiss and the usual cut for the size. Always editable.
    const topCut = n < 9 ? 0 : n <= 16 ? 4 : n <= 128 ? 8 : n <= 256 ? 16 : 32
    return { variant: 'Online · suizo natural', swiss: naturalRounds(n), phase: null, topCut, topCutType: 'standard' }
  }
  if (game === 'vgc') return single(VG_SINGLE, 'Variante 1 · VGC en un día')
  return kind === 'league_challenge' ? single(TCG_SWISS, 'Variante 2 · TCG solo suizo') : single(TCG_SINGLE, 'Variante 3 · TCG en un día')
}

export function eventKind(category: TournamentCategory, mode: 'in_person' | 'online'): EventKind {
  if (category === 'regional' || category === 'special' || category === 'international' || category === 'worlds') return 'major'
  if (category === 'league_challenge') return 'league_challenge'
  if (category === 'league_cup') return 'league_cup'
  return mode === 'online' ? 'online' : 'league_cup'
}

export const pointsOf = (wins: number, ties: number) => wins * 3 + ties

/** Points → most natural W-L-T record over `rounds` (ties only when the points force them). */
export function recordFor(points: number, rounds: number): { w: number; l: number; t: number } | null {
  const w = Math.floor(points / 3)
  const t = points % 3
  return w + t > rounds ? null : { w, l: rounds - w - t, t }
}

// --------------------------------------------------------------------- CP
/** [last place of the bracket, CP, kicker] */
type Cp = [number, number, number]
const LC: Cp[] = [[1, 15, 0], [2, 12, 4], [4, 10, 8], [8, 8, 14], [16, 6, 25], [32, 4, 48]]
const CUP: Cp[] = [[1, 50, 0], [2, 40, 4], [4, 32, 8], [8, 25, 17], [16, 20, 48], [32, 16, 80], [64, 13, 128]]
const REGIONAL: Cp[] = [[1, 350, 0], [2, 325, 4], [4, 300, 8], [8, 280, 17], [16, 200, 33], [32, 160, 65], [64, 120, 129], [128, 80, 257], [256, 60, 513], [512, 45, 1025], [1024, 22, 2049]]
const INTER: Cp[] = [[1, 500, 0], [2, 480, 4], [4, 420, 8], [8, 380, 17], [16, 300, 33], [32, 240, 65], [64, 180, 129], [128, 140, 257], [256, 100, 513], [512, 85, 1025], [1024, 42, 2049]]
const CHALLENGE: Cp[] = [[1, 75, 0], [2, 65, 8], [4, 54, 17], [8, 52, 33], [16, 25, 48], [32, 13, 65], [64, 11, 128], [128, 7, 257], [256, 5, 513], [512, 4, 1025], [1024, 3, 2049]]

export const CP_TABLES: Partial<Record<TournamentCategory, Cp[]>> = {
  league_challenge: LC, league_cup: CUP, regional: REGIONAL, special: REGIONAL, international: INTER, global_challenge: CHALLENGE, grand_challenge: CHALLENGE,
}

/** CP for a final placement; `null` when the event gives none or data is missing. */
export function cpFor(category: TournamentCategory, placement: number | null, players: number | null): number | null {
  const table = CP_TABLES[category]
  if (!table || !placement || !players) return null
  // Not enough attendance for my bracket → no CP for it.
  const row = table.find((r) => placement <= r[0])
  return row && players >= row[2] ? row[1] : 0
}

// --------------------------------------------------------------- placement
export const PLACEMENT_BRACKETS = [1, 2, 4, 8, 16, 32, 64, 256, 1024] as const
export const bracketLabel = (b: number) => (b === 1 ? 'Campeón' : b === 2 ? 'Finalista' : `Top ${b}`)
/** Bracket of an exact position; null beyond the last one. */
export const bracketOf = (position: number): number | null => PLACEMENT_BRACKETS.find((b) => position <= b) ?? null
/** Positions a bracket covers: Top 8 = 5th–8th. */
export function bracketRange(b: number): [number, number] {
  const i = PLACEMENT_BRACKETS.indexOf(b as (typeof PLACEMENT_BRACKETS)[number])
  return [i > 0 ? PLACEMENT_BRACKETS[i - 1] + 1 : 1, b]
}
/** "Top 8 · 6.º", "Campeón", "Top 32"… */
export function placementLabel(t: { placement: number | null; placement_bracket?: number | null }): string | null {
  const b = t.placement_bracket ?? (t.placement ? bracketOf(t.placement) : null)
  if (!b) return t.placement ? `${t.placement}.º` : null
  return b <= 2 || !t.placement ? bracketLabel(b) : `${bracketLabel(b)} · ${t.placement}.º`
}

/**
 * CP from what is known about the final placement. A bracket can span two CP tiers
 * (Top 256 = 65th–256th): then both are returned and nothing should be auto-filled.
 */
export function cpForPlacement(category: TournamentCategory, bracket: number | null, position: number | null, players: number | null): { min: number; max: number } | null {
  if (position) {
    const cp = cpFor(category, position, players)
    return cp === null ? null : { min: cp, max: cp }
  }
  if (!bracket) return null
  const [a, b] = bracketRange(bracket).map((p) => cpFor(category, p, players))
  return a === null || b === null ? null : { min: Math.min(a, b), max: Math.max(a, b) }
}

export const CATEGORY_LABELS: Record<TournamentCategory, string> = {
  league_challenge: 'League Challenge',
  league_cup: 'League Cup',
  regional: 'Regional Championship',
  special: 'Special Championship',
  international: 'International Championship',
  worlds: 'World Championship',
  global_challenge: 'Global Challenge',
  grand_challenge: 'Grand Challenge',
  online: 'Torneo online',
  local: 'Torneo local / tienda',
  other: 'Otro',
}

/** "Final", "Semifinal", "Cuartos"… for elimination round `number` of a bracket of `size`. */
export function cutRoundLabel(size: number | null, number: number): string {
  if (!size) return `Top Cut ${number}`
  const bracket = 2 ** Math.ceil(Math.log2(Math.max(2, size)))
  const left = bracket / 2 ** (number - 1)
  if (left < 2) return `Top Cut ${number}`
  return left === 2 ? 'Final' : left === 4 ? 'Semifinal' : left === 8 ? 'Cuartos' : left === 16 ? 'Octavos' : `Top ${left}`
}
