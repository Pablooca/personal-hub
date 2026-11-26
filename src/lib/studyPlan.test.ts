import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDaysKey, byDay, currentWeek, fmtDay, recordScore, testState, testStats, daysBetween, dueTopics, fmtRange, markReviewed, nextReview, phaseOf, planStatus, planWeeks, topicProgress, topicStage } from './studyPlan.ts'
import type { StudyPlanItem, StudyTopic } from './types.ts'

const topic = (p: Partial<StudyTopic> = {}): StudyTopic => ({
  id: crypto.randomUUID(), subject_id: 's', position: 1, name: 'Tema', highlighted: false, studied: false, reviews: 0,
  last_studied: null, final_pass: false, confidence: null, notes: '', created_at: '2026-01-01T00:00:00Z', ...p,
})
const item = (p: Partial<StudyPlanItem>): StudyPlanItem => ({
  id: crypto.randomUUID(), plan_id: 'p', subject_id: null, topic_id: null, test_id: null, kind: 'goal', date: '2026-11-26', end_date: null, title: 'x', notes: '', is_done: false, created_at: '2026-01-01T00:00:00Z', ...p,
})

test('date helpers cross months and years', () => {
  assert.equal(daysBetween('2026-11-26', '2027-04-10'), 135)
  assert.equal(addDaysKey('2026-12-28', 7), '2027-01-04')
  assert.equal(addDaysKey('2027-03-27', 2), '2027-03-29') // DST change in Spain does not shift the day
})

test('next review: 1 week, 2 weeks, then monthly', () => {
  assert.equal(nextReview(topic()), null)
  assert.equal(nextReview(topic({ studied: true, last_studied: '2026-12-01' })), '2026-12-08')
  assert.equal(nextReview(topic({ studied: true, reviews: 1, last_studied: '2026-12-08' })), '2026-12-22')
  assert.equal(nextReview(topic({ studied: true, reviews: 5, last_studied: '2027-01-01' })), '2027-01-31')
})

test('marking as reviewed: first pass first, then reviews', () => {
  assert.deepEqual(markReviewed({ studied: false, reviews: 0 }, '2026-12-01'), { studied: true, last_studied: '2026-12-01' })
  assert.deepEqual(markReviewed({ studied: true, reviews: 1 }, '2026-12-20'), { reviews: 2, last_studied: '2026-12-20' })
})

test('stages and progress', () => {
  assert.equal(topicStage(topic()), 'pending')
  assert.equal(topicStage(topic({ highlighted: true })), 'highlighted')
  assert.equal(topicStage(topic({ highlighted: true, studied: true })), 'studied')
  assert.equal(topicStage(topic({ studied: true, reviews: 2 })), 'reviewed')
  assert.equal(topicStage(topic({ final_pass: true })), 'final')
  const p = topicProgress(
    [topic({ highlighted: true }), topic({ highlighted: true, studied: true, last_studied: '2026-12-01' }), topic({ final_pass: true, studied: true, last_studied: '2026-12-01' }), topic()],
    '2026-12-10',
  )
  assert.deepEqual(p, { total: 4, highlighted: 2, studied: 2, reviewed: 0, final: 1, due: 1, percent: 44 })
  assert.equal(topicProgress([], '2026-12-10').percent, 0)
})

test('due topics: most overdue first, final pass excluded', () => {
  const a = topic({ name: 'a', studied: true, last_studied: '2026-12-01' })
  const b = topic({ name: 'b', studied: true, last_studied: '2026-11-20' })
  const c = topic({ name: 'c', studied: true, last_studied: '2026-11-20', final_pass: true })
  const d = topic({ name: 'd', studied: true, last_studied: '2026-12-09' })
  assert.deepEqual(dueTopics([a, b, c, d], '2026-12-10').map((x) => [x.topic.name, x.late]), [['b', 13], ['a', 2]])
})

