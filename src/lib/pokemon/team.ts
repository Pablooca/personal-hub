/** Showdown / Pokepaste team parser, validation and level-50 stats. */
export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const
export type StatId = (typeof STATS)[number]
export type Spread = Record<StatId, number>

export const STAT_LABELS: Record<StatId, string> = { hp: 'PS', atk: 'Atq', def: 'Def', spa: 'AtE', spd: 'DfE', spe: 'Vel' }

/** [English id, Spanish name, raised, lowered] */
export const NATURES: [string, string, StatId | null, StatId | null][] = [
  ['Adamant', 'Firme', 'atk', 'spa'], ['Bashful', 'Tímida', null, null], ['Bold', 'Osada', 'def', 'atk'], ['Brave', 'Audaz', 'atk', 'spe'],
  ['Calm', 'Serena', 'spd', 'atk'], ['Careful', 'Cauta', 'spd', 'spa'], ['Docile', 'Dócil', null, null], ['Gentle', 'Amable', 'spd', 'def'],
  ['Hardy', 'Fuerte', null, null], ['Hasty', 'Activa', 'spe', 'def'], ['Impish', 'Agitada', 'def', 'spa'], ['Jolly', 'Alegre', 'spe', 'spa'],
  ['Lax', 'Floja', 'def', 'spd'], ['Lonely', 'Huraña', 'atk', 'def'], ['Mild', 'Afable', 'spa', 'def'], ['Modest', 'Modesta', 'spa', 'atk'],
  ['Naive', 'Ingenua', 'spe', 'spd'], ['Naughty', 'Pícara', 'atk', 'spd'], ['Quiet', 'Mansa', 'spa', 'spe'], ['Quirky', 'Rara', null, null],
  ['Rash', 'Alocada', 'spa', 'spd'], ['Relaxed', 'Plácida', 'def', 'spe'], ['Sassy', 'Grosera', 'spd', 'spe'], ['Serious', 'Seria', null, null],
  ['Timid', 'Miedosa', 'spe', 'atk'],
]
export const natureOf = (id: string) => NATURES.find((n) => n[0].toLowerCase() === id.toLowerCase())
export const natureLabel = (id: string) => {
  const n = natureOf(id)
  return n ? `${n[1]} (${n[0]})` : id
}

export interface TeamMon {
  nickname: string
  species: string
  gender: '' | 'M' | 'F'
  item: string
  ability: string
  level: number
  teraType: string
  nature: string
  evs: Spread
  ivs: Spread
  moves: string[]
}

/** 'sp' = Pokémon Champions Stat Points (max 32 each, 66 total) · 'ev' = classic EVs (252 / 510). */
export type SpreadSystem = 'sp' | 'ev'

export interface ParsedTeam {
  mons: TeamMon[]
  system: SpreadSystem
  errors: string[]
  warnings: string[]
  valid: boolean
}

export interface LegalData {
  items: ReadonlySet<string>
  /** species → abilities and moves */
  mon(species: string): { abilities: string[]; moves: ReadonlySet<string> } | null
}

const zero = (n = 0): Spread => ({ hp: n, atk: n, def: n, spa: n, spd: n, spe: n })
const total = (s: Spread) => STATS.reduce((a, k) => a + s[k], 0)

function parseSpread(text: string, fallback: number): Spread {
  const out = zero(fallback)
  for (const part of text.split('/')) {
    const m = part.trim().match(/^(\d+)\s*(HP|Atk|Def|SpA|SpD|Spe|SpAtk|SpDef|Speed)/i)
    if (!m) continue
    const k = m[2].toLowerCase()
    const id: StatId = k === 'spatk' ? 'spa' : k === 'spdef' ? 'spd' : k === 'speed' ? 'spe' : (k as StatId)
    out[id] = Number(m[1])
  }
  return out
}

