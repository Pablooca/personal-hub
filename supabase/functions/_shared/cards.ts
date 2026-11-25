/**
 * "Do I have this card?" — search in the collection and the answer for Telegram.
 * Uses the app's own allocation, so decks and free copies always match the app.
 */
import { allocate, finishName, languageOf, printKey, valueOf, type Print } from '../../../src/lib/pokemon/collection.ts'
import { isPlayable } from '../../../src/lib/pokemon/legality.ts'
import { parseDeck } from '../../../src/lib/pokemon/deck.ts'
import type { OwnedCard, TcgDeck } from '../../../src/lib/types.ts'
import { escapeHtml, euro } from './telegram.ts'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const words = (s: string) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => (/^\d+$/.test(w) ? String(Number(w)) : w))
/** Every word of the query, whole ("mew" is not "mewtwo"). */
export const matches = (query: readonly string[], text: string) => {
  const t = new Set(words(text))
  return query.length > 0 && query.every((w) => t.has(w))
}
export const searchOwned = (cards: readonly OwnedCard[], query: string): OwnedCard[] => {
  const q = words(query)
  return cards.filter((c) => [c.name, c.name_en, `${c.set_code} ${c.number}`].some((x) => matches(q, `${x} ${c.set_code} ${c.number}`)) )
}

/** Deck lines that could be one of these cards, so only their prints have to be looked up. */
export function relevantDecks(decks: readonly TcgDeck[], cards: readonly OwnedCard[]): { decks: TcgDeck[]; prints: { set: string; number: string }[] } {
  const names = new Set(cards.flatMap((c) => [c.name, c.name_en]).map((n) => words(n).join(' ')))
  const keys = new Set(cards.map((c) => printKey(c.set_code, c.number)))
  const energy = cards.some((c) => c.category === 'energy')
  const prints = new Map<string, { set: string; number: string }>()
  const out = decks.map((d) => {
    const lines = parseDeck(d.list_text).cards.filter((l) => names.has(words(l.name).join(' ')) || (l.set !== '' && keys.has(printKey(l.set, l.number))) || (energy && l.section === 'energy'))
    for (const l of lines) if (l.set && l.section === 'pokemon') prints.set(printKey(l.set, l.number), { set: l.set, number: l.number })
    const heading = { pokemon: 'Pokémon:', trainer: 'Trainer:', energy: 'Energy:' }
    return { ...d, list_text: lines.map((l) => `${heading[l.section]}\n${[l.count, l.name, l.set, l.number].filter(Boolean).join(' ')}`).join('\n') }
  })
  return { decks: out, prints: [...prints.values()] }
}

/** Copies a built deck asks for by name, for cards that are not in the collection. */
export function inLists(decks: readonly TcgDeck[], query: string): { deck: string; n: number }[] {
  const q = words(query)
  return decks
    .filter((d) => d.is_built !== false)
    .map((d) => ({ deck: d.name, n: parseDeck(d.list_text).cards.filter((l) => matches(q, `${l.name} ${l.set} ${l.number}`)).reduce((a, l) => a + l.count, 0) }))
    .filter((x) => x.n > 0)
}

const copies = (n: number) => `${n} ${n === 1 ? 'copia' : 'copias'}`
const shortDate = (k: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${k}T00:00:00Z`))

function priceText(c: OwnedCard, today: string): string {
  const v = valueOf(c, today)
  if (v.unit === null) return 'sin precio'
  const total = c.quantity > 1 ? ` (${euro(v.unit * c.quantity)} en total)` : ''
  if (v.source === 'own') return `${euro(v.unit)}${total}, mínimo en ${languageOf(c.language)[1].toLowerCase()}${c.own_price_date ? ` (${shortDate(c.own_price_date)})` : ''}${v.stale ? ' ⚠️ antiguo' : ''}`
  return `≈ ${euro(v.unit)}${total}, mínimo en cualquier idioma`
}

/** `related` = every owned card that shares signature with a hit (they compete for the same deck slots). */
export function foundText(hits: readonly OwnedCard[], related: readonly OwnedCard[], decks: readonly TcgDeck[], prints: ReadonlyMap<string, Print>, today: string): string {
  const alloc = allocate(related, decks, prints)
  const groups = new Map<string, OwnedCard[]>()
  for (const c of hits) groups.set(c.signature, [...(groups.get(c.signature) ?? []), c])
  const list = [...groups.values()].sort((a, b) => b.reduce((n, c) => n + c.quantity, 0) - a.reduce((n, c) => n + c.quantity, 0))
  const shown = list.slice(0, 5)
  const out = shown.map((cards) => {
    const total = cards.reduce((a, c) => a + c.quantity, 0)
    const free = cards.reduce((a, c) => a + (alloc.free.get(c.id) ?? c.quantity), 0)
    const byDeck = new Map<string, number>()
    for (const c of cards) for (const u of alloc.usedIn.get(c.id) ?? []) byDeck.set(u.deck, (byDeck.get(u.deck) ?? 0) + u.n)
    const head = [
      `✅ <b>Sí tienes ${escapeHtml(cards[0].name)}</b>: ${copies(total)}`,
      `🎴 En mazo: <b>${total - free}</b>${byDeck.size ? ` (${[...byDeck].map(([d, n]) => `${n} en ${escapeHtml(d)}`).join(', ')})` : ''} · Fuera: <b>${free}</b>`,
    ]
    const rows = cards.slice(0, 6).map((c) => {
      const f = alloc.free.get(c.id) ?? c.quantity
      const kind = [c.condition, c.finish !== 'normal' ? finishName(c.finish) : '', c.grade_company ? `${c.grade_company} ${c.grade}`.trim() : '', isPlayable(c) ? '' : 'no jugable', c.for_sale ? 'en venta' : ''].filter(Boolean).join(' · ')
      const split = cards.length > 1 ? ` (${c.quantity - f} en mazo, ${f} fuera)` : ''
      return `\n• <b>${escapeHtml(`${c.set_code} ${c.number}`)}</b> · ${languageOf(c.language)[1]} · ${escapeHtml(kind)}\n   ${copies(c.quantity)}${split}\n   📍 ${c.location ? escapeHtml(c.location) : 'sin indicar'}\n   💶 ${priceText(c, today)}`
    })
    if (cards.length > 6) rows.push(`\n… y ${cards.length - 6} versiones más`)
    return [...head, ...rows].join('\n')
  })
  if (list.length > shown.length) out.push(`… y ${list.length - shown.length} cartas más. Concreta el nombre o el número.`)
  return out.join('\n\n')
}

/** `known`: does a card with that name exist? null = could not be checked. */
export function notFoundText(query: string, lists: readonly { deck: string; n: number }[], known: boolean | null): string {
  const out = [`❌ <b>No tienes «${escapeHtml(query)}»</b> en tu colección.`]
  if (lists.length) out.push(`Aparece en la lista de ${lists.map((l) => `${escapeHtml(l.deck)} (${l.n})`).join(', ')}, pero esas copias no están apuntadas en la colección.`)
  else if (known === false) out.push('Tampoco encuentro ninguna carta con ese nombre: revisa cómo está escrito.')
  return out.join('\n')
}
