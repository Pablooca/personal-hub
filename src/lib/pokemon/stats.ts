/** Match statistics for the Pokémon section. Pure functions over tournaments + rounds. */
import type { MatchFormat, RoundGame, RoundResult, Tournament, TournamentRound } from '../types'

export interface Tally {
  w: number
  l: number
  t: number
}
export const emptyTally = (): Tally => ({ w: 0, l: 0, t: 0 })
export const played = (t: Tally) => t.w + t.l + t.t
/** Same definition as Limitless: ties count as played, not as won. */
export const winRate = (t: Tally) => (played(t) ? (t.w / played(t)) * 100 : null)
export const recordText = (t: Tally) => (t.t ? `${t.w}-${t.l}-${t.t}` : `${t.w}-${t.l}`)
export function addResult(t: Tally, result: RoundResult | RoundGame['result']) {
  if (result === 'win') t.w++
  else if (result === 'loss') t.l++
  else if (result === 'tie') t.t++
  return t
}

/** Match result from its games: more games won wins, level is a tie. */
export function resultFromGames(games: RoundGame[]): 'win' | 'loss' | 'tie' | null {
  if (!games.length) return null
  const w = games.filter((g) => g.result === 'win').length
  const l = games.filter((g) => g.result === 'loss').length
  return w > l ? 'win' : l > w ? 'loss' : 'tie'
}

/** Is a BO3 already decided / how many games can it have? */
export const maxGames = (f: MatchFormat) => (f === 'bo1' ? 1 : 3)
export function decided(games: RoundGame[], f: MatchFormat) {
  const need = f === 'bo1' ? 1 : 2
  return games.length >= maxGames(f) || ['win', 'loss'].some((r) => games.filter((g) => g.result === r).length >= need)
}

export const roundFormat = (t: Tournament, r: Pick<TournamentRound, 'phase'>): MatchFormat => (r.phase === 'top_cut' ? (t.top_cut_format ?? t.swiss_format) : t.swiss_format)

export interface Match {
  t: Tournament
  r: TournamentRound
  format: MatchFormat
}

/** Every round joined with its tournament; byes are excluded (they are not matches). */
export function matchesOf(tournaments: Tournament[], rounds: TournamentRound[]): Match[] {
  const byId = new Map(tournaments.map((t) => [t.id, t]))
  const out: Match[] = []
  for (const r of rounds) {
    const t = byId.get(r.tournament_id)
    if (t && r.result !== 'bye') out.push({ t, r, format: roundFormat(t, r) })
  }
  return out
}

/** Swiss record including byes (they give 3 points). */
export function swissRecord(rounds: TournamentRound[]): Tally & { points: number; rounds: number } {
  const t = emptyTally()
  const swiss = rounds.filter((r) => r.phase === 'swiss')
  for (const r of swiss) addResult(t, r.result === 'bye' ? 'win' : r.result)
  return { ...t, points: t.w * 3 + t.t, rounds: swiss.length }
}

export const tally = (ms: Match[]) => ms.reduce((acc, m) => addResult(acc, m.r.result), emptyTally())

export function groupTally<K extends string>(ms: Match[], key: (m: Match) => K | null): Map<K, Tally> {
  const out = new Map<K, Tally>()
  for (const m of ms) {
    const k = key(m)
    if (k === null) continue
    if (!out.has(k)) out.set(k, emptyTally())
    addResult(out.get(k)!, m.r.result)
  }
  return out
}

/** Game-level record when going first / second. */
export function turnTally(ms: Match[]): { first: Tally; second: Tally } {
  const out = { first: emptyTally(), second: emptyTally() }
  for (const m of ms) for (const g of m.r.games) if (g.first !== null && g.first !== undefined) addResult(g.first ? out.first : out.second, g.result)
  return out
}

export function diceTally(ms: Match[]): { won: Tally; lost: Tally; rate: number | null } {
  const known = ms.filter((m) => m.r.won_dice !== null)
  const won = tally(known.filter((m) => m.r.won_dice))
  const lost = tally(known.filter((m) => !m.r.won_dice))
  return { won, lost, rate: known.length ? (played(won) / known.length) * 100 : null }
}

// ------------------------------------------------------------- TCG archetypes
export interface RivalRef {
  key: string
  id: string // archetype id, 'other' or ''
  icons: string[]
  name: string
}

/** Stable identity of the rival's deck. Custom decks are identified by their icons and name. */
export function rivalKey(r: Pick<TournamentRound, 'opponent_archetype' | 'opponent_icons' | 'opponent_deck_name'>): string {
  if (!r.opponent_archetype) return ''
  if (r.opponent_archetype !== 'other') return r.opponent_archetype
  return `other:${[...r.opponent_icons].sort().join('+')}|${r.opponent_deck_name.trim().toLowerCase()}`
}

