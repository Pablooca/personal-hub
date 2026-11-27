/**
 * Unit tests for the Apple Pay webhook normaliser.
 * Run with:  npm run test:webhook   (Node ≥ 23)   or   deno test supabase/functions/tests
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categorize, extractPayment, isAutomaticCategory, matchOwnRule, noAmountMessage, resolveCategory, parseAmount, parseDate, parsePlainText } from '../apple-pay-webhook/normalize.ts'

const NOW = new Date('2026-11-22T17:41:00Z') // 18:41 in Madrid
const TZ = 'Europe/Madrid'

/** What index.ts does with a request body, minus I/O. */
function process(body: unknown) {
  const p = extractPayment(body)
  const merchant = p.merchant || 'Pago Apple Pay'
  return {
    source: p.source,
    amount: parseAmount(p.amount),
    merchant,
    card: p.card,
    date: parseDate(p.date, TZ, NOW),
    category: categorize(merchant),
  }
}

// ---------------------------------------------------------------- the 4 required cases
test('1. flat fields (curl)', () => {
  assert.deepEqual(process({ amount: '14,50 €', merchant: 'MERCADONA', card: 'DEBITO SMART', date: '' }), {
    source: 'flat', amount: 14.5, merchant: 'MERCADONA', card: 'DEBITO SMART', date: '2026-11-22', category: 'groceries',
  })
})

test('2. payload as object with Spanish keys', () => {
  const body = {
    payload: { Importe: '14,50 €', Comercio: 'MERCADONA', 'Tarjeta o cartera': 'DEBITO SMART', Fecha: '2026-11-22T18:41:00+01:00' },
  }
  assert.deepEqual(process(body), {
    source: 'object', amount: 14.5, merchant: 'MERCADONA', card: 'DEBITO SMART', date: '2026-11-22', category: 'groceries',
  })
})

test('3. payload as double-serialised JSON string', () => {
  const body = { payload: JSON.stringify({ Importe: '14,50 €', Comercio: 'MERCADONA', 'Tarjeta o cartera': 'DEBITO SMART', Fecha: '22 nov 2026, 18:41' }) }
  assert.deepEqual(process(body), {
    source: 'json-string', amount: 14.5, merchant: 'MERCADONA', card: 'DEBITO SMART', date: '2026-11-22', category: 'groceries',
  })
})

test('4. payload as plain Spanish sentence', () => {
  assert.deepEqual(process({ payload: '14,50 € en MERCADONA con DEBITO SMART' }), {
    source: 'text', amount: 14.5, merchant: 'MERCADONA', card: 'DEBITO SMART', date: '2026-11-22', category: 'groceries',
  })
})

// ---------------------------------------------------------------- key aliases
test('English keys, case and accent insensitive', () => {
  const r = process({ payload: { AMOUNT: 3.2, 'Card or Pass': 'Visa', Merchant: 'Starbucks Sevilla', CreatedAt: '2026-11-21' } })
  assert.equal(r.amount, 3.2)
  assert.equal(r.card, 'Visa')
  assert.equal(r.merchant, 'Starbucks Sevilla')
  assert.equal(r.date, '2026-11-21')
  assert.equal(r.category, 'dining')
})

test('accented / spaced Spanish keys', () => {
  const r = process({ payload: { 'Título ': 'CAFETERIA UPO', ' cantidad': '2,10 €', CUENTA: 'Nómina' } })
  assert.equal(r.amount, 2.1)
  assert.equal(r.merchant, 'CAFETERIA UPO')
  assert.equal(r.card, 'Nómina')
})

test('specific merchant key wins over generic Name', () => {
  const r = process({ payload: { Nombre: 'Juan', Establecimiento: 'LIDL', Precio: '8,99' } })
  assert.equal(r.merchant, 'LIDL')
})

test('flat fields take precedence, payload fills the gaps', () => {
  const r = process({ amount: '5', payload: { Importe: '99', Comercio: 'RENFE' } })
  assert.equal(r.amount, 5)
  assert.equal(r.merchant, 'RENFE')
  assert.equal(r.category, 'transport')
})

test('payload wrapped in an array', () => {
  assert.equal(process({ payload: [{ Importe: '1,00 €', Comercio: 'ALDI' }] }).amount, 1)
})

// ---------------------------------------------------------------- plain-text variants
test('plain text: "Pago de 14,50 € en MERCADONA"', () => {
  assert.deepEqual(parsePlainText('Pago de 14,50 € en MERCADONA'), { amount: '14,50', merchant: 'MERCADONA', card: '' })
})

