/** Card collection: valuation, deck allocation and "what am I missing". Pure functions. */
import type { OwnedCard, TcgDeck } from '../types.ts'
import { isBasicEnergy, parseDeck, type DeckCard } from './deck.ts'

// ---------------------------------------------------------------- attributes
/** [code, Spanish name, Cardmarket language id, short] */
export const LANGUAGES = [
  ['es', 'Español', 4, 'ES'], ['en', 'Inglés', 1, 'EN'], ['fr', 'Francés', 2, 'FR'], ['de', 'Alemán', 3, 'DE'], ['it', 'Italiano', 5, 'IT'], ['pt', 'Portugués', 8, 'PT'],
  ['ja', 'Japonés', 7, 'JP'], ['ko', 'Coreano', 10, 'KR'], ['zh-cn', 'Chino simplificado', 6, 'CN'], ['zh-tw', 'Chino tradicional', 11, 'TW'],
] as const
export type CardLanguage = (typeof LANGUAGES)[number][0]
export const languageOf = (code: string) => LANGUAGES.find((l) => l[0] === code) ?? LANGUAGES[0]
/** Languages whose prints share set and number with the English ones (and can be mixed in a deck here). */
export const isWestern = (code: string) => ['es', 'en', 'fr', 'de', 'it', 'pt'].includes(code)

/** Cardmarket conditions: [code, name, id]. */
export const CONDITIONS = [
  ['MT', 'Mint', 1], ['NM', 'Near Mint', 2], ['EX', 'Excellent', 3], ['GD', 'Good', 4], ['LP', 'Light Played', 5], ['PL', 'Played', 6], ['PO', 'Poor', 7],
] as const
export type CardCondition = (typeof CONDITIONS)[number][0]

/** [code, name, does Cardmarket price it as reverse/holo?] */
export const FINISHES = [
  ['normal', 'Normal', false], ['holo', 'Holo', false], ['reverse', 'Reverse Holo', true], ['pokeball', 'Reverse Poké Ball', true], ['masterball', 'Reverse Master Ball', true],
  ['energy', 'Reverse energía', true], ['cosmos', 'Cosmos Holo', false], ['stamped', 'Con sello (promo)', false], ['jumbo', 'Jumbo', false], ['other', 'Otro', false],
] as const
export type CardFinish = (typeof FINISHES)[number][0]
export const finishName = (code: string) => FINISHES.find((f) => f[0] === code)?.[1] ?? code
export const isReverse = (code: string) => FINISHES.find((f) => f[0] === code)?.[2] ?? false

export const GRADERS = ['PSA', 'BGS', 'CGC', 'PCA', 'GRAAD', 'Otra'] as const

/** Kinds of card to filter by. */
export const CARD_KINDS = [
  ['pokemon', 'Pokémon'], ['supporter', 'Partidario'], ['stadium', 'Estadio'], ['item', 'Objeto'], ['tool', 'Herramienta'], ['energy', 'Energía'],
] as const
export type CardKind = (typeof CARD_KINDS)[number][0]
/** Kind of trainer as TCGdex writes it. The old ones without one ("Trainer" alone, technical machines) are items. */
export function trainerSubtype(type: string | undefined): Exclude<OwnedCard['subtype'], ''> {
  const t = (type ?? '').toLowerCase()
  return t === 'supporter' || t === 'stadium' || t === 'tool' ? t : 'item'
}
export const kindOf = (c: Pick<OwnedCard, 'category' | 'subtype'>): CardKind | null => (c.category === 'trainer' ? c.subtype || null : c.category)

// -------------------------------------------------------------------- prints
/** What we keep about a print (from TCGdex, English). */
export interface Print {
  id: string
  set: string
  number: string
  name: string
  category: 'pokemon' | 'trainer' | 'energy'
  signature: string
  image: string | null
  rarity: string
  cm: number | null
  low: number | null
  trend: number | null
  lowHolo: number | null
  trendHolo: number | null
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, "'").toLowerCase().replace(/\s+/g, ' ').trim()
const energyType = (name: string) => fold(name).replace(/\b(basic|energy)\b/g, '').replace(/[{}]/g, '').trim()

interface RawCard {
  id: string
  name: string
  category?: string
  hp?: number
  attacks?: { name?: string; damage?: string | number; cost?: string[] }[]
  abilities?: { name?: string }[]
}
/** Two prints with the same signature are the same card for deck building. */
export function signatureOf(c: RawCard): string {
  const cat = fold(c.category ?? '')
  if (cat.startsWith('energ')) return isBasicEnergy(c.name) || /^basic .* energy$/i.test(c.name) ? `e|${energyType(c.name)}` : `e|${fold(c.name)}`
  if (cat.startsWith('pok')) {
    const atk = (c.attacks ?? []).map((a) => `${fold(a.name ?? '')}:${String(a.damage ?? '')}:${(a.cost ?? []).length}`).join(',')
    const abi = (c.abilities ?? []).map((a) => fold(a.name ?? '')).join(',')
    return `p|${fold(c.name)}|${c.hp ?? ''}|${abi}|${atk}`
  }
  return `t|${fold(c.name)}`
}
export const printKey = (set: string, number: string) => `${set.toUpperCase()}-${number.replace(/^0+(?=\d)/, '').toUpperCase()}`

