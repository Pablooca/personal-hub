/**
 * Exam-prep plan: weeks, phases, spaced reviews and progress per subject.
 * Pure functions (dates are YYYY-MM-DD strings) so they can be unit-tested.
 */
import type { PlanItemKind, StudyPlan, StudyPlanItem, StudyPlanPhase, StudyTest, StudyTopic } from './types'

export const PLAN_KIND_LABELS: Record<PlanItemKind, string> = {
  goal: 'Objetivo semanal',
  study: 'Estudio',
  test: 'Test',
  review: 'Repaso espaciado',
  mock: 'Simulacro',
  buffer: 'Colchón',
  rest: 'Descanso',
  milestone: 'Hito',
}

export const CONFIDENCE_LABELS: Record<number, string> = { 1: 'Flojo', 2: 'Regular', 3: 'Dominado' }

const DAY = 86_400_000
const toUtc = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)))
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Whole days from `a` to `b` (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY)
export const addDaysKey = (k: string, n: number) => fromUtc(toUtc(k) + n * DAY)

/**
 * Days until the next review after the first pass, then after each review:
 * 1 week, 2 weeks, then every month. Short enough to not forget, long enough
 * for the 5 subjects to fit.
 */
export const REVIEW_INTERVALS = [7, 14, 30] as const

export function nextReview(t: Pick<StudyTopic, 'studied' | 'reviews' | 'last_studied'>): string | null {
  if (!t.studied || !t.last_studied) return null
  return addDaysKey(t.last_studied, REVIEW_INTERVALS[Math.min(t.reviews, REVIEW_INTERVALS.length - 1)])
}

export type TopicStage = 'pending' | 'highlighted' | 'studied' | 'reviewed' | 'final'
export const STAGE_LABELS: Record<TopicStage, string> = {
  pending: 'Pendiente',
  highlighted: 'Subrayado',
  studied: '1ª vuelta',
  reviewed: 'Repasado',
  final: 'Vuelta final',
}

export function topicStage(t: Pick<StudyTopic, 'highlighted' | 'studied' | 'reviews' | 'final_pass'>): TopicStage {
  if (t.final_pass) return 'final'
  if (t.studied && t.reviews > 0) return 'reviewed'
  if (t.studied) return 'studied'
  if (t.highlighted) return 'highlighted'
  return 'pending'
}

export interface TopicProgress {
  total: number
  highlighted: number
  studied: number
  reviewed: number
  final: number
  /** Studied topics whose review date has come. */
  due: number
  /** 0–100: each topic weighs the same; stages are steps of 25 %. */
  percent: number
}

const STAGE_WEIGHT: Record<TopicStage, number> = { pending: 0, highlighted: 0.25, studied: 0.5, reviewed: 0.75, final: 1 }

export function topicProgress(topics: StudyTopic[], today: string): TopicProgress {
  const p: TopicProgress = { total: topics.length, highlighted: 0, studied: 0, reviewed: 0, final: 0, due: 0, percent: 0 }
  let score = 0
  for (const t of topics) {
    if (t.highlighted) p.highlighted++
    if (t.studied) p.studied++
    if (t.studied && t.reviews > 0) p.reviewed++
    if (t.final_pass) p.final++
    const next = nextReview(t)
    if (next && next <= today && !t.final_pass) p.due++
    score += STAGE_WEIGHT[topicStage(t)]
  }
  p.percent = topics.length ? Math.round((score / topics.length) * 100) : 0
  return p
}

/** Topics to review now, most overdue first. Topics done in the final pass don't nag. */
export function dueTopics<T extends StudyTopic>(topics: T[], today: string): { topic: T; due: string; late: number }[] {
  return topics
    .filter((t) => !t.final_pass)
    .map((t) => ({ topic: t, due: nextReview(t) }))
    .filter((x): x is { topic: T; due: string } => x.due !== null && x.due <= today)
    .map((x) => ({ ...x, late: daysBetween(x.due, today) }))
    .sort((a, b) => b.late - a.late || a.topic.position - b.topic.position)
}

/** Changes for "repasado hoy": the first time it counts as the first pass. */
export function markReviewed(t: Pick<StudyTopic, 'studied' | 'reviews'>, today: string): Partial<StudyTopic> {
  return t.studied ? { reviews: t.reviews + 1, last_studied: today } : { studied: true, last_studied: today }
}

// ------------------------------------------------------------------ weeks
export interface PlanWeek {
  index: number // 1-based
  goal: StudyPlanItem
  start: string
  end: string
  /** Goals of the same week (more than one subject can have its own). */
  goals: StudyPlanItem[]
  /** Dated blocks that fall inside the week. */
  blocks: StudyPlanItem[]
  phase: number | null // index in plan.phases
  done: number
  total: number
}

export function phaseOf(phases: StudyPlanPhase[], day: string): number | null {
  const i = phases.findIndex((p) => p.start <= day && day <= p.end)
  return i === -1 ? null : i
}

/**
 * Weekly goals define the weeks (so a week can be 11 days long, e.g. a first
 * week starting on a Thursday); goals with the same range are one week.
 */
