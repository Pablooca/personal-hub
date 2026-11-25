/** PTCG Live / Limitless deck-list parser and validator (60 cards). */
export type DeckSection = 'pokemon' | 'trainer' | 'energy'
export const DECK_SECTIONS: DeckSection[] = ['pokemon', 'trainer', 'energy']
export const DECK_SIZE = 60

export interface DeckCard {
  count: number
  name: string
  set: string
  number: string
  section: DeckSection
}

export interface ParsedDeck {
  cards: DeckCard[]
  counts: Record<DeckSection, number>
  total: number
  errors: string[]
  warnings: string[]
  valid: boolean
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, "'").toLowerCase().trim()

const HEADING: [RegExp, DeckSection][] = [
  [/^(pokemon)\b/, 'pokemon'],
  [/^(trainers?|entrenador(es)?)\b/, 'trainer'],
  [/^(energy|energies|energias?)\b/, 'energy'],
]
const LABEL: Record<DeckSection, string> = { pokemon: 'Pokémon', trainer: 'Entrenador', energy: 'Energía' }

const BASIC_ENERGY = /^(basic )?(\{[a-z]\}|grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy) energy( basic)?$|^energia (basica )?(de )?(tipo )?(planta|fuego|agua|rayo|psiquica|lucha|oscura|oscuridad|metal|metalica)/
export const isBasicEnergy = (name: string) => BASIC_ENERGY.test(fold(name))

// "4 Mega Kangaskhan ex MEG 104", "* 2 Card SVP 12 PH", "1 Card PR-SV 12"
const LINE = /^[*•\-–]?\s*(\d{1,2})\s*[x×]?\s+(.+?)\s*$/
const PRINT = /^(.+?)\s+\(?([A-Z0-9]{2,5}(?:-[A-Z0-9]{2,4})?)\)?\s+((?:TG|GG|SV|RC|H|SH)?\d{1,3}[a-z]?)(?:\s+(?:PH|RH|F|\*F\*))?$/

function heading(line: string): { section: DeckSection; declared: number | null } | null {
  const f = fold(line).replace(/^[#*]+\s*/, '')
  for (const [re, section] of HEADING) {
    if (!re.test(f)) continue
    const rest = f.replace(re, '').trim()
    // A heading only carries an optional count: "Pokémon: 14", "Trainer - 31", "Energy (15)"
    const m = rest.match(/^\s*(?:cards?|cartas?)?\s*[:\-–(]*\s*(\d{1,2})?\s*\)?\s*$/)
    if (m) return { section, declared: m[1] ? Number(m[1]) : null }
  }
  return null
}

export function parseDeck(text: string, aceSpecs: readonly string[] = []): ParsedDeck {
  const errors: string[] = []
  const warnings: string[] = []
  const cards: DeckCard[] = []
  const declared: Partial<Record<DeckSection, number>> = {}
  let section: DeckSection | null = null
  let group = 0 // blank-line separated groups, for lists without headings
  let groupHasCards = false
  let declaredTotal: number | null = null

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line) {
      if (groupHasCards) group++
      groupHasCards = false
      return
    }
    const h = heading(line)
    if (h) {
      section = h.section
      if (h.declared !== null) declared[h.section] = h.declared
      return
    }
    const total = fold(line).match(/^(?:total cards|cartas totales|total de cartas|total)\s*[:\-–]?\s*(\d+)/)
    if (total) {
      declaredTotal = Number(total[1])
      return
    }
    const m = line.match(LINE)
    if (!m) {
      if (!/^(\/\/|#|deck|mazo|\*{3})/i.test(line)) errors.push(`Línea ${i + 1}: no se entiende «${line.slice(0, 60)}».`)
      return
    }
    const print = m[2].match(PRINT)
    const name = (print ? print[1] : m[2]).trim()
    const byName: DeckSection | null = isBasicEnergy(name) ? 'energy' : null
    const guessed: DeckSection = section ?? byName ?? DECK_SECTIONS[Math.min(group, 2)]
    groupHasCards = true
    const card: DeckCard = { count: Number(m[1]), name, set: print ? print[2] : '', number: print ? print[3] : '', section: guessed }
    if (card.count < 1) {
      errors.push(`Línea ${i + 1}: la cantidad debe ser al menos 1.`)
      return
    }
    if (!print && !isBasicEnergy(name)) warnings.push(`«${name}» no tiene código de colección: no se mostrará su imagen.`)
    const same = cards.find((c) => c.name === card.name && c.set === card.set && c.number === card.number && c.section === card.section)
    if (same) same.count += card.count
    else cards.push(card)
  })

  const counts: Record<DeckSection, number> = { pokemon: 0, trainer: 0, energy: 0 }
  for (const c of cards) counts[c.section] += c.count
  const total = counts.pokemon + counts.trainer + counts.energy

  if (!cards.length) errors.push('La lista está vacía.')
  else if (total !== DECK_SIZE) errors.push(`El mazo tiene ${total} cartas: ${total < DECK_SIZE ? `faltan ${DECK_SIZE - total}` : `sobran ${total - DECK_SIZE}`}.`)
  if (cards.length && counts.pokemon === 0) errors.push('El mazo necesita al menos un Pokémon Básico.')
  for (const s of DECK_SECTIONS) {
    const d = declared[s]
    if (d !== undefined && d !== counts[s]) warnings.push(`${LABEL[s]}: la cabecera dice ${d} y hay ${counts[s]}.`)
  }
  if (declaredTotal !== null && declaredTotal !== total) warnings.push(`La lista declara ${declaredTotal} cartas en total y hay ${total}.`)

  // Max 4 cards with the same name (any print), except basic energy.
  const byName = new Map<string, { name: string; count: number }>()
  for (const c of cards) {
    if (c.section === 'energy' && isBasicEnergy(c.name)) continue
    const k = fold(c.name)
    const e = byName.get(k) ?? { name: c.name, count: 0 }
    e.count += c.count
    byName.set(k, e)
  }
  for (const e of byName.values()) if (e.count > 4) errors.push(`«${e.name}»: ${e.count} copias (máximo 4).`)

  const ace = new Set(aceSpecs.map(fold))
  const aceCards = [...byName.entries()].filter(([k]) => ace.has(k)).map(([, e]) => e)
  const aceCount = aceCards.reduce((a, e) => a + e.count, 0)
  if (aceCount > 1) errors.push(`Solo se permite 1 carta AS TÁCTICO (ACE SPEC): hay ${aceCount} (${aceCards.map((e) => e.name).join(', ')}).`)

  return { cards, counts, total, errors, warnings, valid: errors.length === 0 }
}

/** Normalised PTCGL text. */
export function formatDeck(deck: ParsedDeck): string {
  const head: Record<DeckSection, string> = { pokemon: 'Pokémon', trainer: 'Trainer', energy: 'Energy' }
  return DECK_SECTIONS.map((s) => {
    const rows = deck.cards.filter((c) => c.section === s)
    if (!rows.length) return ''
    return [`${head[s]}: ${deck.counts[s]}`, ...rows.map((c) => [c.count, c.name, c.set, c.number].filter(Boolean).join(' '))].join('\n')
  })
    .filter(Boolean)
    .join('\n\n')
}
