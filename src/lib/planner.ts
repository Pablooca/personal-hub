/**
 * The "smart" part of the study plan, as pure functions:
 *  - replan: move unfinished tasks of past days to the next days, filling
 *    buffer days first, without passing the end of the plan or the exam.
 *  - parseSyllabusIndex: read the topics (and their pages) from the index of a summary PDF.
 *  - scheduleModule: turn a module's topics and class dates into daily tasks.
 */
import { addDaysKey, daysBetween } from './studyPlan.ts'
import type { NewRow, PlanItemKind, StudyPlanItem } from './types.ts'

/** Effort of each kind of task, in "study sessions". */
export const WEIGHT: Record<PlanItemKind, number> = { goal: 0, study: 1, test: 0.5, review: 0.5, mock: 1.5, buffer: 0, rest: 0, milestone: 0.25 }
const MOVABLE = new Set<PlanItemKind>(['study', 'test', 'review', 'mock'])

const weekday = (k: string) => new Date(`${k}T12:00:00Z`).getUTCDay() // 0 = Sunday

/** Unfinished tasks from days before today that can be moved. */
export const overdue = (items: StudyPlanItem[], today: string) =>
  items.filter((i) => MOVABLE.has(i.kind) && !i.is_done && i.date < today).sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))

export interface DayInfo {
  /** Days with a class in the evening: little room. */
  classDays: ReadonlySet<string>
  /** Public holidays: as much room as a weekend. */
  holidays?: ReadonlySet<string>
}

/** How much fits in a day, in study sessions. */
export function capacity(day: string, dayItems: StudyPlanItem[], info: DayInfo): number {
  const wd = weekday(day)
  let cap = info.classDays.has(day) ? 1.5 : wd === 0 || wd === 6 || info.holidays?.has(day) ? 4.5 : 2.5
  if (dayItems.some((i) => i.kind === 'buffer')) cap += 2
  const rest = dayItems.filter((i) => i.kind === 'rest')
  const fullRest = rest.length > 0 && dayItems.every((i) => i.kind === 'rest' || i.kind === 'goal')
  if (fullRest) cap = 0.5
  else if (rest.length) cap -= 1
  return cap
}

export interface Move {
  id: string
  title: string
  from: string
  to: string
}

/**
 * Where to put each overdue task: a buffer day if there is one soon with room,
 * otherwise the day with most room, preferring the nearest. A topic's tasks keep
 * their order (the first pass never lands after its test).
 */
export function replan(items: StudyPlanItem[], today: string, last: string, info: DayInfo): Move[] {
  const late = overdue(items, today)
  if (!late.length || last < today) return []
  const load = new Map<string, number>()
  const byDay = new Map<string, StudyPlanItem[]>()
  for (const i of items) {
    if (i.kind === 'goal' || i.date < today) continue
    byDay.set(i.date, [...(byDay.get(i.date) ?? []), i])
    if (!i.is_done) load.set(i.date, (load.get(i.date) ?? 0) + WEIGHT[i.kind])
  }
  const days: string[] = []
  for (let d = today; d <= last; d = addDaysKey(d, 1)) days.push(d)
  const caps = new Map(days.map((d) => [d, capacity(d, byDay.get(d) ?? [], info)]))
  const isBuffer = (d: string) => (byDay.get(d) ?? []).some((i) => i.kind === 'buffer')
  const floor = new Map<string, string>() // topic → earliest day for its next task

  const moves: Move[] = []
  for (const i of late) {
    const w = WEIGHT[i.kind]
    const min = (i.topic_id && floor.get(i.topic_id)) || today
    const score = (d: string) => {
      const ratio = ((load.get(d) ?? 0) + w) / Math.max(0.5, caps.get(d)!)
      return ratio + daysBetween(today, d) * 0.03 - (isBuffer(d) ? 0.6 : 0)
    }
    const candidates = days.filter((d) => d >= min)
    if (!candidates.length) continue
    const fits = candidates.filter((d) => (load.get(d) ?? 0) + w <= caps.get(d)! + 1e-9)
    const pool = fits.length ? fits : candidates
    const to = pool.reduce((best, d) => (score(d) < score(best) ? d : best))
    load.set(to, (load.get(to) ?? 0) + w)
    if (i.topic_id) floor.set(i.topic_id, to)
    moves.push({ id: i.id, title: i.title, from: i.date, to })
  }
  return moves
}

// ------------------------------------------------------------------ syllabus
export interface SyllabusTopic {
  code: string
  name: string
  /** First page in the PDF (as printed in the index). */
  page: number | null
  pages: number | null
}

/**
 * Topics from the "Índice" of a summary: lines like
 * "UA1·T02 — Arquitectura en la Ciencia de Datos 13" or "Tema 3. Redes convolucionales ..... 27".
 * Lines broken by hyphenation are joined.
 */