test('plain text: "DEBITO SMART: 14,50 € en MERCADONA"', () => {
  assert.deepEqual(parsePlainText('DEBITO SMART: 14,50 € en MERCADONA'), { amount: '14,50', merchant: 'MERCADONA', card: 'DEBITO SMART' })
})

test('plain text: thousands and € before the number', () => {
  assert.equal(parseAmount(parsePlainText('Compra de €1.234,56 en EL CORTE INGLES').amount), 1234.56)
  assert.equal(parseAmount(parsePlainText('1.234,56 € en IKEA con VISA').amount), 1234.56)
})

test('plain text without merchant → default merchant, category uncategorized', () => {
  const r = process({ payload: 'Has pagado 7,80 €' })
  assert.equal(r.amount, 7.8)
  assert.equal(r.merchant, 'Pago Apple Pay')
  assert.equal(r.category, 'uncategorized')
})

test('merchant containing "EN" keeps the whole name up to "con"', () => {
  assert.equal(parsePlainText('3,00 € en PAN EN CASA con DEBITO SMART').merchant, 'PAN EN CASA')
})

// ---------------------------------------------------------------- invalid input → 400 path
test('no usable amount → null (index.ts answers 400)', () => {
  for (const body of [{}, { payload: '' }, { payload: 'hola' }, { payload: { Comercio: 'X' } }, { amount: '0,00 €' }, { payload: '{bad json' }, null, 'text']) {
    assert.equal(parseAmount(extractPayment(body).amount), null, JSON.stringify(body))
  }
})

test('negative / unicode-minus amounts become positive, rounded to 2 decimals', () => {
  assert.equal(parseAmount('−14,50 €'), 14.5)
  assert.equal(parseAmount('-3,999'), 3999) // "3,999" = thousands
  assert.equal(parseAmount(10.005), 10.01)
})

test("the user's own rules go before the built-in ones", () => {
  const rules = [{ pattern: 'tussam', category: 'transport' }, { pattern: 'Empire Games', category: 'pokémon' }, { pattern: 'empire', category: 'other' }]
  assert.equal(matchOwnRule(rules, 'COMPRA  Empire   Games Sevilla'), 'pokémon')
  assert.equal(matchOwnRule(rules, 'Mercadona'), null)
  assert.equal(matchOwnRule([{ pattern: ' ', category: 'x' }], 'Mercadona'), null)
})

test('only the merchant arrives (whole Shortcut Input in one field) → explains how to fix the Shortcut', () => {
  const e = extractPayment({ payload: 'Comercial Jardin' })
  assert.equal(parseAmount(e.amount), null)
  assert.match(noAmountMessage(e), /Solo ha llegado el comercio \(«Comercial Jardin»\), sin importe/)
  assert.equal(noAmountMessage(extractPayment({ amount: '0,00 €' })), 'No se ha encontrado un importe válido (> 0) en la petición: 0,00 €')
  assert.equal(noAmountMessage(extractPayment({})), 'No se ha encontrado un importe válido (> 0) en la petición')
})

test('category chosen in the Shortcut: internal name or app label, case/accent insensitive; automatic or unknown → null', () => {
  const mine = ['groceries', 'dining', 'gimnasio', 'pokémon', 'savings_withdrawal', 'other']
  assert.equal(extractPayment({ amount: '3', merchant: 'X', category: 'Supermercado' }).category, 'Supermercado')
  assert.equal(extractPayment({ payload: { Importe: '3', Categoría: 'Ocio' } }).category, 'Ocio')
  assert.equal(resolveCategory('Supermercado', mine), 'groceries')
  assert.equal(resolveCategory('restaurantes', mine), 'dining')
  assert.equal(resolveCategory('GIMNASIO', mine), 'gimnasio')
  assert.equal(resolveCategory('Pokemon', mine), 'pokémon')
  assert.equal(resolveCategory('Savings withdrawal', mine), 'savings_withdrawal')
  assert.equal(resolveCategory('Otros', mine), 'other')
  assert.equal(resolveCategory('Vivienda', mine), null) // not one of mine
  for (const auto of ['', 'Automática', 'auto', 'Sin categoría']) {
    assert.equal(isAutomaticCategory(auto), true, auto)
    assert.equal(resolveCategory(auto, mine), null)
  }
  assert.equal(isAutomaticCategory('Ocio'), false)
})
