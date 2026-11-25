import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allocate, cardmarketUrl, collectionCsv, missingFor, missingText, printKey, signatureOf, stackKey, totals, valueOf, type Print } from './collection.ts'
import { parseDeck } from './deck.ts'
import { EXAMPLE_DECK } from './examples.ts'
import { cpSeason, diffLists, versionOn } from './season.ts'
import type { OwnedCard, TcgDeck, Tournament } from '../types.ts'

let n = 0
const C = (set: string, number: string, name: string, quantity: number, o: Partial<OwnedCard> = {}): OwnedCard => ({
  id: `c${++n}`, tcgdex_id: `${set}-${number}`, set_code: set, set_name: '', number, name, name_en: name, category: 'trainer', signature: `t|${name.toLowerCase()}`, rarity: '', image: null, language: 'es', condition: 'NM', finish: 'normal',
  first_edition: false, signed: false, altered: false, grade_company: '', grade: '', quantity, location: '', for_sale: false, paid: null, acquired_at: null, cm_product: 1, ref_low: 1, ref_trend: 2, ref_date: null, own_price: null, own_price_date: null, notes: '', created_at: '', ...o,
})
const D = (id: string, list_text: string, o: Partial<TcgDeck> = {}): TcgDeck => ({ id, name: id, format: '', icons: [], list_text, notes: '', is_built: true, created_at: id, ...o })
const P = (set: string, number: string, name: string, signature: string): [string, Print] => [printKey(set, number), { id: '', set, number, name, category: 'pokemon', signature, image: null, rarity: '', cm: null, low: 2, trend: 3, lowHolo: null, trendHolo: null }]
const none = new Map<string, Print>()

test('value: the price noted in my language wins; otherwise Cardmarket’s lowest, marked as an estimate', () => {
  assert.deepEqual(valueOf(C('A', '1', 'x', 1), '2026-11-25'), { unit: 1, source: 'ref', stale: false })
  assert.deepEqual(valueOf(C('A', '1', 'x', 1, { own_price: 5, own_price_date: '2026-11-20' }), '2026-11-25'), { unit: 5, source: 'own', stale: false })
  assert.equal(valueOf(C('A', '1', 'x', 1, { own_price: 5, own_price_date: '2026-09-20' }), '2026-11-25').stale, true)
  assert.equal(valueOf(C('A', '1', 'x', 1, { grade_company: 'PSA' }), '2026-11-25').unit, null)
  const t = totals([C('A', '1', 'x', 3, { own_price: 5, own_price_date: '2026-11-24', for_sale: true, paid: 2 }), C('A', '2', 'y', 2), C('A', '3', 'z', 1, { ref_low: null })], '2026-11-25')
  assert.deepEqual([t.cards, t.unique, t.confirmed, t.estimated, t.forSale, t.paid, t.withoutPrice, t.toReview], [6, 3, 15, 2, 15, 6, 1, 2])
})

test('Cardmarket link: product, language and reverse', () => {
  const u = new URL(cardmarketUrl(C('A', '1', 'x', 1, { cm_product: 851175, language: 'es', finish: 'masterball' })))
  assert.deepEqual([u.hostname, u.searchParams.get('idProduct'), u.searchParams.get('language'), u.searchParams.get('isReverseHolo')], ['www.cardmarket.com', '851175', '4', 'Y'])
  assert.ok(cardmarketUrl(C('MEG', '1', 'Ultra Ball', 1, { cm_product: null })).includes('searchString=Ultra+Ball+MEG'))
})

test('signatures: reprints of trainers and energies match, different Pokémon with the same name do not', () => {
  assert.equal(signatureOf({ id: '', name: 'Ultra Ball', category: 'Trainer' }), 't|ultra ball')
  assert.equal(signatureOf({ id: '', name: 'Basic Fire Energy', category: 'Energy' }), signatureOf({ id: '', name: 'Fire Energy', category: 'Energy' }))
  const a = signatureOf({ id: '', name: 'Pikachu', category: 'Pokemon', hp: 60, attacks: [{ name: 'Gnaw', damage: 10, cost: ['L'] }] })
  assert.notEqual(a, signatureOf({ id: '', name: 'Pikachu', category: 'Pokemon', hp: 70, attacks: [{ name: 'Gnaw', damage: 10, cost: ['L'] }] }))
})

test('built decks lock their cards; reprints are used; the cheapest copies go first', () => {
  const dear = C('MEG', '131', 'Ultra Ball', 2, { own_price: 3 })
  const cheap = C('SVI', '196', 'Ultra Ball', 3, { ref_low: 0.05 })
  const a = allocate([dear, cheap], [D('1', 'Trainer: 4\n4 Ultra Ball SVI 196')], none)
  assert.deepEqual([a.decks[0].have, a.free.get(cheap.id), a.free.get(dear.id)], [4, 0, 1])
  assert.deepEqual(a.usedIn.get(cheap.id), [{ deck: '1', n: 3 }])
  // Not built → nothing is locked.
  assert.equal(allocate([dear, cheap], [D('1', 'Trainer: 4\n4 Ultra Ball SVI 196', { is_built: false })], none).free.get(cheap.id), 3)
})