export function parseTeam(text: string, legal?: LegalData): ParsedTeam {
  const errors: string[] = []
  const warnings: string[] = []
  const mons: TeamMon[] = []

  const blocks = text
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((l) => l.trim()).filter((l) => l && !/^===/.test(l)))
    .filter((b) => b.length)

  for (const lines of blocks) {
    // First line: Nickname (Species) (M) @ Item
    let first = lines[0]
    let item = ''
    const at = first.lastIndexOf(' @ ')
    if (at >= 0) {
      item = first.slice(at + 3).trim()
      first = first.slice(0, at).trim()
    }
    let gender: TeamMon['gender'] = ''
    const g = first.match(/\s*\((M|F)\)$/)
    if (g) {
      gender = g[1] as 'M' | 'F'
      first = first.slice(0, -g[0].length).trim()
    }
    const nick = first.match(/^(.*)\s\(([^()]+)\)$/)
    const mon: TeamMon = {
      nickname: nick ? nick[1].trim() : '',
      species: (nick ? nick[2] : first).trim(),
      gender, item, ability: '', level: 50, teraType: '', nature: '', evs: zero(), ivs: zero(31), moves: [],
    }
    for (const line of lines.slice(1)) {
      const kv = line.match(/^(Ability|Level|Tera Type|EVs|IVs|Shiny|Happiness|SPs?|Stat Points):\s*(.*)$/i)
      if (kv) {
        const v = kv[2].trim()
        switch (kv[1].toLowerCase()) {
          case 'ability': mon.ability = v; break
          case 'level': mon.level = Number(v) || 50; break
          case 'tera type': mon.teraType = v; break
          case 'evs': case 'sp': case 'sps': case 'stat points': mon.evs = parseSpread(v, 0); break
          case 'ivs': mon.ivs = parseSpread(v, 31); break
        }
        continue
      }
      const nature = line.match(/^(\w+) Nature\b/i)
      if (nature) {
        mon.nature = natureOf(nature[1])?.[0] ?? nature[1]
        continue
      }
      const move = line.match(/^[-–~]\s*(.+)$/)
      if (move) mon.moves.push(move[1].replace(/\s*\[(.+)\]$/, ' $1').trim())
    }
    if (!/^[\p{L}][\p{L}\p{N} .:'’\-♀♂%]*$/u.test(mon.species)) {
      errors.push(`No se entiende el bloque que empieza por «${lines[0].slice(0, 50)}».`)
      continue
    }
    mons.push(mon)
  }

  const invested = mons.filter((m) => total(m.evs) > 0)
  const system: SpreadSystem = invested.length > 0 && invested.every((m) => total(m.evs) <= 66 && STATS.every((k) => m.evs[k] <= 32)) ? 'sp' : invested.length ? 'ev' : 'sp'

  if (!mons.length) errors.push('El equipo está vacío.')
  else if (mons.length !== 6) errors.push(`El equipo tiene ${mons.length} Pokémon: debe tener 6.`)

  const dupes = (values: string[]) => [...new Set(values.filter((v, i) => v && values.indexOf(v) !== i))]
  const base = (s: string) => s.replace(/-(Mega.*|Alola|Galar|Hisui|Paldea.*|F|M)$/i, '').toLowerCase()
  for (const d of dupes(mons.map((m) => base(m.species)))) errors.push(`Especie repetida: ${mons.find((m) => base(m.species) === d)?.species}.`)
  for (const d of dupes(mons.map((m) => m.item))) errors.push(`Objeto repetido: ${d}.`)

  for (const m of mons) {
    const who = m.nickname ? `${m.nickname} (${m.species})` : m.species
    if (m.moves.length > 4) errors.push(`${who}: tiene ${m.moves.length} movimientos (máximo 4).`)
    else if (m.moves.length < 4) warnings.push(`${who}: solo tiene ${m.moves.length} movimientos.`)
    for (const d of dupes(m.moves)) errors.push(`${who}: movimiento repetido (${d}).`)
    if (!m.item) warnings.push(`${who}: sin objeto.`)
    if (!m.nature) warnings.push(`${who}: sin naturaleza.`)
    else if (!natureOf(m.nature)) errors.push(`${who}: naturaleza desconocida (${m.nature}).`)
    const [maxEach, maxAll, unit] = system === 'sp' ? [32, 66, 'puntos'] : [252, 510, 'EVs']
    for (const k of STATS) if (m.evs[k] > maxEach) errors.push(`${who}: ${m.evs[k]} ${unit} en ${STAT_LABELS[k]} (máximo ${maxEach}).`)
    if (total(m.evs) > maxAll) errors.push(`${who}: ${total(m.evs)} ${unit} repartidos (máximo ${maxAll}).`)
    else if (total(m.evs) > 0 && system === 'sp' && total(m.evs) < 66) warnings.push(`${who}: le quedan ${66 - total(m.evs)} puntos por repartir.`)
    if (legal) {
      const data = legal.mon(m.species)
      if (!data) warnings.push(`${who}: no está en la lista legal de Pokémon Champions.`)
      else {
        if (m.ability && !data.abilities.includes(m.ability)) warnings.push(`${who}: «${m.ability}» no es una de sus habilidades.`)
        for (const mv of m.moves) if (data.moves.size && !data.moves.has(mv)) warnings.push(`${who}: no aprende «${mv}».`)
      }
      if (m.item && !legal.items.has(m.item)) warnings.push(`${who}: el objeto «${m.item}» no está permitido.`)
    }
  }
  return { mons, system, errors, warnings, valid: errors.length === 0 }
}

