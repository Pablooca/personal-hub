import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REVERSE_FINISHES, checkGuide, isPriceTime, pickPrices, type Guide } from '../_shared/prices.ts'
import { FINISHES } from '../../../src/lib/pokemon/collection.ts'

const guide: Guide = { createdAt: '2026-11-25T02:42:31+0100', priceGuides: [{ idProduct: 1, low: 0.4, trend: 4.74, 'low-holo': null, 'trend-holo': 0 }, { idProduct: 2, low: 1, trend: 2, 'low-holo': 3, 'trend-holo': 4 }] }

test('prices by product and finish', () => {
  const rev = REVERSE_FINISHES[0]
  assert.deepEqual(pickPrices(guide, [{ cm_product: 1, finish: 'holo' }, { cm_product: 1, finish: 'holo' }, { cm_product: 2, finish: rev }, { cm_product: 2, finish: 'normal' }, { cm_product: 99, finish: 'normal' }, { cm_product: null, finish: 'normal' }]), [
    { product: 1, finish: 'holo', low: 0.4, trend: 4.74 },
    { product: 2, finish: rev, low: 3, trend: 4 },
    { product: 2, finish: 'normal', low: 1, trend: 2 },
  ])
  // No reverse price in the guide: the normal one.
  assert.deepEqual(pickPrices(guide, [{ cm_product: 1, finish: rev }]), [{ product: 1, finish: rev, low: 0.4, trend: 4.74 }])
})

test('same reverse finishes as the app', () => assert.deepEqual(REVERSE_FINISHES, FINISHES.filter((f) => f[2]).map((f) => f[0])))

test('bad or old guides are refused', () => {
  const now = Date.parse('2026-11-25T08:00:00Z')
  const full = { ...guide, priceGuides: Array.from({ length: 10_000 }, (_, i) => ({ idProduct: i })) }
  assert.ok(checkGuide(full, now))
  assert.throws(() => checkGuide(guide, now))
  assert.throws(() => checkGuide(null, now))
  assert.throws(() => checkGuide({ ...full, createdAt: '2026-11-01T02:00:00+0100' }, now))
  assert.throws(() => checkGuide({ ...full, createdAt: 'x' }, now))
})

test('09:00, then every ten minutes for three hours', () => {
  assert.deepEqual([539, 540, 541, 550, 710, 720].map((m) => isPriceTime(540, m)), [false, true, false, true, true, false])
  assert.equal(isPriceTime(null, 540), false)
})