test('two decks compete for the same copies; graded and Asian cards are not playable', () => {
  const x = C('MEG', '131', 'Ultra Ball', 5)
  const slab = C('MEG', '131', 'Ultra Ball', 4, { grade_company: 'PSA' })
  const jp = C('M1L', '131', 'Ultra Ball', 4, { language: 'ja' })
  const list = 'Trainer: 4\n4 Ultra Ball MEG 131'
  const a = allocate([x, slab, jp], [D('1', list), D('2', list)], none)
  assert.deepEqual(a.decks.map((d) => d.have), [4, 1])
})

test('what is missing from a list counts only free copies, and says where the others are', () => {
  const cards = [C('MEG', '131', 'Ultra Ball', 6), C('SSP', '76', 'Latias ex', 1, { category: 'pokemon', signature: 'p|latias' })]
  const alloc = allocate(cards, [D('Mazo A', 'Trainer: 4\n4 Ultra Ball MEG 131')], none)
  const list = parseDeck('Pokémon: 2\n2 Latias ex SSP 76\n\nTrainer: 5\n4 Ultra Ball MEG 131\n1 Judge POR 76').cards
  const m = missingFor(list, cards, alloc, new Map([P('SSP', '76', 'Latias ex', 'p|latias')]))
  assert.deepEqual(m.map((l) => [l.line.name, l.owned, l.free, l.missing]), [['Latias ex', 1, 1, 1], ['Ultra Ball', 6, 2, 2], ['Judge', 0, 0, 1]])
  assert.deepEqual(m[1].lockedIn, [{ deck: 'Mazo A', n: 4 }])
  assert.equal(missingText(m), '1 Latias ex SSP 76\n2 Ultra Ball MEG 131\n1 Judge POR 76')
  // A different print of the same Pokémon counts once its signature is known.
  const other = missingFor(parseDeck('Pokémon: 1\n1 Latias ex PRE 160').cards, cards, alloc, new Map([P('PRE', '160', 'Latias ex', 'p|latias')]))
  assert.deepEqual([other[0].missing, other[0].unverified], [0, false])
  assert.equal(missingFor(parseDeck('Pokémon: 1\n1 Latias ex PRE 160').cards, cards, alloc, none)[0].unverified, true)
})

test('the example deck against a full collection: nothing missing', () => {
  const lines = parseDeck(EXAMPLE_DECK.list_text).cards
  const cards = lines.map((l) => C(l.set, l.number, l.name, l.count, { signature: `x|${l.set}${l.number}` }))
  const a = allocate(cards, [D('1', EXAMPLE_DECK.list_text)], none)
  assert.deepEqual([a.decks[0].need, a.decks[0].have], [60, 60])
  assert.equal(missingFor(lines, cards, a, none).reduce((s, l) => s + l.missing, 0), 60)
})

test('stacks and CSV', () => {
  assert.notEqual(stackKey(C('A', '1', 'x', 1)), stackKey(C('A', '1', 'x', 1, { language: 'en' })))
  const csv = collectionCsv([C('A', '1', '=cmd', 2, { own_price: 1.5, own_price_date: '2026-11-25' })], '2026-11-25')
  assert.ok(csv.includes("2;'=cmd;A;1") && csv.includes('1,50;mi idioma;3,00'))
})

const T = (category: Tournament['category'], cp: number, date = '2026-11-01', game: Tournament['game'] = 'tcg'): Tournament => ({ id: `${++n}`, category, cp, date, game }) as Tournament
test('CP of the season: best results per group, what a new one must beat', () => {
  const s = cpSeason([T('league_cup', 50), T('league_cup', 25), T('league_cup', 32), T('league_cup', 20), T('league_cup', 40), T('league_challenge', 15), T('regional', 120), T('league_cup', 50, '2026-03-01'), T('league_cup', 50, '2026-11-01', 'vgc')], 'tcg')
  const cup = s.groups.find((g) => g.id === 'cup')!
  assert.deepEqual([cup.points, cup.counted.length, cup.dropped.map((t) => t.cp), cup.toBeat], [147, 4, [20], 25])
  assert.deepEqual([s.total, s.raw], [282, 302])
  assert.equal(s.groups.find((g) => g.id === 'challenge')!.toBeat, null)
})

test('deck versions: differences and which one was in use', () => {
  assert.deepEqual(diffLists([{ name: 'A', count: 4 }, { name: 'B', count: 1 }], [{ name: 'A', count: 3 }, { name: 'C', count: 2 }]), [{ name: 'C', before: 0, after: 2 }, { name: 'A', before: 4, after: 3 }, { name: 'B', before: 1, after: 0 }])
  const v = [{ from_date: '2026-11-10', id: 'b' }, { from_date: '2026-10-01', id: 'a' }]
  assert.deepEqual(['2026-09-01', '2026-10-15', '2026-11-10'].map((d) => versionOn(v, d)!.id), ['a', 'a', 'b'])
  assert.equal(versionOn([], '2026-01-01'), null)
})
