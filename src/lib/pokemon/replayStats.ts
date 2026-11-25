/** What the replays of my VGC matches say, game by game. Pure functions. */
import type { PokemonMatch, ReplayGame } from '../types.ts'
import { addResult, emptyTally, played, type Tally } from './stats.ts'

export interface Combo {
  species: string[]
  tally: Tally
}
export interface MonGames {
  species: string
  /** Games it was brought to. */
  tally: Tally
  kos: number
  faints: number
  dealt: number
  megas: number
  leads: number
}
export interface RivalMonGames {
  species: string
  /** Games with it in the rival's six. */
  seen: number
  /** My record in the games it was brought. */
  tally: Tally
  leads: number
}
export interface ReplayStats {
  games: Tally
  turns: number
  myLeads: Combo[]
  rivalLeads: Combo[]
  picks: Combo[]
  mine: MonGames[]
  rival: RivalMonGames[]
  /** By number of game in the set: how I do in the first, second and third. */
  byNumber: Tally[]
}

/** Two games with the same rating step are the same set: only its last game carries it. */
export function ratingPoints(matches: readonly PokemonMatch[]): { at: string; rating: number; match: PokemonMatch }[] {
  return matches
    .flatMap((m) => m.replays.filter((g) => g.mine.rating_after !== null).map((g) => ({ at: g.at ?? `${m.date}T12:00:00Z`, rating: g.mine.rating_after!, match: m })))
    .sort((a, b) => a.at.localeCompare(b.at))
}

const leadsOf = (s: ReplayGame['mine']) => s.brought.slice(0, s.leads).sort((a, b) => a.localeCompare(b))

export function replayStats(matches: readonly PokemonMatch[]): ReplayStats {
  const combos = [new Map<string, Combo>(), new Map<string, Combo>(), new Map<string, Combo>()]
  const combo = (i: number, species: string[], r: ReplayGame['result']) => {
    if (!species.length) return
    const key = species.join('+')
    if (!combos[i].has(key)) combos[i].set(key, { species, tally: emptyTally() })
    addResult(combos[i].get(key)!.tally, r)
  }
  const mine = new Map<string, MonGames>()
  const rival = new Map<string, RivalMonGames>()
  const byNumber = [emptyTally(), emptyTally(), emptyTally()]
  const games = emptyTally()
  let turns = 0
  for (const m of matches)
    for (const g of m.replays) {
      addResult(games, g.result)
      turns += g.turns
      if (m.format === 'bo3' && g.number && g.number <= 3) addResult(byNumber[g.number - 1], g.result)
      combo(0, leadsOf(g.mine), g.result)
      combo(1, leadsOf(g.rival), g.result)
      // A pick is complete only when its four were seen.
      if (g.mine.brought.length === 4) combo(2, [...g.mine.brought].sort((a, b) => a.localeCompare(b)), g.result)
      for (const l of g.mine.mons) {
        const x = mine.get(l.species) ?? { species: l.species, tally: emptyTally(), kos: 0, faints: 0, dealt: 0, megas: 0, leads: 0 }
        addResult(x.tally, g.result)
        x.kos += l.kos
        x.faints += l.fainted !== null ? 1 : 0
        x.dealt += l.dealt
        x.megas += l.mega ? 1 : 0
        x.leads += leadsOf(g.mine).includes(l.species) ? 1 : 0
        mine.set(l.species, x)
      }
      for (const species of new Set([...(m.teams?.rival ?? []).map((x) => x.species), ...g.rival.brought])) {
        const x = rival.get(species) ?? { species, seen: 0, tally: emptyTally(), leads: 0 }
        x.seen++
        if (g.rival.brought.includes(species)) addResult(x.tally, g.result)
        x.leads += leadsOf(g.rival).includes(species) ? 1 : 0
        rival.set(species, x)
      }
    }
  const byGames = (a: { tally: Tally }, b: { tally: Tally }) => played(b.tally) - played(a.tally) || b.tally.w - a.tally.w
  const list = (i: number) => [...combos[i].values()].sort(byGames)
  return {
    games, turns: played(games) ? turns / played(games) : 0, myLeads: list(0), rivalLeads: list(1), picks: list(2), byNumber,
    mine: [...mine.values()].sort(byGames), rival: [...rival.values()].sort((a, b) => b.seen - a.seen || byGames(a, b)),
  }
}