export function planWeeks(plan: Pick<StudyPlan, 'phases'>, items: StudyPlanItem[]): { weeks: PlanWeek[]; loose: StudyPlanItem[] } {
  const goals = items.filter((i) => i.kind === 'goal').sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
  const weeks: PlanWeek[] = []
  for (const g of goals) {
    const end = g.end_date ?? addDaysKey(g.date, 6)
    const same = weeks.find((w) => w.start === g.date && w.end === end)
    if (same) same.goals.push(g)
    else weeks.push({ index: 0, goal: g, start: g.date, end, goals: [g], blocks: [], phase: phaseOf(plan.phases, g.date), done: 0, total: 0 })
  }
  weeks.forEach((w, i) => (w.index = i + 1))
  const loose: StudyPlanItem[] = []
  for (const b of items.filter((i) => i.kind !== 'goal').sort((a, b) => a.date.localeCompare(b.date))) {
    const w = weeks.find((x) => x.start <= b.date && b.date <= x.end)
    if (w) w.blocks.push(b)
    else loose.push(b)
  }
  for (const w of weeks) {
    const all = [...w.goals, ...w.blocks]
    w.total = all.length
    w.done = all.filter((x) => x.is_done).length
  }
  return { weeks, loose }
}

export const currentWeek = (weeks: PlanWeek[], today: string) => weeks.find((w) => w.start <= today && today <= w.end) ?? null

export interface PlanStatus {
  daysToExam: number | null
  /** 0–100 of the days elapsed between start and end. */
  elapsed: number
  /** Items that should be done by now (ended before today) but are not. */
  behind: number
  done: number
  total: number
}

export function planStatus(plan: Pick<StudyPlan, 'start_date' | 'end_date' | 'exam_date'>, items: StudyPlanItem[], today: string): PlanStatus {
  const span = Math.max(1, daysBetween(plan.start_date, plan.end_date))
  const elapsed = Math.max(0, Math.min(100, Math.round((daysBetween(plan.start_date, today) / span) * 100)))
  const behind = items.filter((i) => !i.is_done && i.kind !== 'buffer' && i.kind !== 'rest' && (i.end_date ?? i.date) < today).length
  return {
    daysToExam: plan.exam_date ? daysBetween(today, plan.exam_date) : null,
    elapsed,
    behind,
    done: items.filter((i) => i.is_done).length,
    total: items.length,
  }
}

/** Short Spanish range: "26 nov – 6 dic". */
export function fmtRange(a: string, b: string): string {
  const f = (k: string) => new Date(toUtc(k)).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '')
  return a === b ? f(a) : `${f(a)} – ${f(b)}`
}

// ------------------------------------------------------------------ days
const KIND_ORDER: Record<PlanItemKind, number> = { milestone: 0, study: 1, test: 2, review: 3, mock: 4, buffer: 5, rest: 6, goal: 7 }

/** Tasks of each day, in a stable order (milestones first, rest last). */
export function byDay(items: StudyPlanItem[]): [string, StudyPlanItem[]][] {
  const m = new Map<string, StudyPlanItem[]>()
  for (const i of items) {
    if (i.kind === 'goal') continue
    m.set(i.date, [...(m.get(i.date) ?? []), i])
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, list]) => [d, list.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.created_at.localeCompare(b.created_at) || a.title.localeCompare(b.title))])
}

/** "jue 26 nov" */
export function fmtDay(k: string): string {
  return new Date(toUtc(k)).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/\./g, '').replace(',', '')
}

// ------------------------------------------------------------------ tests
export const PASS_SCORE = 5
export const LEVEL_LABELS: Record<number, string> = { 1: 'Básico', 2: 'Intermedio', 3: 'Avanzado', 4: 'Experto' }

/** Changes after sitting a test: last grade, best grade, one more attempt. */
export function recordScore(t: Pick<StudyTest, 'best' | 'attempts'>, score: number, today: string): Partial<StudyTest> {
  return { score, best: t.best === null ? score : Math.max(t.best, score), attempts: t.attempts + 1, last_done: today }
}

export type TestState = 'pending' | 'failed' | 'passed' | 'mastered'
export function testState(t: Pick<StudyTest, 'score' | 'attempts'>): TestState {
  if (t.score === null) return t.attempts > 0 ? 'passed' : 'pending'
  return t.score >= 8 ? 'mastered' : t.score >= PASS_SCORE ? 'passed' : 'failed'
}

export interface TestStats {
  total: number
  done: number
  passed: number
  failed: number
  /** Average of the last grades. */
  average: number | null
}

export function testStats(tests: Pick<StudyTest, 'score' | 'attempts'>[]): TestStats {
  const graded = tests.filter((t) => t.score !== null)
  const states = tests.map(testState)
  return {
    total: tests.length,
    done: tests.filter((t) => t.attempts > 0 || t.score !== null).length,
    passed: states.filter((s) => s === 'passed' || s === 'mastered').length,
    failed: states.filter((s) => s === 'failed').length,
    average: graded.length ? Math.round((graded.reduce((a, t) => a + (t.score as number), 0) / graded.length) * 100) / 100 : null,
  }
}
