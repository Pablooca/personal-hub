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
  assert.deepEqual(parseSlots('15, 5,x,500000'), [15, 5])
})

test('deadline reminders: 1 day, 3 h, 1 h, 30 min, 5 min', async () => {
  const { parseSlots, reminderSlot, humanMinutes, deadlineMessage } = await import('../_shared/telegram.ts')
  const slots = parseSlots('1440,180,60,30,5')
  assert.deepEqual(slots, [1440, 180, 60, 30, 5])
  // Each minute of the countdown maps to exactly one slot; each slot fires once (claimed in the log).
  assert.equal(reminderSlot(1440, slots), 1440)
  assert.equal(reminderSlot(200, slots), 1440) // created 3h20 before: "1 day" slot still pending → fires now
  assert.equal(reminderSlot(180, slots), 180)
  assert.equal(reminderSlot(61, slots), 180)
  assert.equal(reminderSlot(60, slots), 60)
  assert.equal(reminderSlot(30, slots), 30)
  assert.equal(reminderSlot(5, slots), 5)
  assert.equal(reminderSlot(1441, slots), null)
  assert.equal(humanMinutes(1440), '1 día')
  assert.equal(humanMinutes(180), '3 h')
  assert.equal(humanMinutes(90), '1 h 30 min')
  assert.equal(humanMinutes(5), '5 min')
  const m = deadlineMessage({ name: 'Práctica 2 <Raft>', due_at: '2026-11-24T22:59:00Z', weight: 25 }, 'Sistemas Distribuidos', 180, 'Europe/Madrid')
  assert.match(m, /^⏳ <b>Entrega en 3 h: Práctica 2 &lt;Raft&gt;<\/b>/)
  assert.match(m, /Sistemas Distribuidos · 25 % de la nota/)
  assert.match(m, /23:59/)
  assert.match(deadlineMessage({ name: 'X', due_at: '2026-11-24T22:59:00Z', weight: 10 }, 'S', 5, 'Europe/Madrid'), /^🚨/)
})

test('exam reminders: 1 month, 2 weeks, 1 week, 2 days, 1 day, 3 h, 1 h', async () => {
  const { EXAM_SLOTS, reminderSlot, humanMinutes, examMessage } = await import('../_shared/telegram.ts')
  const D = 1440
  assert.equal(reminderSlot(30 * D, EXAM_SLOTS), 30 * D)
  assert.equal(reminderSlot(30 * D + 1, EXAM_SLOTS), null) // more than a month away: nothing yet
  assert.equal(reminderSlot(20 * D, EXAM_SLOTS), 30 * D) // exam added 20 days before: the "month" reminder fires now
  assert.equal(reminderSlot(14 * D, EXAM_SLOTS), 14 * D)
  assert.equal(reminderSlot(7 * D, EXAM_SLOTS), 7 * D)
  assert.equal(reminderSlot(2 * D, EXAM_SLOTS), 2 * D)
  assert.equal(reminderSlot(D, EXAM_SLOTS), D)
  assert.equal(reminderSlot(180, EXAM_SLOTS), 180)
  assert.equal(reminderSlot(60, EXAM_SLOTS), 60)
  assert.equal(reminderSlot(30, EXAM_SLOTS), 60) // no 30-min slot for exams: the 1 h one covers it once
  assert.equal(humanMinutes(30 * D), '1 mes')
  assert.equal(humanMinutes(14 * D), '2 semanas')
  assert.equal(humanMinutes(7 * D), '1 semana')
  assert.equal(humanMinutes(2 * D), '2 días')
  assert.equal(humanMinutes(20 * D), '20 días')
  assert.equal(humanMinutes(2 * D + 19 * 60), '2 días y 19 h')
  assert.equal(humanMinutes(D), '1 día')
  const m = examMessage({ name: 'Examen final', due_at: '2026-12-17T08:00:00Z', weight: 60 }, 'Sistemas Distribuidos', 14 * D, 'Europe/Madrid')
  assert.match(m, /^📝 <b>Examen en 2 semanas: Examen final<\/b>/)
  assert.match(m, /60 % de la nota/)
  assert.match(m, /09:00/)
})
