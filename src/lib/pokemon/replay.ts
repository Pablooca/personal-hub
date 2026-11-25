/** Pokémon Showdown replays (VGC): links, protocol parser and best-of-3 sets. Pure functions. */
import type { ReplayGame, ReplayLine, ReplayMon, ReplaySide, RoundGame } from '../types.ts'

// --------------------------------------------------------------------- links
const LINK = /(?:https?:\/\/)?(?:replay\.pokemonshowdown\.com\/|play\.pokemonshowdown\.com\/battle-)([a-z0-9]+(?:-[a-z0-9]+)*-\d+(?:-[a-z0-9]+pw)?)\b/gi

/** Every replay id in a pasted text, in order and without repeats. */
export function replayIds(text: string): string[] {
  return [...new Set([...text.matchAll(LINK)].map((m) => m[1].toLowerCase()))]
}
export const replayUrl = (id: string) => `https://replay.pokemonshowdown.com/${id}`

export const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
/** Names of items, moves and abilities as they are written ("goodasgold" → "Good as Gold"). */
export type Names = ReadonlyMap<string, string>
const spaced = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').trim()
const nameOf = (packed: string, names: Names) => names.get(toId(packed)) ?? spaced(packed)

/** "Raichu-Mega-Y" and "Raichu" are the same Pokémon. */
const baseForme = (s: string) => s.replace(/-(Mega(-[XYZ])?|Primal|Tera|Gmax|\*)$/i, '')

// -------------------------------------------------------------------- parser
export interface ParsedSide extends ReplaySide {
  team: ReplayMon[]
}
export interface ParsedReplay extends Omit<ReplayGame, 'result' | 'mine' | 'rival' | 'log'> {
  /** Best-of-3 only: games won by each player before this one, and the id of the next one. */
  score: [number, number]
  next: string | null
  bo3: boolean
  winner: 0 | 1 | null
  sides: [ParsedSide, ParsedSide]
  log: { n: number; e: string[] }[]
}

const STATUS: Record<string, string> = { brn: 'quemado', par: 'paralizado', psn: 'envenenado', tox: 'envenenado grave', slp: 'dormido', frz: 'congelado' }
const CAUSE: Record<string, string> = { brn: 'quemadura', psn: 'veneno', tox: 'veneno', Recoil: 'retroceso', confusion: 'confusión', 'Leech Seed': 'Leech Seed', Sandstorm: 'tormenta de arena' }
const BLOCKED: Record<string, string> = { flinch: 'retrocede', par: 'paralizado', slp: 'dormido', frz: 'congelado', recharge: 'recargando', Attract: 'enamorado' }
const STAT: Record<string, string> = { atk: 'Atq', def: 'Def', spa: 'AtE', spd: 'DfE', spe: 'Vel', accuracy: 'Precisión', evasion: 'Evasión' }
/** "move: Tailwind" → "Tailwind". */
const plain = (s: string) => s.replace(/^(move|item|ability):\s*/, '')
const MAX_LINES = 400

interface Mon {
  side: 0 | 1
  line: ReplayLine
  hp: number
  hit: Mon | null
  statusBy: Mon | null
  set: ReplayMon
}

const blankSide = (): ParsedSide => ({ name: '', rating: null, rating_after: null, brought: [], leads: 0, left: 0, crits: 0, misses: 0, lost_turns: 0, mons: [], team: [] })

