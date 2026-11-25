import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foundText, inLists, notFoundText, relevantDecks, searchOwned } from '../_shared/cards.ts'
import { parseCommand } from '../_shared/bot.ts'
import type { OwnedCard, TcgDeck } from '../../../src/lib/types.ts'
import type { Print } from '../../../src/lib/pokemon/collection.ts'

const C = (o: Partial<OwnedCard>) => ({ id: 'a', tcgdex_id: 'sv08-076', set_code: 'SSP', set_name: '', number: '76', name: 'Latias ex', name_en: 'Latias ex', category: 'pokemon', signature: 'p|latias ex', rarity: '', image: null, language: 'es', condition: 'NM', finish: 'holo', first_edition: false, signed: false, altered: false, grade_company: '', grade: '', quantity: 3, location: 'Archivador <1>', for_sale: false, paid: null, acquired_at: null, cm_product: 1, ref_low: 3.99, ref_trend: 7, ref_date: null, own_price: 5, own_price_date: '2026-11-20', standard: true, standard_date: null, notes: '', created_at: '', user_id: '', ...o }) as OwnedCard
const deck = (list_text: string, o: Partial<TcgDeck> = {}) => ({ id: 'd', name: 'Mi mazo', list_text, is_built: true, created_at: '2026', ...o }) as TcgDeck
const today = '2026-11-25'
const none = new Map<string, Print>()

test('search: whole words, both names, set and number', () => {
  const cards = [C({}), C({ id: 'b', name: 'Mewtwo', name_en: 'Mewtwo', set_code: 'MEW', number: '150' }), C({ id: 'c', name: 'Juez', name_en: 'Judge', set_code: 'POR', number: '76' })]
  const ids = (q: string) => searchOwned(cards, q).map((c) => c.id).join()
  assert.equal(ids('latias'), 'a')
  assert.equal(ids('LATIAS EX'), 'a')
  assert.equal(ids('ssp 076'), 'a')
  assert.equal(ids('Latias SSP 76'), 'a')
  assert.equal(ids('mewt'), '')
  assert.equal(ids('judge'), 'c')
  assert.equal(ids('juez'), 'c')
  assert.equal(ids(''), '')
})

test('answer: copies, language, place, price, in decks and outside', () => {
  const rel = relevantDecks([deck('Pokémon: 4\n2 Latias ex SSP 76\n4 Dreepy TWM 128')], [C({})])
  assert.deepEqual(rel.prints, [{ set: 'SSP', number: '76' }])
  const t = foundText([C({})], [C({})], rel.decks, none, today)
  for (const x of ['Sí tienes Latias ex</b>: 3 copias', 'En mazo: <b>2</b> (2 en Mi mazo) · Fuera: <b>1</b>', 'SSP 76</b> · Español · NM · Holo', '📍 Archivador &lt;1&gt;', '5,00 € (15,00 € en total), mínimo en español (20 nov)']) assert.ok(t.includes(x), `${x}\n${t}`)
  const plain = foundText([C({ own_price: null, location: '', quantity: 1 })], [C({ own_price: null, location: '', quantity: 1 })], [], none, today)
  assert.ok(plain.includes('1 copia\n') && plain.includes('📍 sin indicar') && plain.includes('≈ 3,99 €, mínimo en cualquier idioma') && plain.includes('En mazo: <b>0</b> · Fuera: <b>1</b>'))
})

test('a reprint in the deck uses the copy I own', () => {
  const cards = [C({ name: 'Ultra Ball', name_en: 'Ultra Ball', set_code: 'SVI', number: '196', category: 'trainer', signature: 't|ultra ball' })]
  const rel = relevantDecks([deck('Trainer: 4\n2 Ultra Ball MEG 131')], cards)
  assert.ok(foundText(cards, cards, rel.decks, none, today).includes('En mazo: <b>2</b>'))
})

test('several places are told apart', () => {
  const cards = [C({ quantity: 1 }), C({ id: 'b', quantity: 2, location: 'Caja', language: 'en' })]
  const t = foundText(cards, cards, [], none, today)
  assert.ok(t.includes(': 3 copias') && t.includes('📍 Caja') && t.includes('Inglés') && t.includes('(0 en mazo, 2 fuera)'))
})

test('cards out of Standard say so', () => {
  const old = [C({ standard: false })]
  assert.ok(foundText(old, old, [], none, today).includes('no jugable'))
})

test('not found', () => {
  const lists = inLists([deck('Pokémon: 4\n4 Dreepy TWM 128'), deck('Pokémon: 4\n4 Dreepy TWM 128', { is_built: false })], 'dreepy')
  assert.deepEqual(lists, [{ deck: 'Mi mazo', n: 4 }])
  assert.match(notFoundText('dreepy', lists, true), /No tienes «dreepy».*\n.*Mi mazo \(4\)/)
  assert.match(notFoundText('<x>', [], false), /«&lt;x&gt;»[^]*Tampoco encuentro/)
  assert.doesNotMatch(notFoundText('x', [], true), /Tampoco/)
})

test('bot: asking for a card', () => {
  const q = (s: string) => parseCommand(s, today)
  for (const s of ['carta Latias ex', '¿Tengo Latias ex?', 'tengo la carta Latias ex', '¿Cuántas Latias ex tengo?', 'cuántas copias de Latias ex tengo', '/carta Latias ex', '¿Dónde está Latias ex?', 'dónde tengo Latias ex']) assert.deepEqual(q(s), { kind: 'card', query: 'Latias ex' }, s)
  assert.deepEqual(q('Latias ex'), { kind: 'unknown', text: 'Latias ex' })
  assert.equal(q('carta').kind, 'error')
  assert.equal(q('¿tengo?').kind, 'error')
  assert.equal(q('¿hoy?').kind, 'day')
})
