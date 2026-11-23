import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, eventEndMessage, eventStartMessage, expensesMessage } from '../_shared/telegram.ts'

const row = (amount: number, concept: string, category = 'dining') => ({ amount, concept, category, account: 'Cuenta Online Santander', date: '2026-11-23' })

test('no expenses → no message', () => assert.equal(expensesMessage([]), null))

test('single expense: amount, concept, category label and account', () => {
  const m = expensesMessage([row(14.5, 'MERCADONA', 'groceries')])!
  assert.match(m, /Nuevo gasto: 14,50 €/)
  assert.match(m, /MERCADONA/)
  assert.match(m, /Supermercado · Cuenta Online Santander/)
  assert.doesNotMatch(m, /Pendiente/)
})

test('uncategorized single expense is flagged', () => assert.match(expensesMessage([row(3, 'X', 'uncategorized')])!, /Pendiente de categorizar/))

test('a few expenses → itemised with total', () => {
  const m = expensesMessage([row(1, 'A'), row(2.5, 'B'), row(10, 'C')])!
  assert.match(m, /3 gastos nuevos · 13,50 €/)
  assert.equal(m.split('\n').length, 4)
})

test('bulk import → single summary, never hundreds of lines', () => {
  const rows = Array.from({ length: 600 }, (_, i) => row(1, `R${i}`, i % 3 ? 'dining' : 'uncategorized'))
  const m = expensesMessage(rows)!
  assert.match(m, /600 gastos registrados · 600,00 €/)
  assert.match(m, /200 pendientes de categorizar/)
  assert.ok(m.split('\n').length <= 2)
})

test('HTML in concepts is escaped (Telegram HTML parse mode)', () => {
  assert.equal(escapeHtml('<b>&'), '&lt;b&gt;&amp;')
  assert.match(expensesMessage([row(1, 'A <script> & B')])!, /A &lt;script&gt; &amp; B/)
})

test('event messages use Madrid local time', () => {
  const e = { title: 'Jornada laboral', start_at: '2026-11-24T07:00:00Z', end_at: '2026-11-24T16:30:00Z', category: 'work' }
  assert.equal(eventStartMessage(e, 10, 'Europe/Madrid'), '⏰ <b>Empieza en 10 min: Jornada laboral</b>\n08:00–17:30 · Trabajo')
  assert.match(eventStartMessage(e, 1, 'Europe/Madrid'), /Empieza ya/)
  assert.equal(eventEndMessage(e, 'Europe/Madrid'), '✅ <b>Ha terminado: Jornada laboral</b>\n08:00–17:30')
})

test('reminder slots: 10 and 5 minutes before', async () => {
  const { reminderSlot, parseSlots } = await import('../_shared/telegram.ts')
  const slots = parseSlots(undefined)
  assert.deepEqual(slots, [10, 5])
  assert.equal(reminderSlot(10, slots), 10)
  assert.equal(reminderSlot(7, slots), 10) // missed the exact 10-min tick → still sends the "10" reminder
  assert.equal(reminderSlot(6, slots), 10)
  assert.equal(reminderSlot(5, slots), 5)
  assert.equal(reminderSlot(1, slots), 5)
  assert.equal(reminderSlot(11, slots), null)
  assert.deepEqual(parseSlots('15, 5,x,500'), [15, 5])
})
