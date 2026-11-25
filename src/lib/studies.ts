import type { StudyAssessment, StudySubject } from './types'

export const PASS_GRADE = 5
const round2 = (n: number) => Math.round(n * 100) / 100

export interface SubjectGrade {
  /** Sum of all assessment weights (should be 100). */
  totalWeight: number
  /** Weight of the assessments that already have a grade. */
  evaluatedWeight: number
  /** Points already secured towards the final grade (0–10): Σ weight × grade / 100. */
  points: number
  /** Average of what's graded so far, on a 0–10 scale (null if nothing graded). */
  average: number | null
  /** Calculated final grade, only when every assessment is graded and weights add up to 100. */
  calculated: number | null
  /** What counts: the official grade if set, else the calculated one. */
  effective: number | null
  /** Grade needed on average in the remaining assessments to reach the target. */
  needed: number | null
  neededStatus: 'reached' | 'reachable' | 'impossible' | 'nothing-left'
  weightsOk: boolean
}

export function subjectGrade(subject: Pick<StudySubject, 'final_grade' | 'target_grade'>, assessments: Pick<StudyAssessment, 'weight' | 'grade'>[]): SubjectGrade {
  // Work with exact values; round only what is returned (rounding intermediates
  // would e.g. turn a needed 2,4583 into 2,45 instead of 2,46).
  const rawTotal = assessments.reduce((a, x) => a + x.weight, 0)
  const graded = assessments.filter((x) => x.grade !== null)
  const rawEvaluated = graded.reduce((a, x) => a + x.weight, 0)
  const rawPoints = graded.reduce((a, x) => a + (x.weight * (x.grade as number)) / 100, 0)
  const totalWeight = round2(rawTotal)
  const evaluatedWeight = round2(rawEvaluated)
  const points = round2(rawPoints)
  const average = rawEvaluated > 0 ? round2(rawPoints / (rawEvaluated / 100)) : null
  const weightsOk = Math.abs(rawTotal - 100) < 0.01
  const complete = assessments.length > 0 && graded.length === assessments.length && weightsOk
  const calculated = complete ? points : null
  const effective = subject.final_grade ?? calculated

  // Remaining weight is measured against 100 (the whole final grade), not against what's been entered.
  const remaining = 100 - rawEvaluated
  let needed: number | null = null
  let neededStatus: SubjectGrade['neededStatus']
  if (rawPoints >= subject.target_grade - 1e-9) neededStatus = 'reached'
  else if (remaining <= 1e-9) neededStatus = 'nothing-left'
  else {
    // Round up: telling you that less is enough would be the dangerous mistake.
    const exact = (subject.target_grade - rawPoints) / (remaining / 100)
    needed = Math.ceil(exact * 100 - 1e-9) / 100
    neededStatus = needed > 10 ? 'impossible' : 'reachable'
  }
  return { totalWeight, evaluatedWeight, points, average, calculated, effective, needed, neededStatus, weightsOk }
}

export interface ProgramStats {
  /** ECTS-weighted average of subjects that have a grade. */
  average: number | null
  creditsGraded: number
  creditsPassed: number
  creditsTotal: number
}

export function programStats(subjects: Pick<StudySubject, 'credits'>[], grades: (number | null)[]): ProgramStats {
  let weighted = 0
  let creditsGraded = 0
  let creditsPassed = 0
  subjects.forEach((s, i) => {
    const g = grades[i]
    if (g === null || g === undefined) return
    weighted += g * s.credits
    creditsGraded += s.credits
    if (g >= PASS_GRADE) creditsPassed += s.credits
  })
  return {
    average: creditsGraded > 0 ? round2(weighted / creditsGraded) : null,
    creditsGraded,
    creditsPassed,
    creditsTotal: subjects.reduce((a, s) => a + s.credits, 0),
  }
}

export const fmtGrade = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const gradeTone = (n: number | null | undefined) =>
  n === null || n === undefined ? 'text-muted' : n >= 9 ? 'text-violet-600 dark:text-violet-400' : n >= 7 ? 'text-emerald-700 dark:text-emerald-400' : n >= PASS_GRADE ? 'text-sky-700 dark:text-sky-400' : 'text-rose-700 dark:text-rose-400'

/** Spanish qualitative grade. */
export const gradeLabel = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : n >= 9 ? 'Sobresaliente' : n >= 7 ? 'Notable' : n >= 5 ? 'Aprobado' : 'Suspenso'

export const fmtBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 ** 2).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`

export const MAX_PDF_BYTES = 50 * 1024 * 1024