/** Signature of a list line: exact when its print is known, by name for trainers and energy otherwise. */
export function lineSignature(c: Pick<DeckCard, 'name' | 'set' | 'number' | 'section'>, prints: ReadonlyMap<string, Print>): string | null {
  const p = c.set ? prints.get(printKey(c.set, c.number)) : undefined
  if (p) return p.signature
  if (c.section === 'energy') return isBasicEnergy(c.name) ? `e|${energyType(c.name)}` : `e|${fold(c.name)}`
  if (c.section === 'trainer') return `t|${fold(c.name)}`
  return null
}

// ----------------------------------------------------------------- valuation
export const STALE_DAYS = 30
export interface Value {
  unit: number | null
  /** 'own' = lowest in its language, noted by hand · 'ref' = Cardmarket's lowest in any language. */
  source: 'own' | 'ref' | 'none'
  stale: boolean
}

export function valueOf(c: OwnedCard, today: string): Value {
  if (c.own_price !== null) {
    const age = c.own_price_date ? (Date.parse(today) - Date.parse(c.own_price_date)) / 86_400_000 : 999
    return { unit: c.own_price, source: 'own', stale: age > STALE_DAYS }
  }
  // A graded card has nothing to do with the raw price.
  if (c.grade_company) return { unit: null, source: 'none', stale: false }
  return c.ref_low !== null ? { unit: c.ref_low, source: 'ref', stale: false } : { unit: null, source: 'none', stale: false }
}

export interface Totals {
  cards: number
  unique: number
  confirmed: number
  estimated: number
  forSale: number
  paid: number
  withoutPrice: number
  toReview: number
}
export function totals(cards: readonly OwnedCard[], today: string): Totals {
  const t: Totals = { cards: 0, unique: 0, confirmed: 0, estimated: 0, forSale: 0, paid: 0, withoutPrice: 0, toReview: 0 }
  for (const c of cards) {
    const v = valueOf(c, today)
    t.cards += c.quantity
    t.unique++
    if (v.unit !== null) {
      if (v.source === 'own') t.confirmed += v.unit * c.quantity
      else t.estimated += v.unit * c.quantity
      if (c.for_sale) t.forSale += v.unit * c.quantity
    } else t.withoutPrice++
    if (v.source !== 'own' || v.stale) t.toReview++
    if (c.paid !== null) t.paid += c.paid * c.quantity
  }
  return t
}

/** Offers for this exact card in its language (and finish), cheapest first. */
export function cardmarketUrl(c: Pick<OwnedCard, 'cm_product' | 'language' | 'finish' | 'first_edition' | 'signed' | 'altered' | 'name_en' | 'set_code'>): string {
  const base = 'https://www.cardmarket.com/es/Pokemon/Products'
  const q = new URLSearchParams()
  if (!c.cm_product) {
    q.set('searchString', `${c.name_en} ${c.set_code}`.trim())
    return `${base}/Search?${q}`
  }
  q.set('idProduct', String(c.cm_product))
  q.set('language', String(languageOf(c.language)[2]))
  if (isReverse(c.finish)) q.set('isReverseHolo', 'Y')
  if (c.first_edition) q.set('isFirstEd', 'Y')
  if (c.signed) q.set('isSigned', 'Y')
  if (c.altered) q.set('isAltered', 'Y')
  return `${base}?${q}`
}

// ---------------------------------------------------------------- allocation
export interface LineUse {
  line: DeckCard
  need: number
  have: number
  /** Owned row id → copies used. */
  from: Map<string, number>
}
export interface DeckUse {
  deck: Pick<TcgDeck, 'id' | 'name'>
  lines: LineUse[]
  need: number
  have: number
}
export interface Allocation {
  decks: DeckUse[]
  /** Owned row id → copies not in any built deck. */
  free: Map<string, number>
  /** Owned row id → decks that use it. */
  usedIn: Map<string, { deck: string; n: number }[]>
}

/** Raw, playable copies (a graded card stays in its slab). */
export const playable = (c: OwnedCard) => isWestern(c.language) && !c.grade_company && c.finish !== 'jumbo'