export function rivalRef(r: TournamentRound): RivalRef | null {
  const key = rivalKey(r)
  if (!key) return null
  return { key, id: r.opponent_archetype, icons: r.opponent_icons, name: r.opponent_deck_name.trim() || 'Personalizado' }
}

export interface MatrixRow {
  deckId: string
  cells: Map<string, Tally>
  total: Tally
}

/** My decks (rows) against rival archetypes (columns). Columns sorted by matches played. */
export function matchupMatrix(ms: Match[]): { rows: MatrixRow[]; cols: (RivalRef & { total: Tally })[] } {
  const rows = new Map<string, MatrixRow>()
  const cols = new Map<string, RivalRef & { total: Tally }>()
  for (const m of ms) {
    if (m.t.game !== 'tcg') continue
    const ref = rivalRef(m.r)
    if (!ref) continue
    const deckId = m.t.deck_id ?? ''
    if (!rows.has(deckId)) rows.set(deckId, { deckId, cells: new Map(), total: emptyTally() })
    if (!cols.has(ref.key)) cols.set(ref.key, { ...ref, total: emptyTally() })
    const row = rows.get(deckId)!
    if (!row.cells.has(ref.key)) row.cells.set(ref.key, emptyTally())
    addResult(row.cells.get(ref.key)!, m.r.result)
    addResult(row.total, m.r.result)
    addResult(cols.get(ref.key)!.total, m.r.result)
  }
  const byPlayed = (a: { total: Tally }, b: { total: Tally }) => played(b.total) - played(a.total)
  return { rows: [...rows.values()].sort(byPlayed), cols: [...cols.values()].sort(byPlayed) }
}

// ------------------------------------------------------------------------ VGC
export interface MonStats {
  species: string
  /** My record in the matches where it appeared. */
  record: Tally
  items: [string, number][]
  natures: [string, number][]
  moves: [string, number][]
}

const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
const bump = (m: Map<string, number>, k: string) => k && m.set(k, (m.get(k) ?? 0) + 1)

/** Rival Pokémon: how often I faced each one, how I did, and what it usually carries. */
export function rivalMons(ms: Match[]): MonStats[] {
  const acc = new Map<string, { record: Tally; items: Map<string, number>; natures: Map<string, number>; moves: Map<string, number> }>()
  for (const { t, r } of ms) {
    if (t.game !== 'vgc') continue
    const seen = new Set<string>()
    for (const p of r.opponent_pokemon) {
      if (!p.species || seen.has(p.species)) continue
      seen.add(p.species)
      if (!acc.has(p.species)) acc.set(p.species, { record: emptyTally(), items: new Map(), natures: new Map(), moves: new Map() })
      const a = acc.get(p.species)!
      addResult(a.record, r.result)
      bump(a.items, p.item)
      bump(a.natures, p.nature)
      p.moves.forEach((m) => bump(a.moves, m))
    }
  }
  return [...acc.entries()]
    .map(([species, a]) => ({ species, record: a.record, items: top(a.items), natures: top(a.natures), moves: top(a.moves) }))
    .sort((a, b) => played(b.record) - played(a.record) || a.species.localeCompare(b.species))
}

export interface OwnMonStats {
  species: string
  record: Tally
  /** How many of the matches with a recorded selection included it. */
  usage: number
  /** My record against each rival species when I brought this one. */
  versus: Map<string, Tally>
}

/** My own Pokémon: times brought, win rate, and matchups against rival species. */
export function ownMons(ms: Match[]): OwnMonStats[] {
  const acc = new Map<string, OwnMonStats>()
  const recorded = ms.filter((m) => m.t.game === 'vgc' && m.r.my_pokemon.length)
  for (const { r } of recorded) {
    for (const species of new Set(r.my_pokemon)) {
      if (!acc.has(species)) acc.set(species, { species, record: emptyTally(), usage: 0, versus: new Map() })
      const a = acc.get(species)!
      addResult(a.record, r.result)
      for (const rival of new Set(r.opponent_pokemon.map((p) => p.species).filter(Boolean))) {
        if (!a.versus.has(rival)) a.versus.set(rival, emptyTally())
        addResult(a.versus.get(rival)!, r.result)
      }
    }
  }
  for (const a of acc.values()) a.usage = recorded.length ? (played(a.record) / recorded.length) * 100 : 0
  return [...acc.values()].sort((a, b) => played(b.record) - played(a.record) || a.species.localeCompare(b.species))
}

/** Best and worst matchups with at least `min` matches. */
export function extremes<T extends { record: Tally }>(list: T[], min = 2): { good: T[]; bad: T[] } {
  const known = list.filter((x) => played(x.record) >= min)
  const rate = (x: T) => winRate(x.record) ?? 0
  return {
    good: known.filter((x) => rate(x) > 50).sort((a, b) => rate(b) - rate(a) || played(b.record) - played(a.record)),
    bad: known.filter((x) => rate(x) < 50).sort((a, b) => rate(a) - rate(b) || played(b.record) - played(a.record)),
  }
}
