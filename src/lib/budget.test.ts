import { test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetLines, chargeDates, compareCategories, detectRecurring, matchRule, merchantKey, monthlyCost } from './budget.ts'
import { cleanConcept, markDuplicates, parseBankAmount, parseBankDate, parseCsv, parseStatement } from './bank.ts'
import type { Bill, Category, CategoryRule, Transaction } from './types.ts'

let n = 0
const T = (date: string, amount: number, concept: string, o: Partial<Transaction> = {}): Transaction => ({ id: `t${++n}`, date, amount, concept, type: 'expense', category: 'other', account: 'Banco', created_at: '', ...o })
const rule = (pattern: string, category: string, type: CategoryRule['type'] = 'expense'): CategoryRule => ({ id: pattern, pattern, category, type, created_at: '' })

test('rules: accents and case ignored, longest pattern wins, type respected', () => {
  const rules = [rule('uber', 'transport'), rule('Uber Eats', 'dining'), rule('Empresa', 'salary', 'income')]
  assert.equal(matchRule(rules, 'UBER   EATS Madrid', 'expense')?.category, 'dining')
  assert.equal(matchRule(rules, 'Úber trip', 'expense')?.category, 'transport')
  assert.equal(matchRule(rules, 'Nomina EMPRESA SL', 'income')?.category, 'salary')
  assert.equal(matchRule(rules, 'Nomina EMPRESA SL', 'expense'), null)
})

test('budgets: state and projection', () => {
  const c = (name: string, budget: number | null): Category => ({ id: name, name, type: 'expense', color: 'sky', budget, created_at: '' })
  const l = budgetLines([c('dining', 100), c('transport', 50), c('other', null)], [T('2026-11-03', 85, 'a', { category: 'dining' }), T('2026-11-05', 60, 'b', { category: 'transport' })], '2026-11', '2026-11-15')
  assert.deepEqual(l.map((x) => [x.category.name, x.state, Math.round(x.projected)]), [['transport', 'over', 120], ['dining', 'warn', 170]])
})

test('charge dates do not drift at the end of the month', () => {
  assert.deepEqual(chargeDates({ anchor_date: '2026-01-31', period: 'monthly' }, '2026-02-01', '2026-04-30'), ['2026-02-28', '2026-03-31', '2026-04-30'])
  assert.deepEqual(chargeDates({ anchor_date: '2025-11-26', period: 'yearly' }, '2026-11-25', '2026-12-31'), ['2026-11-26'])
  assert.equal(chargeDates({ anchor_date: '2026-11-02', period: 'weekly' }, '2026-11-25', '2026-12-08').length, 2)
  assert.equal(monthlyCost({ amount: 120, period: 'yearly' }), 10)
})

test('recurring charges: regular ones are found, one-offs and cancelled ones are not', () => {
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']
  const txs = [
    ...months.map((m) => T(`${m}-12`, 10.99, 'Compra Internet En Musica.com, Madrid', { category: 'subscriptions' })),
    ...months.map((m, i) => T(`${m}-0${1 + (i % 3)}`, 30 + i * 17, 'Supermercado Uno')),
    ...['2026-01', '2026-02', '2026-03', '2026-04'].map((m) => T(`${m}-05`, 8, 'Revista Vieja')),
  ]
  const d = detectRecurring(txs, [], '2026-11-25')
  assert.deepEqual(d.map((x) => [x.period, x.amount, x.times, x.last]), [['monthly', 10.99, 6, '2026-11-12']])
  const bill = { name: 'Musica.com', amount: 10.99 } as Bill
  assert.equal(merchantKey('Compra Internet En Musica.com, Madrid'), merchantKey(bill.name))
  assert.equal(detectRecurring(txs, [bill], '2026-11-25').length, 0)
})

test('comparison with the average of previous months', () => {
  const txs = [T('2026-11-02', 100, 'x', { category: 'dining' }), T('2026-10-02', 40, 'x', { category: 'dining' }), T('2026-09-02', 60, 'x', { category: 'dining' }), T('2026-09-03', 30, 'x', { category: 'health' })]
  assert.deepEqual(compareCategories(txs, '2026-11').map((c) => [c.category, c.current, c.average, c.diff]), [['dining', 100, 50, 50], ['health', 0, 15, -15]])
})

test('bank statement: header anywhere, Spanish dates and amounts, card numbers removed', () => {
  const s = parseStatement([[null, 'CUENTA'], [], ['FECHA OPERACIÓN', 'FECHA VALOR', 'CONCEPTO', 'IMPORTE EUR', 'SALDO'], ['24/11/2026', '24/11/2026', 'Compra Cafeteria, Tarjeta 1234123412341234', -3.5, 10], ['23/11/2026', '', 'Nomina', '1.234,56', 0], ['Total', null, null, null, null]])
  assert.deepEqual(s.rows, [{ date: '2026-11-24', concept: 'Compra Cafeteria', amount: -3.5 }, { date: '2026-11-23', concept: 'Nomina', amount: 1234.56 }])
  assert.equal(s.skipped, 1)
  assert.throws(() => parseStatement([['a', 'b']]))
  assert.equal(parseBankDate(46350), '2026-11-24')
  assert.equal(parseBankAmount('−12,30 €'), -12.3)
  assert.ok(!/\d{4}/.test(cleanConcept('Transf. ES12 1234 1234 1234 1234 1234 a Juan')))
  assert.deepEqual(parseCsv('a;b\n"x;1";2'), [['a', 'b'], ['x;1', '2']])
})

test('duplicates: exact ones counted, Apple Pay payments a few days off are only suspected', () => {
  const existing = [T('2026-11-24', 3.5, 'x'), T('2026-11-20', 20, 'Apple'), T('2026-11-24', 9, 'other account', { account: 'Otra' }), T('2026-11-01', 400, 'Ahorro', { type: 'investment', account: 'Hucha' })]
  const r = markDuplicates(
    [{ date: '2026-11-24', concept: 'a', amount: -3.5 }, { date: '2026-11-24', concept: 'a', amount: -3.5 }, { date: '2026-11-23', concept: 'b', amount: -20 }, { date: '2026-11-24', concept: 'c', amount: -9 }, { date: '2026-11-01', concept: 'd', amount: -400 }, { date: '2026-11-24', concept: 'e', amount: 3.5 }],
    existing,
    'Banco',
  )
  assert.deepEqual(r.map((x) => x.state), ['duplicate', 'new', 'maybe', 'new', 'duplicate', 'new'])
})