export function parseSyllabusIndex(text: string, totalPages?: number): SyllabusTopic[] {
  const flat = text
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .replace(/\.{3,}/g, ' ')
  const start = flat.search(/[ÍI]ndice/i)
  const body = start >= 0 ? flat.slice(start) : flat
  const re = /((?:UA\s*\d+\s*·\s*T\s*\d+)|(?:Anexo\s*·?\s*A?\d+)|(?:Tema\s+\d+)|(?:Unidad\s+\d+)|(?:Cap[ií]tulo\s+\d+))\s*[—–:.-]?\s*(.+?)\s*(\d{1,3})(?=\s*(?:UA\s*\d|Anexo|Tema\s+\d|Unidad\s+\d|Cap[ií]tulo\s+\d|\d{1,3}\s*$|$))/giu
  const out: SyllabusTopic[] = []
  for (const m of body.matchAll(re)) {
    const code = m[1].replace(/\s*·\s*/g, '·').replace(/\s+/g, ' ').trim()
    if (out.some((t) => t.code.toLowerCase() === code.toLowerCase())) continue
    out.push({ code, name: m[2].trim(), page: Number(m[3]), pages: null })
  }
  out.forEach((t, i) => {
    const next = out[i + 1]?.page ?? (totalPages ? totalPages + 1 : null)
    t.pages = t.page !== null && next !== null && next > t.page ? next - t.page : null
  })
  return out
}

// ------------------------------------------------------------------ module scheduling
export interface ModuleInput {
  planId: string
  subjectId: string
  label: string // short subject label for titles ("DL")
  topics: { id: string; name: string; pages: number | null; tests: { id: string; name: string; level: number | null }[] }[]
  /** Class dates of the module, YYYY-MM-DD. */
  classes: string[]
  today: string
  /** Last day the plan can use. */
  last: string
  /** Load already planned per day (other subjects). */
  load: Map<string, number>
  info: DayInfo
}

type Row = NewRow<'study_plan_items'>

/**
 * Topics are assumed to be taught in order, spread over the class dates. Each
 * topic gets: underlining within 48 h of its class, a first pass on the next
 * free day, its tests (N1–N2 right after, N3–N4 a week later) and a spaced
 * review a week after the first pass.
 */
export function scheduleModule(m: ModuleInput): Row[] {
  const out: Row[] = []
  const load = new Map(m.load)
  const free = (d: string) => !m.info.classDays.has(d)
  const add = (date: string, kind: PlanItemKind, title: string, extra: Partial<Row> = {}) => {
    out.push({ plan_id: m.planId, subject_id: m.subjectId, topic_id: null, test_id: null, kind, date, end_date: null, title, notes: '', is_done: false, origin: 'module', ...extra })
    load.set(date, (load.get(date) ?? 0) + WEIGHT[kind])
  }
  /** Least loaded day among the first `span` allowed days from `from`. */
  const pick = (from: string, span: number, ok: (d: string) => boolean = () => true) => {
    const opts: string[] = []
    for (let d = from; d <= m.last && opts.length < span; d = addDaysKey(d, 1)) if (ok(d)) opts.push(d)
    if (!opts.length) return m.last
    return opts.reduce((a, b) => ((load.get(b) ?? 0) < (load.get(a) ?? 0) ? b : a))
  }
  const classes = [...m.classes].sort()
  const n = m.topics.length
  if (!n) return out
  const totalPages = m.topics.reduce((a, t) => a + (t.pages ?? 8), 0)
  let cumulative = 0
  let lastVuelta = m.today
  m.topics.forEach((t, k) => {
    // The class where this topic is (roughly) taught, by its position in the syllabus.
    const share = cumulative / totalPages
    cumulative += t.pages ?? 8
    const taught = classes.length ? classes[Math.min(classes.length - 1, Math.floor(share * classes.length))] : m.today
    const base = taught < m.today ? addDaysKey(m.today, -1) : taught
    const pages = t.pages ? ` (${t.pages} págs.)` : ''
    const sub = pick(addDaysKey(base, 1), 2)
    add(sub, 'study', `${m.label} ${t.name} · subrayado${pages}`, { topic_id: t.id, notes: 'Subrayado con los 4 colores (naranja, verde, azul y rosa).' })
    const vuelta = pick(addDaysKey(sub, 1), 3, free)
    add(vuelta, 'study', `${m.label} ${t.name} · 1ª vuelta`, { topic_id: t.id, notes: 'Estudio activo: explica el tema sin mirar y marca «1ª vuelta» en Temas.' })
    lastVuelta = vuelta > lastVuelta ? vuelta : lastVuelta
    const easy = t.tests.filter((x) => (x.level ?? 1) <= 2)
    const hard = t.tests.filter((x) => (x.level ?? 1) > 2)
    const testDay = pick(addDaysKey(vuelta, 1), 2, free)
    if (t.tests.length === 0) add(testDay, 'test', `${m.label} ${t.name} · autotest (10 preguntas propias o tests de la carpeta)`, { topic_id: t.id })
    for (const x of easy) add(testDay, 'test', `Test ${x.name}`, { topic_id: t.id, test_id: x.id })
    const week = pick(addDaysKey(vuelta, 7), 3)
    add(week, 'review', `Repaso espaciado (1 semana): ${m.label} ${t.name}`, { topic_id: t.id })
    for (const x of hard) add(week, 'test', `Test ${x.name}`, { topic_id: t.id, test_id: x.id })
    void k
  })
  add(lastVuelta, 'milestone', `${m.label}: 1ª vuelta completa del módulo`)
  return out
}

/** Split topics into `parts` consecutive groups of similar page count (for intensive-review days). */
export function splitByPages<T extends { pages: number | null }>(topics: T[], parts: number): T[][] {
  if (parts <= 0) return []
  const total = topics.reduce((a, t) => a + (t.pages ?? 8), 0)
  const groups: T[][] = Array.from({ length: parts }, () => [])
  let acc = 0
  for (const t of topics) {
    const g = Math.min(parts - 1, Math.floor((acc / total) * parts))
    groups[g].push(t)
    acc += t.pages ?? 8
  }
  return groups.filter((g) => g.length)
}