function takeFor(line: DeckCard, need: number, cards: readonly OwnedCard[], free: Map<string, number>, prints: ReadonlyMap<string, Print>): LineUse {
  const use: LineUse = { line, need, have: 0, from: new Map() }
  const sig = lineSignature(line, prints)
  const key = line.set ? printKey(line.set, line.number) : ''
  const exact = (c: OwnedCard) => key !== '' && printKey(c.set_code, c.number) === key
  const same = (c: OwnedCard) => sig !== null && c.signature === sig
  for (const test of [exact, same]) {
    for (const c of cards) {
      if (use.have >= need) return use
      if (!playable(c) || !test(c)) continue
      const n = Math.min(free.get(c.id) ?? 0, need - use.have)
      if (n <= 0) continue
      free.set(c.id, (free.get(c.id) ?? 0) - n)
      use.from.set(c.id, (use.from.get(c.id) ?? 0) + n)
      use.have += n
    }
  }
  return use
}

/** Built decks take their copies first, in the order they were created. */
export function allocate(cards: readonly OwnedCard[], decks: readonly TcgDeck[], prints: ReadonlyMap<string, Print>): Allocation {
  // Cheapest copies go to the decks first, so the valuable ones stay free to sell.
  const order = [...cards].sort((a, b) => (a.own_price ?? a.ref_low ?? 0) - (b.own_price ?? b.ref_low ?? 0))
  const free = new Map(cards.map((c) => [c.id, c.quantity]))
  const usedIn = new Map<string, { deck: string; n: number }[]>()
  const out: DeckUse[] = []
  for (const deck of [...decks].filter((d) => d.is_built !== false).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const lines = parseDeck(deck.list_text).cards.map((l) => takeFor(l, l.count, order, free, prints))
    for (const l of lines) for (const [id, n] of l.from) usedIn.set(id, [...(usedIn.get(id) ?? []), { deck: deck.name, n }])
    out.push({ deck, lines, need: lines.reduce((a, l) => a + l.need, 0), have: lines.reduce((a, l) => a + l.have, 0) })
  }
  return { decks: out, free, usedIn }
}

export interface MissingLine {
  line: DeckCard
  need: number
  /** Owned in total, free, and locked inside built decks. */
  owned: number
  free: number
  missing: number
  lockedIn: { deck: string; n: number }[]
  print: Print | null
  /** Exact print unknown and no way to tell its reprints apart. */
  unverified: boolean
}

/** What a list needs that is not free in the collection. */
export function missingFor(list: readonly DeckCard[], cards: readonly OwnedCard[], alloc: Allocation, prints: ReadonlyMap<string, Print>): MissingLine[] {
  const free = new Map(alloc.free)
  return list.map((line) => {
    const use = takeFor(line, line.count, cards, free, prints)
    const sig = lineSignature(line, prints)
    const key = line.set ? printKey(line.set, line.number) : ''
    const mine = cards.filter((c) => playable(c) && ((key !== '' && printKey(c.set_code, c.number) === key) || (sig !== null && c.signature === sig)))
    const locked = new Map<string, number>()
    for (const c of mine) for (const u of alloc.usedIn.get(c.id) ?? []) locked.set(u.deck, (locked.get(u.deck) ?? 0) + u.n)
    return {
      line, need: line.count, owned: mine.reduce((a, c) => a + c.quantity, 0), free: use.have, missing: line.count - use.have,
      lockedIn: [...locked].map(([deck, n]) => ({ deck, n })), print: prints.get(key) ?? null, unverified: sig === null,
    }
  })
}

export const missingText = (lines: readonly MissingLine[]) => lines.filter((l) => l.missing > 0).map((l) => [l.missing, l.line.name, l.line.set, l.line.number].filter(Boolean).join(' ')).join('\n')

/** Same physical kind of card: adding it again only changes the quantity. */
export const stackKey = (c: Pick<OwnedCard, 'tcgdex_id' | 'language' | 'condition' | 'finish' | 'first_edition' | 'signed' | 'altered' | 'grade_company' | 'grade'>) =>
  [c.tcgdex_id, c.language, c.condition, c.finish, c.first_edition, c.signed, c.altered, c.grade_company, c.grade].join('|')

export function collectionCsv(cards: readonly OwnedCard[], today: string): string {
  const q = (s: string) => {
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const n = (x: number | null) => (x === null ? '' : x.toFixed(2).replace('.', ','))
  return [
    'cantidad;nombre;expansion;numero;rareza;idioma;estado;acabado;precio_unidad;origen_precio;total;ubicacion;en_venta',
    ...cards.map((c) => {
      const v = valueOf(c, today)
      return [c.quantity, q(c.name), c.set_code, c.number, q(c.rarity), languageOf(c.language)[3], c.condition, finishName(c.finish), n(v.unit), v.source === 'own' ? 'mi idioma' : v.source === 'ref' ? 'estimado' : '', n(v.unit === null ? null : v.unit * c.quantity), q(c.location), c.for_sale ? 'si' : ''].join(';')
    }),
  ].join('\n')
}
