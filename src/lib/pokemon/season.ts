/** Championship Points of the season, with best-finish limits. Pure functions. */
import type { PokemonGame, Tournament, TournamentCategory } from '../types'

/** Season 2027: first events in September 2026. */
export const SEASON = { name: '2027', from: '2026-09-01', to: '2027-08-31' }

interface Group {
  id: string
  label: string
  categories: TournamentCategory[]
  limit: number
}
/** Best Finish Limits of the 2027 season. */
const GROUPS: Record<PokemonGame, Group[]> = {
  tcg: [
    { id: 'challenge', label: 'League Challenge', categories: ['league_challenge'], limit: 4 },
    { id: 'cup', label: 'League Cup', categories: ['league_cup'], limit: 4 },
    { id: 'major', label: 'Regional, Especial e Internacional', categories: ['regional', 'special', 'international'], limit: 5 },
  ],
  vgc: [
    { id: 'challenge', label: 'League Challenge', categories: ['league_challenge'], limit: 4 },
    { id: 'cup', label: 'League Cup', categories: ['league_cup'], limit: 4 },
    { id: 'online', label: 'Global y Grand Challenge', categories: ['global_challenge', 'grand_challenge'], limit: 4 },
    { id: 'major', label: 'Regional, Especial e Internacional', categories: ['regional', 'special', 'international'], limit: 5 },
  ],
}

export interface CpGroup extends Group {
  counted: Tournament[]
  dropped: Tournament[]
  points: number
  /** CP a new result must beat to count (null while there are free slots). */
  toBeat: number | null
}
export interface CpSeason {
  groups: CpGroup[]
  total: number
  /** Everything earned, ignoring the limits. */
  raw: number
}

export function cpSeason(tournaments: readonly Tournament[], game: PokemonGame): CpSeason {
  const list = tournaments.filter((t) => t.game === game && t.cp !== null && t.cp > 0 && t.date >= SEASON.from && t.date <= SEASON.to)
  const groups = GROUPS[game].map((g) => {
    const own = list.filter((t) => g.categories.includes(t.category)).sort((a, b) => b.cp! - a.cp! || a.date.localeCompare(b.date))
    const counted = own.slice(0, g.limit)
    return { ...g, counted, dropped: own.slice(g.limit), points: counted.reduce((a, t) => a + t.cp!, 0), toBeat: counted.length >= g.limit ? counted[counted.length - 1].cp! : null }
  })
  return { groups, total: groups.reduce((a, g) => a + g.points, 0), raw: list.reduce((a, t) => a + t.cp!, 0) }
}

// ------------------------------------------------------------- deck versions
export interface DeckVersionLike {
  id: string
  from_date: string
  list_text: string
  note: string
}
export interface CardDiff {
  name: string
  before: number
  after: number
}
/** Cards whose count changed between two lists (same name counts together). */
export function diffLists(a: { name: string; count: number }[], b: { name: string; count: number }[]): CardDiff[] {
  const sum = (l: { name: string; count: number }[]) => {
    const m = new Map<string, number>()
    for (const c of l) m.set(c.name, (m.get(c.name) ?? 0) + c.count)
    return m
  }
  const [x, y] = [sum(a), sum(b)]
  return [...new Set([...x.keys(), ...y.keys()])].map((name) => ({ name, before: x.get(name) ?? 0, after: y.get(name) ?? 0 })).filter((d) => d.before !== d.after).sort((p, q) => q.after - q.before - (p.after - p.before) || p.name.localeCompare(q.name))
}
/** Version in use on a date: the last one that started on or before it (the first one before that). */
export function versionOn<T extends { from_date: string }>(versions: readonly T[], date: string): T | null {
  const sorted = [...versions].sort((a, b) => a.from_date.localeCompare(b.from_date))
  return sorted.filter((v) => v.from_date <= date).at(-1) ?? sorted[0] ?? null
}
