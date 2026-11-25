import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agendaItems, search } from './agenda.ts'
import { emptyDataset } from '../data/dataset.ts'
import { BUCKET_LABELS, dueBucket, nextOccurrence, stepDate } from './tasks.ts'
import type { Dataset, ProjectTask } from './types.ts'

const iso = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString()
const base = (): Dataset =>
  ({
    ...emptyDataset(),
    run_plan: [{ id: 's1', date: '2026-11-25', type: 'interval', distance_km: 7.6, description: '' }, { id: 's2', date: '2026-11-27', type: 'long', distance_km: 14, description: '' }],
    study_subjects: [{ id: 'sub', name: 'Bases de Datos' }],
    study_assessments: [
      { id: 'a', subject_id: 'sub', name: 'Práctica 1', kind: 'delivery', due_at: iso('2026-11-25', '23:59'), is_done: false, grade: null },
      { id: 'b', subject_id: 'sub', name: 'Examen final', kind: 'exam', due_at: iso('2026-12-01', '09:00'), is_done: false, grade: null },
      { id: 'c', subject_id: 'sub', name: 'Sin fecha', kind: 'delivery', due_at: null, is_done: false, grade: null },
    ],
    events: [{ id: 'e', title: 'Examen: Examen final · Bases de Datos (09:00)', description: '', start_at: iso('2026-12-01', '00:00'), end_at: iso('2026-12-01', '23:59') }],
    tournaments: [{ id: 't', name: 'League Cup Sevilla', game: 'tcg', mode: 'in_person', location: 'Tienda', date: '2026-11-29', status: 'planned', notes: '' }],
    project_tasks: [{ id: 'k', title: 'Llamar al banco', due_date: '2026-11-25', project_id: null, category: 'personal', is_done: false, description: '', jira_key: null }],
  }) as unknown as Dataset

test('one list with runs, deadlines, tournaments and tasks; nothing twice', () => {
  const items = agendaItems(base(), { matched: new Map([['s1', { id: 'r1' }]]) })
  assert.deepEqual(items.map((i) => i.key), ['task-k', 'run-s1', 'study-a', 'run-s2', 'tournament-t'])
  assert.deepEqual(items.find((i) => i.key === 'run-s1')!.target, { kind: 'run', id: 'r1' })
  assert.equal(items.find((i) => i.key === 'run-s1')!.done, true)
  assert.deepEqual(items.find((i) => i.key === 'run-s2')!.target, { kind: 'session', id: 's2' })
  assert.equal(items.find((i) => i.key === 'study-a')!.time, '23:59')
})

test('search: every word, accents ignored, best title first', () => {
  const d = base()
  assert.deepEqual(search(d, 'practica').map((h) => h.title), ['Práctica 1'])
  assert.deepEqual(search(d, 'banco llamar').map((h) => h.target), [{ kind: 'task', id: 'k' }])
  assert.equal(search(d, 'liga sevilla').length, 0)
  assert.equal(search(d, 'cup').length, 1)
  assert.deepEqual(search(d, '  '), [])
})

const task = (o: Partial<ProjectTask>) => ({ id: 'x', title: 'Tirar basura', project_id: null, category: 'personal', status: 'todo', is_done: false, jira_key: null, description: '', priority: 'medium', start_date: null, due_date: null, recurrence: null, created_at: '', ...o }) as ProjectTask

test('recurring tasks: next date keeps the day, skips what is already past', () => {
  assert.equal(stepDate('2027-01-31', 'monthly'), '2027-02-28')
  assert.equal(stepDate('2026-11-27', 'weekdays'), '2026-11-30')
  assert.equal(stepDate('2028-02-29', 'yearly'), '2029-02-28')
  assert.equal(nextOccurrence(task({}), '2026-11-25'), null)
  const n = nextOccurrence(task({ recurrence: 'weekly', due_date: '2026-11-04', start_date: '2026-11-02' }), '2026-11-25')!
  assert.deepEqual([n.due_date, n.start_date, n.status, n.recurrence], ['2026-12-02', '2026-11-30', 'todo', 'weekly'])
  assert.equal(nextOccurrence(task({ recurrence: 'daily' }), '2026-11-25')!.due_date, '2026-11-26')
})

test('due buckets', () => {
  assert.deepEqual(['2026-11-24', '2026-11-25', '2026-12-02', '2026-12-03', null].map((d) => dueBucket(d, '2026-11-25')), ['overdue', 'today', 'week', 'later', 'none'])
  assert.equal(Object.keys(BUCKET_LABELS).length, 5)
})
