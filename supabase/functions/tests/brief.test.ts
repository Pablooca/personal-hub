import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDay, billMessage, blockText, budgetAlert, chargesOn, dayMessage, isDue, localInstant, localMidnight, localNow, parseAt, runReminder, weekMessage } from '../_shared/brief.ts'
import { goodFriday, isHoliday } from '../_shared/holidays.ts'
import { parseAmount, parseCommand, takeDate } from '../_shared/bot.ts'

const TZ = 'Europe/Madrid'

test('local time, also around the clock change', () => {
  assert.deepEqual(localNow(Date.parse('2026-11-25T06:30:00Z'), TZ), { date: '2026-11-25', minutes: 450, weekday: 3 })
  assert.deepEqual(localNow(Date.parse('2026-07-01T22:30:00Z'), TZ), { date: '2026-07-02', minutes: 30, weekday: 4 })
  for (const d of ['2026-10-25', '2026-03-29', '2026-11-25', '2026-07-15']) assert.deepEqual([localNow(localMidnight(d, TZ), TZ).date, localNow(localMidnight(d, TZ), TZ).minutes], [d, 0])
  assert.equal(addDay('2026-12-31', 1), '2027-01-01')
  assert.equal(localInstant('2026-11-27', 18 * 60, TZ), '2026-11-27T17:00:00.000Z')
  assert.equal(localInstant('2026-10-25', 18 * 60, TZ), '2026-10-25T17:00:00.000Z')
  assert.equal(localInstant('2026-03-29', 18 * 60, TZ), '2026-03-29T16:00:00.000Z')
})

test('slots', () => {
  assert.equal(parseAt('07:30', '08:00'), 450)
  assert.equal(parseAt('nope', '08:00'), 480)
  assert.equal(parseAt('off', '08:00'), null)
  const at = (minutes: number) => ({ date: '', minutes, weekday: 1 })
  assert.deepEqual([449, 450, 479, 480].map((m) => isDue(450, at(m))), [false, true, true, false])
  assert.equal(isDue(null, at(450)), false)
})

test('workout blocks in words', () => {
  const b = { kind: 'main', reps: 5, reps_max: 6, unit: 'm' as const, amount: 800, recovery_s: 180, target_kind: 'time' as const, target_s: 270 }
  assert.equal(blockText(b), '5–6 × 800 m en 4:30 (rec 3 min)')
  assert.equal(blockText({ ...b, kind: 'hills', unit: 's', amount: 15, reps: 6, reps_max: null, hill: { recovery_s: 60, down: 15 } }), '6 × 15 s subida, rec 1 min, 15 s bajada')
  assert.equal(blockText({ ...b, kind: 'warmup', reps: 1, reps_max: null, unit: 's', amount: 300, target_s: null, recovery_s: null }), 'Calentamiento: 5 min')
  assert.match(runReminder({ id: '', date: '', type: 'interval', distance_km: 7.6, description: '<x>', blocks: [b] }, 'Mañana'), /Mañana: Series · 7,6 km<\/b>\n&lt;x&gt;\n• 5–6/)
})

test('charges', () => {
  assert.ok(chargesOn({ period: 'monthly', anchor_date: '2026-01-31' }, '2026-02-28'))
  assert.ok(!chargesOn({ period: 'monthly', anchor_date: '2026-01-31' }, '2026-02-27'))
  assert.ok(chargesOn({ period: 'yearly', anchor_date: '2025-11-26' }, '2026-11-26'))
  assert.ok(chargesOn({ period: 'weekly', anchor_date: '2026-11-18' }, '2026-11-25'))
  assert.ok(!chargesOn({ period: 'quarterly', anchor_date: '2026-11-25' }, '2026-12-25'))
  assert.match(billMessage({ id: '', name: 'A&B', amount: 10.99, period: '', anchor_date: '', notify_days: 1 }, 1), /Mañana se cobra A&amp;B/)
})

test('budget alerts', () => {
  assert.equal(budgetAlert('dining', 79, 100), null)
  assert.equal(budgetAlert('dining', 80, 100)!.level, 80)
  assert.equal(budgetAlert('dining', 120, 100)!.level, 100)
  assert.equal(budgetAlert('dining', 5, 0), null)
})

const empty = { date: '2026-11-25', events: [], runs: [], tasks: [], assessments: [], tournaments: [], races: [], bills: [] }
test('morning message: only what there is, everything escaped', () => {
  assert.match(dayMessage(empty, '☀️', TZ), /Miércoles, 25 de noviembre<\/b>\n\nNo tienes nada previsto/)
  const m = dayMessage({ ...empty, events: [{ title: 'Reunión <b>', start_at: '2026-11-25T08:00:00Z', end_at: '2026-11-25T09:00:00Z', all_day: false }], tasks: [{ title: 'Hoy', due_date: '2026-11-25', priority: 'high' }, { title: 'Tarde', due_date: '2026-11-20', priority: 'low' }], review: 2 }, '☀️', TZ)
  assert.match(m, /09:00–10:00 Reunión &lt;b&gt;/)
  assert.match(m, /✅ Tareas<\/b>\n• ❗ Hoy/)
  assert.match(m, /Atrasadas<\/b>\n• Tarde/)
  assert.match(m, /2 movimientos sin categorizar/)
  assert.ok(!m.includes('Entreno'))
})