export function parseReplay(id: string, log: string, names: Names = new Map()): ParsedReplay {
  const sides: [ParsedSide, ParsedSide] = [blankSide(), blankSide()]
  const mons: [Mon[], Mon[]] = [[], []]
  const size: [number, number] = [0, 0]
  const turns: ParsedReplay['log'] = [{ n: 0, e: [] }]
  const active = new Map<string, { mon: Mon; isNew: boolean }>()
  let lines = 0
  let set = ''
  let number: number | null = null
  let next: string | null = null
  let format = ''
  let score: [number, number] = [0, 0]
  let first = 0
  let last = 0
  let begin = 0
  let turn = 0
  let started = false
  let winner: 0 | 1 | null = null
  let ended = false
  let end: ReplayGame['end'] = 'ko'
  let rated = false

  // The move being resolved: its consequences are shown in a single line.
  let move: { mon: Mon; name: string; parts: string[]; flags: Map<Mon, string[]>; after: [0 | 1 | null, string][] } | null = null
  const say = (side: 0 | 1 | null, text: string) => {
    if (move) move.after.push([side, text])
    else if (lines++ < MAX_LINES) turns[turns.length - 1].e.push(`${side === null ? 0 : side + 1}${text}`)
  }
  function flush() {
    if (!move) return
    const { mon, name, parts, after } = move
    move = null
    say(mon.side, `${mon.line.species}: ${name}${parts.length ? ` → ${parts.join(', ')}` : ''}`)
    for (const [side, text] of after) say(side, text)
  }
  const sideOf = (ident: string): 0 | 1 | null => (/^p1/.test(ident) ? 0 : /^p2/.test(ident) ? 1 : null)

  const addMon = (side: 0 | 1, species: string): Mon => {
    const set: ReplayMon = { species, item: '', ability: '', nature: '', tera: '', moves: [] }
    const mon: Mon = { side, hp: 100, hit: null, statusBy: null, set, line: { species, mega: '', tera: '', kos: 0, fainted: null, dealt: 0, taken: 0, hp: 100, moves: [] } }
    mons[side].push(mon)
    return mon
  }
  function findMon(side: 0 | 1, details: string): Mon {
    const species = details.split(',')[0].trim()
    const list = mons[side]
    const root = (s: string) => baseForme(s).split('-')[0]
    return (
      list.find((m) => m.line.species === species) ??
      list.find((m) => baseForme(m.line.species) === baseForme(species)) ??
      list.find((m) => root(m.line.species) === root(species)) ??
      addMon(side, baseForme(species))
    )
  }
  /** "p1a: Whimsicott" → the Pokémon in that slot. */
  function at(ident: string | undefined): Mon | null {
    if (!ident) return null
    const slot = ident.match(/^(p[12][a-c])/)?.[1]
    if (slot && active.has(slot)) return active.get(slot)!.mon
    // Without a position (fainted, healed by Wish…): by name.
    const side = sideOf(ident)
    if (side === null) return null
    const name = ident.slice(ident.indexOf(':') + 1).trim()
    return mons[side].find((m) => m.line.species === name) ?? null
  }
  const hpOf = (cond: string) => {
    if (/fnt/.test(cond)) return 0
    const m = cond.match(/^(\d+)(?:\/(\d+))?/)
    return m ? Math.round((Number(m[1]) / Number(m[2] ?? 100)) * 100) : 100
  }
  const reveal = (m: Mon | null, key: 'item' | 'ability', value: string) => {
    if (m && !m.set[key] && value) m.set[key] = value
  }

  for (const raw of log.split('\n')) {
    if (!raw.startsWith('|')) continue
    const a = raw.slice(1).split('|')
    const cmd = a[0]
    const tag = (k: string) => a.find((x) => x.startsWith(`[${k}]`))?.slice(k.length + 2).trim()
    const from = tag('from')
    const of = at(tag('of'))

    switch (cmd) {
      case '':
      case 'upkeep':
        flush()
        break
      case 't:': {
        const t = Number(a[1])
        if (t > 0) {
          first ||= t
          last = t
        }
        break
      }
      case 'html': {
        // Scoreboard of the set: one filled circle per game won.
        const cells = raw.split(/<td/i).filter((c) => c.includes('fa-circle'))
        if (cells.length === 2) score = cells.map((c) => (c.match(/fa-circle(?!-o)/g) ?? []).length) as [number, number]
        break
      }
      case 'uhtml':
        if (a[1] === 'bestof') {
          set = raw.match(/game-bestof\d+-([a-z0-9-]+?)"/i)?.[1] ?? set
          number = Number(raw.match(/Game (\d+)/i)?.[1]) || number
        } else if (a[1] === 'next') next = raw.match(/\/battle-([a-z0-9-]+)"/i)?.[1] ?? next
        break
      case 'player': {
        const s = sideOf(a[1] ?? '')
        if (s !== null && a[2] && !sides[s].name) {
          sides[s].name = a[2].slice(0, 60)
          sides[s].rating = Number(a[4]) || null
        }
        break
      }
      case 'tier':
        format = (a[1] ?? '').slice(0, 80)
        break
      case 'rated':
        rated = true
        break
      case 'poke': {
        const s = sideOf(a[1])
        if (s !== null) addMon(s, (a[2] ?? '').split(',')[0].replace(/-\*$/, '').trim())
        break
      }
      case 'showteam': {
        // Open team sheets: nickname|species|item|ability|moves|nature|EVs|gender|IVs|shiny|level|happiness,…,tera
        const s = sideOf(a[1])
        if (s === null) break
        for (const packed of raw.split('|').slice(3).join('|').split(']')) {
          const p = packed.split('|')
          if (!p[0]) continue
          const m = findMon(s, p[1] || p[0])
          m.set = { species: m.line.species, item: p[2] ? nameOf(p[2], names) : '', ability: p[3] ? nameOf(p[3], names) : '', moves: (p[4] ?? '').split(',').filter(Boolean).map((x) => nameOf(x, names)), nature: p[5] ?? '', tera: p[11]?.split(',')[5] ?? '' }
        }
        break
      }
      case 'teamsize': {
        const s = sideOf(a[1])
        if (s !== null) size[s] = Number(a[2]) || 0
        break
      }
      case 'start':
        started = true
        begin = last
        break
      case 'turn':
        flush()
        turn = Number(a[1]) || turn + 1
        turns.push({ n: turn, e: [] })
        break

      case 'switch':
      case 'drag':
      case 'replace': {
        flush()
        const s = sideOf(a[1])
        const slot = a[1].slice(0, 3)
        if (s === null) break
        const prev = active.get(slot)
        const mon = findMon(s, a[2])
        // Illusion: the one we thought had come in was never there.
        if (cmd === 'replace' && prev?.isNew && prev.mon !== mon) sides[s].brought = sides[s].brought.filter((x) => x !== prev.mon.line.species)
        const isNew = !sides[s].brought.includes(mon.line.species)
        if (isNew) sides[s].brought.push(mon.line.species)
        active.set(slot, { mon, isNew })
        if (cmd !== 'replace') {
          mon.hp = hpOf(a[3] ?? '')
          mon.line.hp = mon.hp
          if (turn === 0) sides[s].leads++
        }
        say(s, cmd === 'replace' ? `${mon.line.species} deja de usar la ilusión` : `Entra ${mon.line.species}${mon.hp < 100 ? ` (${mon.hp} %)` : ''}${cmd === 'drag' ? ', arrastrado' : ''}`)
        break
      }
      case '-mega': {
        const mon = at(a[1])
        if (!mon) break
        mon.line.mega = a[3] || 'Mega'
        if (a[3]) mon.set.item = a[3]
        flush()
        say(mon.side, `${mon.line.species} megaevoluciona (${a[3] || 'Mega'})`)
        break
      }
      case '-terastallize': {
        const mon = at(a[1])
        if (!mon) break
        mon.line.tera = a[2] ?? ''
        mon.set.tera ||= a[2] ?? ''
        flush()
        say(mon.side, `${mon.line.species} teracristaliza (${a[2]})`)
        break
      }
      case 'move': {
        flush()
        const mon = at(a[1])
        if (!mon) break
        const name = a[2]
        if (!from || !/ability|move: (?!Sleep Talk)/.test(from)) {
          const used = mon.line.moves.find((m) => m[0] === name)
          if (used) used[1]++
          else mon.line.moves.push([name, 1])
          if (name !== 'Struggle' && !mon.set.moves.includes(name) && mon.set.moves.length < 4) mon.set.moves.push(name)
        }
        move = { mon, name, parts: [], flags: new Map(), after: [] }
        break
      }
      case 'cant': {
        flush()
        const mon = at(a[1])
        if (!mon) break
        sides[mon.side].lost_turns++
        say(mon.side, `${mon.line.species} no actúa (${BLOCKED[a[2]] ?? plain(a[2] ?? '')})`)
        break
      }
      case '-crit':
      case '-supereffective':
      case '-resisted': {
        const mon = at(a[1])
        if (!mon || !move) break
        if (cmd === '-crit' && move.mon.side !== mon.side) sides[move.mon.side].crits++
        move.flags.set(mon, [...(move.flags.get(mon) ?? []), cmd === '-crit' ? 'crítico' : cmd === '-resisted' ? 'poco eficaz' : 'muy eficaz'])
        break
      }
      case '-miss': {
        const mon = at(a[1])
        if (mon) sides[mon.side].misses++
        move?.parts.push(`falla${at(a[2]) ? ` contra ${at(a[2])!.line.species}` : ''}`)
        break
      }
      case '-fail':
        move?.parts.push('falla')
        break
      case '-immune':
        if (move && at(a[1])) move.parts.push(`${at(a[1])!.line.species} es inmune`)
        break
      case '-activate':
      case '-block': {
        const what = plain(a[2] ?? '')
        if (move && at(a[1]) && /Protect|Detect|Guard|Shield|Bunker|King's|Obstruct|Silk Trap|Burning Bulwark|Armor Tail|Queenly|Dazzling|Psychic Terrain/i.test(what)) move.parts.push(`${at(a[1])!.line.species} bloquea (${what})`)
        else if (/^ability:/.test(a[2] ?? '')) {
          const mon = at(a[1])
          reveal(mon, 'ability', what)
        }
        break
      }

      case '-damage':
      case '-sethp':
      case '-heal': {
        const mon = at(a[1])
        if (!mon) break
        const hp = hpOf(a[2] ?? '')
        const lost = mon.hp - hp
        mon.hp = hp
        mon.line.hp = hp
        if (from?.startsWith('item:')) reveal(of && cmd === '-damage' && !/Life Orb/.test(from) ? of : mon, 'item', plain(from))
        if (from?.startsWith('ability:')) reveal(of ?? mon, 'ability', plain(from))
        const why = from ? (CAUSE[from] ?? plain(from)) : ''
        if (cmd !== '-damage') {
          if (lost !== 0) say(mon.side, `${mon.line.species} ${lost < 0 ? 'recupera' : 'baja'} hasta ${hp} %${why ? ` (${why})` : ''}`)
          break
        }
        const source: Mon | null = !from ? (move?.mon ?? null) : of && of.side !== mon.side ? of : /^(brn|psn|tox)$/.test(from) ? mon.statusBy : null
        mon.hit = source
        mon.line.taken += Math.max(0, lost)
        if (source && source.side !== mon.side) source.line.dealt += Math.max(0, lost)
        if (!from && move) {
          const own = move.mon.side === mon.side && move.mon !== mon ? ' propio' : ''
          const notes = move.flags.get(mon) ?? []
          move.parts.push(`${mon.line.species}${own} ${hp} %${notes.length ? ` (${notes.join(', ')})` : ''}`)
          move.flags.delete(mon) // multi-hit moves: each hit has its own
        } else say(mon.side, `${mon.line.species} baja hasta ${hp} %${why ? ` (${why})` : ''}`)
        break
      }
      case 'faint': {
        const mon = at(a[1])
        if (!mon) break
        flush()
        mon.line.fainted = turn
        mon.line.hp = 0
        const by = mon.hp === 0 && mon.hit && mon.hit.side !== mon.side ? mon.hit : null
        if (by) by.line.kos++
        mon.hp = 0
        say(mon.side, `Cae ${mon.line.species}${by ? ` (${by.line.species})` : ''}`)
        break
      }
      case '-status': {
        const mon = at(a[1])
        if (!mon) break
        mon.statusBy = of ?? (move && move.mon.side !== mon.side ? move.mon : null)
        const text = `${mon.line.species} ${STATUS[a[2]] ?? a[2]}`
        if (move && !from) move.parts.push(text)
        else say(mon.side, `${text}${from ? ` (${plain(from)})` : ''}`)
        break
      }
      case '-curestatus': {
        const mon = at(a[1])
        if (mon) mon.statusBy = null
        break
      }
      case '-boost':
      case '-unboost': {
        const mon = at(a[1])
        if (!mon || !Number(a[3])) break
        const text = `${mon.line.species} ${cmd === '-boost' ? '+' : '−'}${a[3]} ${STAT[a[2]] ?? a[2]}`
        if (move) move.parts.push(text)
        else say(mon.side, text)
        break
      }
      case '-item':
        reveal(at(a[1]), 'item', a[2] ?? '')
        break
      case '-enditem': {
        const mon = at(a[1])
        if (!mon) break
        reveal(mon, 'item', a[2] ?? '')
        const gone = a.includes('[from] move: Knock Off')
        if (move) move.parts.push(`${mon.line.species} ${gone ? 'pierde' : 'gasta'} ${a[2]}`)
        else say(mon.side, `${mon.line.species} ${gone ? 'pierde' : 'gasta'} ${a[2]}`)
        break
      }
      case '-ability': {
        const mon = at(a[1])
        if (!mon) break
        reveal(mon, 'ability', a[2] ?? '')
        say(mon.side, `${mon.line.species}: habilidad ${a[2]}`)
        break
      }
      case '-sidestart':
      case '-sideend': {
        const s = sideOf(a[1])
        const what = plain(a[2] ?? '')
        if (cmd === '-sidestart' && move && move.mon.side === s && move.name === what) break // already said by the move
        say(s, `${cmd === '-sidestart' ? 'Empieza' : 'Termina'} ${what}`)
        break
      }
      case '-fieldstart':
      case '-fieldend': {
        const what = plain(a[1] ?? '')
        if (from?.startsWith('ability:')) reveal(of, 'ability', plain(from))
        if (cmd === '-fieldstart' && move && move.name === what) break
        say(null, `${cmd === '-fieldstart' ? 'Empieza' : 'Termina'} ${what}`)
        break
      }
      case '-weather':
        if (a.includes('[upkeep]')) break
        if (from?.startsWith('ability:')) reveal(of, 'ability', plain(from))
        say(null, a[1] === 'none' ? 'Termina el clima' : `Clima: ${a[1]}`)
        break

      case '-message':
        if (/forfeited\.$/.test(a[1] ?? '')) end = 'forfeit'
        else if (/lost due to inactivity\.$/.test(a[1] ?? '')) end = 'timeout'
        break
      case 'win': {
        flush()
        ended = true
        const s = sides.findIndex((x) => toId(x.name) === toId(a[1] ?? ''))
        winner = s === 0 || s === 1 ? s : null
        if (winner === null) ended = false
        break
      }
      case 'tie':
        flush()
        ended = true
        break
      case 'raw': {
        const m = raw.match(/^\|raw\|(.+?)'s rating: (\d+) .*?<strong>(\d+)<\/strong>/)
        const s = m ? sides.findIndex((x) => toId(x.name) === toId(m[1])) : -1
        if (m && s >= 0) {
          sides[s].rating = Number(m[2])
          sides[s].rating_after = Number(m[3])
        }
        break
      }
    }
  }
  flush()
  if (!sides[0].name || !sides[1].name || !started) throw new Error('No es una repetición de Showdown.')
  if (!ended) throw new Error('La partida de la repetición no llegó a terminar.')

  for (const s of [0, 1] as const) {
    sides[s].team = mons[s].map((m) => m.set)
    sides[s].mons = mons[s].filter((m) => sides[s].brought.includes(m.line.species)).map((m) => ({ ...m.line, dealt: Math.round(m.line.dealt), taken: Math.round(m.line.taken), moves: m.line.moves.sort((x, y) => y[1] - x[1]) }))
    sides[s].left = Math.max(0, (size[s] || sides[s].brought.length) - sides[s].mons.filter((m) => m.fainted !== null).length)
  }
  return {
    id, set, number, next, score, format, rated, winner, end, sides,
    bo3: set !== '' || /bo3/i.test(id) || /bo3/i.test(format),
    at: first ? new Date(first * 1000).toISOString() : null, turns: turn, seconds: begin ? last - begin : 0,
    log: turns.filter((t) => t.e.length),
  }
}

// ----------------------------------------------------------------------- set
export interface ReplaySet {
  key: string
  bo3: boolean
  games: ParsedReplay[]
}

/** Replays of the same best-of-3 together, in order. */
export function groupSets(list: readonly ParsedReplay[]): ReplaySet[] {
  const out = new Map<string, ReplaySet>()
  for (const r of list) {
    const key = r.set || r.id
    if (!out.has(key)) out.set(key, { key, bo3: r.bo3, games: [] })
    const s = out.get(key)!
    if (!s.games.some((g) => g.id === r.id)) s.games.push(r)
  }
  for (const s of out.values()) s.games.sort((a, b) => (a.number ?? 0) - (b.number ?? 0) || (a.at ?? '').localeCompare(b.at ?? ''))
  return [...out.values()].sort((a, b) => (a.games[0].at ?? '').localeCompare(b.games[0].at ?? ''))
}

/** Which of the players in the first game is called like this? Sides can change between games. */
export function sideNamed(r: ParsedReplay, name: string): 0 | 1 | null {
  const i = r.sides.findIndex((s) => toId(s.name) === toId(name))
  return i === 0 || i === 1 ? i : null
}

export function orient(r: ParsedReplay, me: 0 | 1): ReplayGame {
  const strip = ({ team: _t, ...s }: ParsedSide): ReplaySide => s
  return {
    id: r.id, set: r.set, number: r.number, format: r.format, rated: r.rated, at: r.at, turns: r.turns, seconds: r.seconds, end: r.end,
    result: r.winner === null ? 'tie' : r.winner === me ? 'win' : 'loss',
    mine: strip(r.sides[me]), rival: strip(r.sides[me === 0 ? 1 : 0]),
    log: me === 0 ? r.log : r.log.map((t) => ({ n: t.n, e: t.e.map((x) => (x[0] === '1' ? '2' : x[0] === '2' ? '1' : x[0]) + x.slice(1)) })),
  }
}

/** What is known of two versions of the same Pokémon (closed sheets reveal a bit more each game). */
function merge(a: ReplayMon, b: ReplayMon): ReplayMon {
  return { species: a.species, item: a.item || b.item, ability: a.ability || b.ability, nature: a.nature || b.nature, tera: a.tera || b.tera, moves: [...new Set([...a.moves, ...b.moves])].slice(0, 4) }
}

export interface SetSummary {
  games: ReplayGame[]
  /** One per game of the set, including those known only by the scoreboard. */
  results: RoundGame[]
  /** Numbers of games without a replay. */
  missing: number[]
  decided: boolean
  mine: ReplayMon[]
  rival: ReplayMon[]
  me: string
  opponent: string
}

/** The whole match as seen by the player called `name`. */
export function summarise(set: ReplaySet, name: string): SetSummary | null {
  const seen = set.games.map((r) => ({ r, me: sideNamed(r, name) }))
  if (!seen.length || seen.some((x) => x.me === null)) return null
  const games = seen.map((x) => orient(x.r, x.me!))
  const team = (mine: boolean) => {
    const out = new Map<string, ReplayMon>()
    for (const { r, me } of seen) for (const m of r.sides[mine ? me! : me === 0 ? 1 : 0].team) out.set(m.species, out.has(m.species) ? merge(out.get(m.species)!, m) : m)
    return [...out.values()]
  }

  // The scoreboard before each game tells who won the ones we do not have.
  const results: RoundGame[] = []
  const missing: number[] = []
  let w = 0
  let l = 0
  let n = 1
  for (const { r, me } of seen) {
    const at = r.number ?? n
    if (set.bo3) {
      const gap = at - n
      if (gap > 0) {
        for (let i = n; i < at; i++) missing.push(i)
        let [win, loss] = me === 0 ? [r.score[0] - w, r.score[1] - l] : [r.score[1] - w, r.score[0] - l]
        for (let i = 0; i < gap; i++) {
          if (win > 0) {
            results.push({ result: 'win', first: null })
            win--
            w++
          } else if (loss > 0) {
            results.push({ result: 'loss', first: null })
            loss--
            l++
          }
        }
      }
    }
    const result = r.winner === null ? 'tie' : r.winner === me ? 'win' : 'loss'
    results.push({ result, first: null })
    if (result === 'win') w++
    else if (result === 'loss') l++
    n = at + 1
  }
  const done = !set.bo3 || w >= 2 || l >= 2 || results.length >= 3
  if (!done) missing.push(n)
  return { games, results, missing, decided: done, mine: team(true), rival: team(false), me: seen[0].r.sides[seen[0].me!].name, opponent: seen[0].r.sides[seen[0].me === 0 ? 1 : 0].name }
}

/** How alike a team sheet is to one of my teams: species first, then items and moves. */
export function teamLikeness(sheet: readonly ReplayMon[], team: readonly { species: string; item: string; moves: string[] }[]): number {
  let score = 0
  for (const m of sheet) {
    const mine = team.find((x) => toId(baseForme(x.species)) === toId(baseForme(m.species)))
    if (!mine) continue
    score += 10
    if (m.item && toId(m.item) === toId(mine.item)) score += 2
    score += m.moves.filter((x) => mine.moves.some((y) => toId(y) === toId(x))).length
  }
  return score
}
/** My team among `teams`, when at least five of its six Pokémon match. */
export function closestTeam<T extends { mons: readonly { species: string; item: string; moves: string[] }[] }>(sheet: readonly ReplayMon[], teams: readonly T[]): T | null {
  let best: T | null = null
  let top = 0
  const ids = (list: readonly { species: string }[]) => new Set(list.map((m) => toId(baseForme(m.species))))
  const want = ids(sheet)
  for (const t of teams) {
    if ([...ids(t.mons)].filter((x) => want.has(x)).length < 5) continue
    const s = teamLikeness(sheet, t.mons)
    if (s > top) {
      best = t
      top = s
    }
  }
  return best
}
