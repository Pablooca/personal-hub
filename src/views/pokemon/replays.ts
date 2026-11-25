import { groupSets, parseReplay, type ParsedReplay, type ReplaySet } from '../../lib/pokemon/replay'
import type { PokemonMatch } from '../../lib/types'
import { loadChampions } from './data'

const HOST = 'https://replay.pokemonshowdown.com'
const MAX_BYTES = 2_000_000

/** null = it does not exist (or is not public). */
async function fetchLog(id: string): Promise<string | null> {
  let last: unknown
  for (let i = 0; i < 2; i++) {
    if (i) await new Promise((ok) => setTimeout(ok, 600))
    try {
      const r = await fetch(`${HOST}/${encodeURIComponent(id)}.json`, { referrerPolicy: 'no-referrer', credentials: 'omit', signal: AbortSignal.timeout(12_000) })
      if (r.status === 404 || r.status === 403) return null
      if (r.ok) {
        const text = await r.text()
        if (text.length > MAX_BYTES) throw new Error('Repetición demasiado grande.')
        const j = JSON.parse(text) as { log?: unknown }
        return typeof j.log === 'string' ? j.log : null
      }
      last = new Error(`Showdown ha respondido ${r.status}.`)
    } catch (e) {
      last = e
    }
  }
  throw last
}

const memo = new Map<string, ParsedReplay>()
async function load(id: string): Promise<ParsedReplay | null> {
  if (memo.has(id)) return memo.get(id)!
  const names = await loadChampions().then(
    (c) => c.names,
    () => undefined,
  )
  const log = await fetchLog(id)
  if (log === null) return null
  const r = parseReplay(id, log, names)
  if (names) memo.set(id, r)
  return r
}

/** Room of the replay without the password of the private ones. */
const roomOf = (id: string) => id.match(/^(.*-)(\d+)(?:-[a-z0-9]+pw)?$/)

/**
 * Read the replays and whatever other games of their sets can be found: each
 * game links to the next one, and the first one is created right after the set.
 */
export async function loadSets(ids: readonly string[], saved: readonly PokemonMatch[]): Promise<{ sets: ReplaySet[]; errors: string[] }> {
  const found = new Map<string, ParsedReplay>()
  const errors: string[] = []
  const add = async (id: string, required: boolean) => {
    if (found.has(id)) return
    try {
      const r = await load(id)
      if (r) found.set(id, r)
      else if (required) errors.push(`${id}: no existe o es privada.`)
    } catch (e) {
      if (required) errors.push(`${id}: ${e instanceof Error && /repetición|partida|Showdown/i.test(e.message) ? e.message : 'no se ha podido descargar.'}`)
    }
  }
  await Promise.all(ids.slice(0, 60).map((id) => add(id, true)))

  // Games of the same sets already saved here.
  for (const set of groupSets([...found.values()])) {
    const match = savedMatch(saved, set)
    if (match) await Promise.all(match.replays.map((g) => add(g.id, false)))
  }
  for (const set of groupSets([...found.values()])) {
    if (!set.bo3) continue
    const has = (n: number) => [...found.values()].some((r) => r.set === set.key && r.number === n)
    const first = set.games[0]
    const room = roomOf(first.id)
    const number = Number(set.key.match(/(\d+)$/)?.[1])
    if (!has(1) && room && number) {
      const id = `${room[1]}${number + 1}`
      const r = await load(id).catch(() => null)
      if (r && r.set === set.key) found.set(id, r)
    }
    for (let n = 1; n < 3; n++) {
      const r = [...found.values()].find((x) => x.set === set.key && x.number === n)
      if (r?.next && !has(n + 1)) await add(r.next, false)
    }
  }
  return { sets: groupSets([...found.values()]), errors }
}

/** The match of mine these replays belong to, if it is already saved. */
export function savedMatch(saved: readonly PokemonMatch[], set: ReplaySet): PokemonMatch | undefined {
  const ids = new Set(set.games.map((g) => g.id))
  return saved.find((m) => m.replays.some((g) => ids.has(g.id) || (g.set !== '' && g.set === set.key)))
}