test('weekly message', () => {
  const m = weekMessage({ from: '2026-11-23', to: '2026-11-29', expense: 120, previousExpense: 100, top: [{ category: 'dining', total: 60 }], kmDone: 30, kmPlanned: 40, sessionsDone: 3, sessionsPlanned: 4, hours: 34.5, rounds: { w: 4, l: 2, t: 0 }, nextWeek: ['x'], openTasks: 1 })
  for (const part of ['+20 % que la anterior', 'Restaurantes: 60', '30 km</b> de 40 km · 3 de 4', '34,5 h', '4-2', '1 tarea abierta']) assert.ok(m.includes(part), part)
})

test('holidays used by the hours reminder', () => {
  assert.ok(isHoliday('2026-12-08', 'AN') && isHoliday('2026-12-07', 'AN') && isHoliday('2027-03-26', 'AN'))
  assert.ok(!isHoliday('2026-10-09', 'AN') && isHoliday('2026-10-09', 'VC') && !isHoliday('2026-11-25', 'AN'))
  assert.equal(goodFriday(2027), '2027-03-26')
  assert.ok(isHoliday('2030-12-25', 'AN'))
})

// ----------------------------------------------------------------------- bot
const today = '2026-11-25' // Wednesday
test('bot: dates in Spanish', () => {
  const d = (s: string) => takeDate(s, today)
  assert.deepEqual(d('llamar mañana al banco'), { date: '2026-11-26', rest: 'llamar al banco' })
  assert.equal(d('x pasado mañana').date, '2026-11-27')
  assert.equal(d('x el viernes').date, '2026-11-27')
  assert.equal(d('x miércoles').date, '2026-12-02')
  assert.equal(d('x 5/12').date, '2026-12-05')
  assert.equal(d('x 5/1').date, '2027-01-05')
  assert.equal(d('x el 8 de diciembre').date, '2026-12-08')
  assert.equal(d('x 31/02').date, null)
  assert.equal(d('nada').date, null)
})

test('bot: expenses and income', () => {
  const c = (s: string) => parseCommand(s, today)
  assert.deepEqual(c('gasto 12,50 café'), { kind: 'expense', amount: 12.5, concept: 'café' })
  assert.deepEqual(c('12,50€ café con Ana'), { kind: 'expense', amount: 12.5, concept: 'café con Ana' })
  assert.deepEqual(c('Gasto café 3'), { kind: 'expense', amount: 3, concept: 'café' })
  assert.deepEqual(c('/gasto 1.234,56 en Ikea'), { kind: 'expense', amount: 1234.56, concept: 'Ikea' })
  assert.deepEqual(c('ingreso 30 bizum'), { kind: 'income', amount: 30, concept: 'bizum' })
  assert.deepEqual(c('+30 bizum'), { kind: 'income', amount: 30, concept: 'bizum' })
  assert.equal(c('gasto café').kind, 'error')
  assert.equal(parseAmount('0'), null)
})

test('bot: tasks, events, hours and queries', () => {
  const c = (s: string) => parseCommand(s, today)
  assert.deepEqual(c('tarea llamar al banco mañana'), { kind: 'task', title: 'Llamar al banco', due: '2026-11-26', jira: null })
  assert.deepEqual(c('tarea PLAT-142 arreglar login'), { kind: 'task', title: 'Arreglar login', due: null, jira: 'PLAT-142' })
  assert.deepEqual(c('evento viernes 18:00 dentista'), { kind: 'event', title: 'Dentista', date: '2026-11-27', start: '18:00', end: '19:00' })
  assert.deepEqual(c('evento mañana 9:30-11:00 reunión'), { kind: 'event', title: 'Reunión', date: '2026-11-26', start: '09:30', end: '11:00' })
  assert.deepEqual(c('horas 7,5 PLAT-1 daily'), { kind: 'hours', hours: 7.5, description: 'daily', jira: 'PLAT-1' })
  assert.deepEqual(c('horas 8 PLAT-9'), { kind: 'hours', hours: 8, description: '', jira: 'PLAT-9' })
  assert.deepEqual(c('horas 1:30 revisión'), { kind: 'hours', hours: 1.5, description: 'revisión', jira: null })
  assert.deepEqual([c('hoy').kind, c('Mañana').kind, c('semana').kind, c('mes').kind, c('deshacer').kind, c('/start').kind, c('').kind], ['day', 'day', 'week', 'month', 'undo', 'help', 'help'])
  assert.equal(c('evento dentista').kind, 'error')
  assert.equal(c('evento mañana 25:00 x').kind, 'error')
  assert.equal(c('cuéntame un chiste').kind, 'unknown')
  assert.equal(c('tengo que llamar').kind, 'unknown')
})