test('weeks come from the weekly goals; blocks fall into their week', () => {
  const phases = [
    { name: 'Fase 1', start: '2026-11-26', end: '2026-12-20', goal: '' },
    { name: 'Fase 2', start: '2026-12-21', end: '2027-03-08', goal: '' },
  ]
  const items = [
    item({ date: '2026-12-07', end_date: '2026-12-13', title: 'S2', is_done: true }),
    item({ date: '2026-11-26', end_date: '2026-12-06', title: 'S1 Intro' }),
    item({ date: '2026-11-26', end_date: '2026-12-06', title: 'S1 ML', is_done: true }),
    item({ kind: 'buffer', date: '2026-12-08', title: 'Colchón' }),
    item({ kind: 'review', date: '2026-12-02', title: 'Repaso' }),
    item({ kind: 'mock', date: '2027-04-01', title: 'Simulacro' }),
    item({ date: '2026-12-21', title: 'Sin fin' }),
  ]
  const { weeks, loose } = planWeeks({ phases }, items)
  assert.deepEqual(weeks.map((w) => [w.index, w.start, w.end, w.goals.length, w.blocks.map((b) => b.title), w.done, w.total, w.phase]), [
    [1, '2026-11-26', '2026-12-06', 2, ['Repaso'], 1, 3, 0],
    [2, '2026-12-07', '2026-12-13', 1, ['Colchón'], 1, 2, 0],
    [3, '2026-12-21', '2026-12-27', 1, [], 0, 1, 1],
  ])
  assert.deepEqual(loose.map((l) => l.title), ['Simulacro'])
  assert.equal(currentWeek(weeks, '2026-12-06')?.index, 1)
  assert.equal(currentWeek(weeks, '2026-12-16'), null)
  assert.equal(phaseOf(phases, '2027-03-09'), null)
})

test('plan status: countdown, elapsed and what is behind (buffers never count)', () => {
  const plan = { start_date: '2026-11-26', end_date: '2027-04-09', exam_date: '2027-04-10' }
  const items = [
    item({ date: '2026-11-26', end_date: '2026-12-06' }),
    item({ date: '2026-11-26', end_date: '2026-12-06', is_done: true }),
    item({ kind: 'buffer', date: '2026-12-01' }),
    item({ kind: 'review', date: '2026-12-10' }),
  ]
  assert.deepEqual(planStatus(plan, items, '2026-12-07'), { daysToExam: 124, elapsed: 8, behind: 1, done: 1, total: 4 })
  assert.equal(planStatus(plan, items, '2026-11-01').elapsed, 0)
})

test('ranges in Spanish', () => {
  assert.equal(fmtRange('2026-11-26', '2026-12-06'), '26 nov – 6 dic')
  assert.equal(fmtRange('2027-04-10', '2027-04-10'), '10 abr')
})

test('days: goals left out, milestones first and rest last', () => {
  const items = [
    item({ kind: 'rest', date: '2026-11-29', title: 'Tarde libre' }),
    item({ kind: 'test', date: '2026-11-29', title: 'Test T2 N1' }),
    item({ kind: 'study', date: '2026-11-29', title: 'T3' }),
    item({ kind: 'milestone', date: '2026-11-29', title: 'Entrega' }),
    item({ kind: 'study', date: '2026-11-27', title: 'T1' }),
    item({ kind: 'goal', date: '2026-11-26', end_date: '2026-12-06', title: 'Semana' }),
  ]
  assert.deepEqual(byDay(items).map(([d, l]) => [d, l.map((i) => i.title)]), [
    ['2026-11-27', ['T1']],
    ['2026-11-29', ['Entrega', 'T3', 'Test T2 N1', 'Tarde libre']],
  ])
  assert.equal(fmtDay('2026-11-26'), 'jue 26 nov')
})

test('tests: record a grade, states and stats', () => {
  assert.deepEqual(recordScore({ best: null, attempts: 0 }, 6.5, '2026-11-27'), { score: 6.5, best: 6.5, attempts: 1, last_done: '2026-11-27' })
  assert.deepEqual(recordScore({ best: 8, attempts: 2 }, 7, '2026-12-01'), { score: 7, best: 8, attempts: 3, last_done: '2026-12-01' })
  assert.equal(testState({ score: null, attempts: 0 }), 'pending')
  assert.equal(testState({ score: 4.9, attempts: 1 }), 'failed')
  assert.equal(testState({ score: 5, attempts: 1 }), 'passed')
  assert.equal(testState({ score: 9, attempts: 1 }), 'mastered')
  assert.deepEqual(testStats([{ score: 4, attempts: 1 }, { score: 9, attempts: 2 }, { score: null, attempts: 0 }]), { total: 3, done: 2, passed: 1, failed: 1, average: 6.5 })
})
