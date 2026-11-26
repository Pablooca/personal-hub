import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capacity, overdue, parseSyllabusIndex, replan, scheduleModule, splitByPages } from './planner.ts'
import type { StudyPlanItem } from './types.ts'

let n = 0
const item = (p: Partial<StudyPlanItem>): StudyPlanItem => ({
  id: `i${++n}`, plan_id: 'p', subject_id: null, topic_id: null, test_id: null, kind: 'study', date: '2026-12-01', end_date: null,
  title: `t${n}`, notes: '', is_done: false, origin: '', created_at: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`, ...p,
})
const none = { classDays: new Set<string>() }

test('overdue: only unfinished, movable tasks before today', () => {
  const items = [
    item({ date: '2026-12-01' }),
    item({ date: '2026-12-01', is_done: true }),
    item({ date: '2026-12-01', kind: 'rest' }),
    item({ date: '2026-12-01', kind: 'goal', end_date: '2026-12-07' }),
    item({ date: '2026-12-03' }),
  ]
  assert.deepEqual(overdue(items, '2026-12-03').map((i) => i.title), [items[0].title])
})

test('capacity: class days are short, weekends long, buffers add room, full rest days almost none', () => {
  const info = { classDays: new Set(['2026-12-01']) }
  assert.equal(capacity('2026-12-01', [], info), 1.5) // Tuesday with class
  assert.equal(capacity('2026-12-02', [], info), 2.5) // Wednesday
  assert.equal(capacity('2026-12-05', [], info), 4.5) // Saturday
  assert.equal(capacity('2026-12-02', [item({ kind: 'buffer' })], info), 4.5)
  assert.equal(capacity('2026-12-25', [item({ kind: 'rest' })], info), 0.5)
  assert.equal(capacity('2026-12-06', [item({}), item({ kind: 'rest' })], info), 3.5)
})

test('replan: buffer days first, never past the last day, topic order kept', () => {
  const items = [
    item({ date: '2026-12-01', title: 'subrayado', topic_id: 'A' }),
    item({ date: '2026-12-01', title: 'vuelta', topic_id: 'A' }),
    item({ date: '2026-12-02', title: 'test', kind: 'test', topic_id: 'A' }),
    item({ date: '2026-12-04', kind: 'buffer', title: 'Colchón' }), // Friday
    item({ date: '2026-12-03' }), item({ date: '2026-12-03' }), // Thursday is already full
  ]
  const moves = replan(items, '2026-12-03', '2026-12-06', { classDays: new Set(['2026-12-03']) })
  assert.deepEqual(moves.map((m) => [m.title, m.from, m.to]), [
    ['subrayado', '2026-12-01', '2026-12-04'],
    ['vuelta', '2026-12-01', '2026-12-04'],
    ['test', '2026-12-02', '2026-12-04'],
  ])
  assert.ok(moves.every((m) => m.to <= '2026-12-06'))
  // A crowded week spreads the rest over the following days.
  const many = Array.from({ length: 12 }, () => item({ date: '2026-12-01' }))
  const spread = replan(many, '2026-12-02', '2026-12-08', none)
  assert.equal(new Set(spread.map((m) => m.to)).size > 3, true)
  assert.ok(spread.every((m) => m.to >= '2026-12-02' && m.to <= '2026-12-08'))
  assert.deepEqual(replan(many, '2026-12-10', '2026-12-08', none), [])
})

test('syllabus index: codes, names across lines, start pages and page counts', () => {
  const text = `MÁSTER UNIVERSITARIO
Índice de contenidos
UA1·T01 — Introducción a la Ciencia de Datos 5
UA1·T02 — Arquitectura en la Ciencia de Datos 13
UA3·T01 — Introducción a la inteligencia artificial y razona-
miento 63
UA3·T02 — Casos de uso de machine learning no supervisado55
Anexo·A1 — Guía para casos prácticos y formulario 151
3`
  const t = parseSyllabusIndex(text, 156)
  assert.deepEqual(t.map((x) => [x.code, x.name, x.page, x.pages]), [
    ['UA1·T01', 'Introducción a la Ciencia de Datos', 5, 8],
    ['UA1·T02', 'Arquitectura en la Ciencia de Datos', 13, 50],
    ['UA3·T01', 'Introducción a la inteligencia artificial y razonamiento', 63, null],
    ['UA3·T02', 'Casos de uso de machine learning no supervisado', 55, 96],
    ['Anexo·A1', 'Guía para casos prácticos y formulario', 151, 6],
  ])
  const temas = parseSyllabusIndex('Índice\nTema 1. Perceptrón ........ 4\nTema 2. Redes convolucionales ....... 18\n', 30)
  assert.deepEqual(temas.map((x) => [x.code, x.name, x.page, x.pages]), [
    ['Tema 1', 'Perceptrón', 4, 14],
    ['Tema 2', 'Redes convolucionales', 18, 13],
  ])
})

test('module schedule: every topic gets underlining, first pass, test and review in order, inside the plan', () => {
  const topics = ['T1', 'T2', 'T3', 'T4'].map((id, i) => ({ id, name: `UA1·T0${i + 1}`, pages: 10, tests: id === 'T1' ? [{ id: 'x1', name: 'T1 N1', level: 1 }, { id: 'x3', name: 'T1 N3', level: 3 }] : [] }))
  const classes = ['2027-01-11', '2027-01-12', '2027-01-14', '2027-01-18']
  const rows = scheduleModule({
    planId: 'p', subjectId: 's', label: 'DL', topics, classes, today: '2027-01-10', last: '2027-04-09',
    load: new Map(), info: { classDays: new Set(classes) },
  })
  for (const t of topics) {
    const mine = rows.filter((r) => r.topic_id === t.id)
    const sub = mine.find((r) => r.title.endsWith('subrayado (10 págs.)'))!
    const vuelta = mine.find((r) => r.title.endsWith('1ª vuelta'))!
    const rev = mine.find((r) => r.kind === 'review')!
    assert.ok(sub.date < vuelta.date && vuelta.date < rev.date, t.id)
    assert.ok(!classes.includes(vuelta.date), 'first pass on a day without class')
  }
  assert.equal(rows.find((r) => r.test_id === 'x1')!.date < rows.find((r) => r.test_id === 'x3')!.date, true)
  assert.equal(rows.filter((r) => r.kind === 'milestone').length, 1)
  assert.ok(rows.every((r) => r.origin === 'module' && r.date >= '2027-01-11'))
})

test('split by pages keeps the order and balances the groups', () => {
  const g = splitByPages([{ pages: 10 }, { pages: 10 }, { pages: 10 }, { pages: 30 }], 2)
  assert.deepEqual(g.map((x) => x.length), [3, 1])
})
