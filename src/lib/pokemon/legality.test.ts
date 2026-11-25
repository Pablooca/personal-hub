import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baseName, isPlayable, isStandardPrint, needsCheck } from './legality.ts'

const P = (o: object) => ({ name: 'X', category: 'Pokemon', set: { id: 'sv05' }, ...o })
const std = (o: object, date = '2026-11-06') => isStandardPrint(P(o), date, '2024-03-22', '2026-11-06')

test('legal prints', () => {
  assert.ok(std({ regulationMark: 'H', legal: { standard: true } }))
  assert.ok(!std({ regulationMark: 'G', legal: { standard: false } }, '2023-03-31'))
  // Newest expansion, marks still missing.
  assert.ok(std({ set: { id: 'me06' }, legal: { standard: false } }))
  assert.ok(!std({ set: { id: 'me07' } }, '2027-01-30'))
  assert.ok(!std({ set: { id: '30th-c' } }, '2026-09-16'))
  assert.ok(!std({ set: { id: 'sm1' } }, '2017-02-03'))
  // Basic energy is always legal, special energy is not.
  assert.ok(std({ name: 'Grass Energy', category: 'Energy', set: { id: 'sm1' } }, '2017-02-03'))
  assert.ok(!std({ name: 'Double Colorless Energy', category: 'Energy', set: { id: 'sm1' } }, '2017-02-03'))
  assert.equal(isStandardPrint(P({ set: { id: 'me06' } }), '2026-11-06', '', ''), false)
})

test('names, playable and weekly check', () => {
  assert.equal(baseName("Boss’s Orders (Giovanni)"), "boss's orders")
  const c = { standard: true as boolean | null, standard_date: '2026-11-20', language: 'es', finish: 'normal' }
  assert.ok(isPlayable(c) && isPlayable({ ...c, standard: null }))
  assert.ok(!isPlayable({ ...c, standard: false }) && !isPlayable({ ...c, language: 'ja' }) && !isPlayable({ ...c, finish: 'jumbo' }))
  assert.deepEqual([needsCheck(c, '2026-11-25'), needsCheck(c, '2026-11-27'), needsCheck({ ...c, standard: null }, '2026-11-20'), needsCheck({ ...c, language: 'ja' }, '2027-01-01')], [false, true, true, false])
})