/** Final stats. Champions: base + SP + 20 (PS + 75) at level 50; classic: the usual formula. */
export function finalStats(baseStats: readonly number[], mon: Pick<TeamMon, 'evs' | 'ivs' | 'level' | 'nature'>, system: SpreadSystem): Spread {
  const out = zero()
  const nature = natureOf(mon.nature)
  STATS.forEach((k, i) => {
    const b = baseStats[i]
    let v: number
    if (system === 'sp' && mon.level === 50) v = b + mon.evs[k] + (k === 'hp' ? 75 : 20)
    else {
      const ev = system === 'sp' ? Math.max(2 * mon.evs[k] - 1, 0) : Math.floor(mon.evs[k] / 4)
      const iv = system === 'sp' ? 31 : mon.ivs[k]
      v = Math.floor(((2 * b + iv + ev) * mon.level) / 100) + (k === 'hp' ? mon.level + 10 : 5)
    }
    if (b === 1 && k === 'hp') v = 1
    if (nature && k !== 'hp') {
      if (nature[2] === k) v = Math.floor((v * 110) / 100)
      else if (nature[3] === k) v = Math.floor((v * 90) / 100)
    }
    out[k] = v
  })
  return out
}

const SHOW: Record<StatId, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' }
export const spreadText = (s: Spread) => STATS.filter((k) => s[k] > 0).map((k) => `${s[k]} ${SHOW[k]}`).join(' / ')

/** Normalised Showdown export. */
export function formatTeam(mons: TeamMon[]): string {
  return mons
    .map((m) => {
      const name = m.nickname ? `${m.nickname} (${m.species})` : m.species
      const ivs = STATS.filter((k) => m.ivs[k] !== 31).map((k) => `${m.ivs[k]} ${SHOW[k]}`).join(' / ')
      return [
        `${name}${m.gender ? ` (${m.gender})` : ''}${m.item ? ` @ ${m.item}` : ''}`,
        m.ability && `Ability: ${m.ability}`,
        `Level: ${m.level}`,
        m.teraType && `Tera Type: ${m.teraType}`,
        total(m.evs) > 0 && `EVs: ${spreadText(m.evs)}`,
        m.nature && `${m.nature} Nature`,
        ivs && `IVs: ${ivs}`,
        ...m.moves.map((x) => `- ${x}`),
      ].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

/** "https://pokepast.es/<id>" → id (null when it isn't a Pokepaste link). */
export const pokepasteId = (text: string) => text.trim().match(/^(?:https?:\/\/)?pokepast\.es\/([0-9a-f]{10,20})(?:\/(?:raw|json))?\/?$/i)?.[1] ?? null
