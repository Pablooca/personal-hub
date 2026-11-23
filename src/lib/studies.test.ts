import { test } from 'node:test'
import assert from 'node:assert/strict'
import { programStats, subjectGrade } from './studies.ts'

const subj = (target = 5, final_grade: number | null = null) => ({ target_grade: target, final_grade })

test('nothing graded: needs the target on average', () => {
  const g = subjectGrade(subj(), [{ weight: 60, grade: null }, { weight: 40, grade: null }])
  assert.equal(g.points, 0)
  assert.equal(g.average, null)
  assert.equal(g.needed, 5)
  assert.equal(g.neededStatus, 'reachable')
  assert.equal(g.calculated, null)
})

test('partial: points, average so far and grade needed in the rest', () => {
  // Prácticas 40% → 8 ; examen 60% pending. Points 3.2, need (5-3.2)/0.6 = 3.0
  const g = subjectGrade(subj(), [{ weight: 40, grade: 8 }, { weight: 60, grade: null }])
  assert.equal(g.points, 3.2)
  assert.equal(g.average, 8)
  assert.equal(g.needed, 3)
  assert.equal(g.evaluatedWeight, 40)
})

test('target already reached with what is graded', () => {
  const g = subjectGrade(subj(5), [{ weight: 70, grade: 9 }, { weight: 30, grade: null }])
  assert.equal(g.points, 6.3)
  assert.equal(g.neededStatus, 'reached')
  assert.equal(g.needed, null)
})

test('target impossible', () => {
  const g = subjectGrade(subj(9), [{ weight: 80, grade: 5 }, { weight: 20, grade: null }])
  assert.equal(g.needed, 25)
  assert.equal(g.neededStatus, 'impossible')
})

test('complete with weights = 100 → calculated final grade', () => {
  const g = subjectGrade(subj(), [{ weight: 60, grade: 7.5 }, { weight: 30, grade: 9 }, { weight: 10, grade: 10 }])
  assert.equal(g.calculated, 8.2)
  assert.equal(g.effective, 8.2)
  assert.equal(g.weightsOk, true)
})

test('weights not adding up to 100 → no calculated grade, flagged', () => {
  const g = subjectGrade(subj(), [{ weight: 60, grade: 7 }, { weight: 30, grade: 8 }])
  assert.equal(g.weightsOk, false)
  assert.equal(g.calculated, null)
  assert.equal(g.totalWeight, 90)
})

test('official grade overrides the calculation', () => {
  const g = subjectGrade(subj(5, 9.1), [{ weight: 100, grade: 8.8 }])
  assert.equal(g.calculated, 8.8)
  assert.equal(g.effective, 9.1)
})

test('program average is weighted by ECTS and ignores ungraded subjects', () => {
  const s = programStats([{ credits: 6 }, { credits: 3 }, { credits: 12 }], [8, 6, null])
  assert.equal(s.average, 7.33) // (8·6 + 6·3) / 9
  assert.equal(s.creditsGraded, 9)
  assert.equal(s.creditsPassed, 9)
  assert.equal(s.creditsTotal, 21)
})

test('failed subjects count for the average but not for passed credits', () => {
  const s = programStats([{ credits: 6 }, { credits: 6 }], [4, 8])
  assert.equal(s.average, 6)
  assert.equal(s.creditsPassed, 6)
})

test('needed grade is computed from exact points and rounded up', () => {
  // 15%·8,5 + 25%·9 = 3,525 points; (5 − 3,525) / 0,6 = 2,4583… → 2,46 (never 2,45)
  const g = subjectGrade({ target_grade: 5, final_grade: null }, [{ weight: 15, grade: 8.5 }, { weight: 25, grade: 9 }, { weight: 60, grade: null }])
  assert.equal(g.points, 3.53)
  assert.equal(g.needed, 2.46)
})
