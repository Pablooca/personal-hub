import { useMemo, useState } from 'react'
import { BookOpen, CalendarRange, ExternalLink, ChevronDown, ClipboardCheck, Coffee, Flag, GraduationCap, ListChecks, Pencil, Plus, RotateCcw, Sofa, Target } from 'lucide-react'
import { Button, Card, Check, Empty, ProgressBar, Segmented, cx } from '../../components/ui'
import { COLOR_BG } from '../../lib/categories'
import { toDateKey } from '../../lib/dates'
import { PLAN_KIND_LABELS, addDaysKey, byDay, currentWeek, daysBetween, dueTopics, fmtDay, fmtRange, markReviewed, phaseOf, planStatus, planWeeks, topicProgress, type PlanWeek } from '../../lib/studyPlan'
import type { CalendarEvent, PlanItemKind, StudyPlan, StudyPlanItem, StudyProgram, StudySubject, StudyTest } from '../../lib/types'
import { useData } from '../../state/data'
import { ItemModal, PlanModal, type ItemDraft } from './PlanModals'
import { ProgressButtons, ReplanBar, SyllabusModal } from './PlanTools'
import { TestChip, TestModal, TestsInventory, isStored, useOpenPdf } from './TestsPanel'

const KIND_ICON: Record<PlanItemKind, typeof Target> = { goal: Target, study: BookOpen, test: ListChecks, review: RotateCcw, mock: ClipboardCheck, buffer: Coffee, rest: Sofa, milestone: Flag }
const KIND_TONE: Record<PlanItemKind, string> = {
  goal: 'text-sky-700 dark:text-sky-400',
  study: 'text-indigo-700 dark:text-indigo-400',
  test: 'text-fuchsia-700 dark:text-fuchsia-400',
  rest: 'text-muted',
  review: 'text-violet-700 dark:text-violet-400',
  mock: 'text-rose-700 dark:text-rose-400',
  buffer: 'text-emerald-700 dark:text-emerald-400',
  milestone: 'text-amber-700 dark:text-amber-400',
}
const PHASE_BG = ['bg-sky-500', 'bg-violet-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500']

/** The plan that matters today: the active one, else the next, else the last. */
export function pickPlan(plans: StudyPlan[], today: string): StudyPlan | undefined {
  return plans.find((p) => p.start_date <= today && today <= p.end_date) ?? plans.filter((p) => p.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? plans.at(-1)
}

export function PlanPanel({ program, focusPlanId }: { program: StudyProgram; focusPlanId?: string }) {
  const { data } = useData()
  const today = toDateKey(new Date())
  const plans = data.study_plans.filter((p) => p.program_id === program.id)
  const [selected, setSelected] = useState<string | undefined>(focusPlanId)
  const [creating, setCreating] = useState(false)
  const plan = plans.find((p) => p.id === selected) ?? pickPlan(plans, today)

  if (!plan)
    return (
      <>
        <Empty icon={<CalendarRange className="size-5" />}>
          Crea un plan con sus fases y ve añadiendo objetivos semanales, repasos, simulacros y días colchón.
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> Crear plan
          </Button>
        </Empty>
        {creating && <PlanModal programId={program.id} onClose={() => setCreating(false)} onCreated={setSelected} />}
      </>
    )

  return (
    <>
      {plans.length > 1 && <Segmented className="mb-3" value={plan.id} onChange={setSelected} options={plans.map((p) => ({ value: p.id, label: p.name }))} />}
      <PlanBody key={plan.id} plan={plan} program={program} today={today} onNew={() => setCreating(true)} />
      {creating && <PlanModal programId={program.id} onClose={() => setCreating(false)} onCreated={setSelected} />}
    </>
  )
}

type Tab = 'today' | 'days' | 'tests' | 'progress'
const TAB_KEY = 'ph-study-plan-tab'
const readTab = (): Tab => {
  try {
    const v = localStorage.getItem(TAB_KEY)
    return v === 'days' || v === 'tests' || v === 'progress' ? v : 'today'
  } catch {
    return 'today'
  }
}
const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function PlanBody({ plan, program, today, onNew }: { plan: StudyPlan; program: StudyProgram; today: string; onNew: () => void }) {
  const { data, update } = useData()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ItemDraft | null>(null)
  const [testOpen, setTestOpen] = useState<StudyTest | null>(null)
  const [syllabus, setSyllabus] = useState(false)
  const [tab, setTabRaw] = useState<Tab>(readTab)
  const setTab = (t: Tab) => {
    setTabRaw(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      /* private mode */
    }
  }

  const subjects = data.study_subjects.filter((s) => s.program_id === program.id)
  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const items = useMemo(() => data.study_plan_items.filter((i) => i.plan_id === plan.id), [data.study_plan_items, plan.id])
  const { weeks, loose } = useMemo(() => planWeeks(plan, items), [plan, items])
  const days = useMemo(() => new Map(byDay(items)), [items])
  const classes = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of data.events) if (e.category === 'master') m.set(localDay(e.start_at), [...(m.get(localDay(e.start_at)) ?? []), e])
    return m
  }, [data.events])
  const tests = new Map(data.study_tests.map((t) => [t.id, t]))
  const status = planStatus(plan, items, today)
  const week = currentWeek(weeks, today)
  const phaseIdx = phaseOf(plan.phases, today)
  const phase = phaseIdx !== null ? plan.phases[phaseIdx] : null
  const topics = data.study_topics.filter((t) => subjectById.has(t.subject_id))
  const due = dueTopics(topics, today)
  const todayItems = days.get(today) ?? []

  const toggle = (i: StudyPlanItem, v: boolean) => void update('study_plan_items', i.id, { is_done: v })
  const span = daysBetween(plan.start_date, plan.end_date) + 1
  const width = (a: string, b: string) => ((daysBetween(a, b) + 1) / span) * 100
  const ctx: Ctx = { today, subjects: subjectById, tests, classes, phases: plan.phases.length, phaseOfDay: (d) => phaseOf(plan.phases, d), onToggle: toggle, onEdit: setDraft, onTest: setTestOpen }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{plan.name}</h2>
          <p className="text-xs text-muted">
            {fmtRange(plan.start_date, plan.end_date)}
            {plan.exam_date && ` · examen ${fmtRange(plan.exam_date, plan.exam_date)}`}
          </p>
        </div>
        <Button size="sm" onClick={() => setSyllabus(true)}>
          <span aria-hidden>📚</span> <span className="max-sm:sr-only">Subir nuevo resumen (PDF) y adaptar planning</span>
        </Button>
        <ProgressButtons plan={plan} subjects={subjects} />
        <Button size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" /> Plan
        </Button>
        <Button size="sm" onClick={onNew} aria-label="Nuevo plan">
          <CalendarRange className="size-3.5" />
        </Button>
        <Button size="sm" variant="primary" onClick={() => setDraft({ plan_id: plan.id, kind: 'study', date: today })}>
          <Plus className="size-3.5" /> Añadir
        </Button>
      </div>

      {/* ------------------------------------------------------------ summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="eyebrow">Examen</div>
          <div className="num mt-2 text-2xl font-semibold">{status.daysToExam === null ? '—' : status.daysToExam > 0 ? status.daysToExam : status.daysToExam === 0 ? 'Hoy' : '✓'}</div>
          <div className="mt-1 text-xs text-muted">{status.daysToExam !== null && status.daysToExam > 0 ? `días · ${Math.floor(status.daysToExam / 7)} semanas` : plan.exam_date ? fmtRange(plan.exam_date, plan.exam_date) : 'sin fecha'}</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Fase actual</div>
          <div className="mt-2 truncate text-base font-semibold">{phase?.name ?? (today < plan.start_date ? 'Aún no empieza' : today > plan.end_date ? 'Plan terminado' : '—')}</div>
          <div className="mt-1 line-clamp-2 text-xs text-muted">{phase ? `${fmtRange(phase.start, phase.end)} · ${phase.goal}` : ''}</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Avance del plan</div>
          <div className="num mt-2 text-2xl font-semibold">
            {status.done}
            <span className="text-base text-muted">/{status.total}</span>
          </div>
          <ProgressBar className="mt-2" value={status.total ? (status.done / status.total) * 100 : 0} label="Tareas hechas" />
          <div className="mt-1 text-[11px] text-muted">{status.elapsed}% del tiempo transcurrido</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Pendiente de días pasados</div>
          <div className={cx('num mt-2 text-2xl font-semibold', status.behind > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>{status.behind}</div>
          <div className="mt-1 text-xs text-muted">{status.behind ? 'muévelo al próximo colchón' : 'al día'}</div>
        </div>
      </div>

      {/* ------------------------------------------------------------ phases */}
      {plan.phases.length > 0 && (
        <div className="card mt-3 p-4">
          <div className="relative flex h-3 overflow-hidden rounded-full bg-line">
            {plan.phases.map((p, i) => (
              <div key={i} className={cx('h-full', PHASE_BG[i % PHASE_BG.length], i !== phaseIdx && 'opacity-40')} style={{ width: `${width(p.start, p.end)}%` }} title={p.name} />
            ))}
            {today >= plan.start_date && today <= plan.end_date && <span className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${width(plan.start_date, today)}%` }} aria-label="Hoy" />}
          </div>
          <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
            {plan.phases.map((p, i) => (
              <div key={i} className={cx('min-w-0', i === phaseIdx ? 'text-fg' : 'text-muted')}>
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className={cx('size-2 shrink-0 rounded-full', PHASE_BG[i % PHASE_BG.length])} />
                  {p.name} · {fmtRange(p.start, p.end)}
                </span>
                {p.goal && <span className="mt-0.5 block">{p.goal}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <ReplanBar plan={plan} items={items} />

      <Segmented
        className="mt-3"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'today', label: 'Hoy' },
          { value: 'days', label: 'Día a día' },
          { value: 'tests', label: 'Tests' },
          { value: 'progress', label: 'Progreso' },
        ]}
      />

      {tab === 'today' && (
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-3">
            <Card title={`Hoy · ${fmtDay(today)}`} action={todayItems.length > 0 && <span className="num text-xs text-muted">{todayItems.filter((i) => i.is_done).length}/{todayItems.length}</span>} bodyClass="p-0">
              <DayBody date={today} items={todayItems} ctx={ctx} />
            </Card>
            {[1, 2].map((n) => {
              const d = addDaysKey(today, n)
              if (d > plan.end_date || d < plan.start_date) return null
              return (
                <Card key={d} title={`${n === 1 ? 'Mañana' : 'Pasado mañana'} · ${fmtDay(d)}`} bodyClass="p-0">
                  <DayBody date={d} items={days.get(d) ?? []} ctx={ctx} />
                </Card>
              )
            })}
            {week && (
              <Card title={`Objetivos de la semana · S${week.index} · ${fmtRange(week.start, week.end)}`} bodyClass="p-0">
                <ItemList items={week.goals} ctx={ctx} />
              </Card>
            )}
          </div>
          <Card title="Toca repasar" action={<span className="num text-xs text-muted">{due.length}</span>} bodyClass="p-0" className="xl:self-start">
            {due.length === 0 ? (
              <p className="p-4 text-sm text-muted">{topics.length ? 'Nada pendiente: los repasos aparecen a la semana, a las dos semanas y cada mes de estudiar un tema.' : 'Añade los temas en cada asignatura para que aparezcan sus repasos.'}</p>
            ) : (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {due.slice(0, 30).map(({ topic: t, late }) => {
                  const s = subjectById.get(t.subject_id)
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                      <span className={cx('size-2 shrink-0 rounded-full', s && COLOR_BG[s.color])} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{t.name}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {s?.code || s?.name} · {t.reviews} rep. · {late === 0 ? 'hoy' : `hace ${late} d`}
                        </span>
                      </span>
                      <Button size="sm" onClick={() => void update('study_topics', t.id, markReviewed(t, today))}>
                        <RotateCcw className="size-3.5" /> Hecho
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'days' && <DaysTab weeks={weeks} loose={loose} week={week} days={days} ctx={ctx} plan={plan} />}

      {tab === 'tests' && (
        <div className="mt-3">
          <TestsInventory subjects={subjects} />
        </div>
      )}

      {tab === 'progress' && <ProgressTable subjects={subjects} topics={topics} today={today} />}

      {editing && <PlanModal programId={program.id} plan={plan} onClose={() => setEditing(false)} />}
      {syllabus && <SyllabusModal plan={plan} program={program} onClose={() => setSyllabus(false)} />}
      {draft && <ItemModal draft={draft} subjects={subjects} onClose={() => setDraft(null)} />}
      {testOpen && (
        <TestModal
          test={tests.get(testOpen.id) ?? testOpen}
          subject={subjectById.get(testOpen.subject_id)}
          topics={data.study_topics.filter((t) => t.subject_id === testOpen.subject_id).sort((a, b) => a.position - b.position)}
          onClose={() => setTestOpen(null)}
        />
      )}
    </>
  )
}

function ProgressTable({ subjects, topics, today }: { subjects: StudySubject[]; topics: import('../../lib/types').StudyTopic[]; today: string }) {
  const { data } = useData()
  return (
    <Card title="Progreso por asignatura" className="mt-3" bodyClass="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-muted">
              <th className="px-4 py-2 font-medium">Asignatura</th>
              <th className="px-2 py-2 text-right font-medium">Temas</th>
              <th className="px-2 py-2 text-right font-medium">Subrayado</th>
              <th className="px-2 py-2 text-right font-medium">1ª vuelta</th>
              <th className="px-2 py-2 text-right font-medium">Repasado</th>
              <th className="px-2 py-2 text-right font-medium">Final</th>
              <th className="px-2 py-2 text-right font-medium">Tests aprob.</th>
              <th className="w-32 px-4 py-2 font-medium">Avance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {subjects.map((s) => {
              const p = topicProgress(topics.filter((t) => t.subject_id === s.id), today)
              const ts = data.study_tests.filter((t) => t.subject_id === s.id)
              const passed = ts.filter((t) => t.score !== null && t.score >= 5).length
              const cell = (n: number) => (p.total ? `${n}/${p.total}` : '—')
              return (
                <tr key={s.id}>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <span className={cx('size-2 shrink-0 rounded-full', COLOR_BG[s.color])} />
                      <span className="truncate">{s.name}</span>
                      {p.due > 0 && <span className="shrink-0 text-[11px] text-rose-700 dark:text-rose-400">{p.due} por repasar</span>}
                    </span>
                  </td>
                  <td className="num px-2 py-2 text-right">{p.total || '—'}</td>
                  <td className="num px-2 py-2 text-right">{cell(p.highlighted)}</td>
                  <td className="num px-2 py-2 text-right">{cell(p.studied)}</td>
                  <td className="num px-2 py-2 text-right">{cell(p.reviewed)}</td>
                  <td className="num px-2 py-2 text-right">{cell(p.final)}</td>
                  <td className="num px-2 py-2 text-right">{ts.length ? `${passed}/${ts.length}` : '—'}</td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <ProgressBar value={p.percent} label={`Avance de ${s.name}`} />
                      <span className="num w-9 shrink-0 text-right text-[11px] text-muted">{p.percent}%</span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Cada tema avanza un 25 % por paso: subrayado, 1ª vuelta, repasado y vuelta final. Se marcan dentro de cada asignatura.</p>
    </Card>
  )
}

function DaysTab({ weeks, loose, week, days, ctx, plan }: { weeks: PlanWeek[]; loose: StudyPlanItem[]; week: PlanWeek | null; days: Map<string, StudyPlanItem[]>; ctx: Ctx; plan: StudyPlan }) {
  const [showPast, setShowPast] = useState(false)
  const today = ctx.today
  return (
    <section className="mt-3">
      <div className="mb-2 flex items-center justify-end">
        {weeks.some((w) => w.end < today) && (
          <Button size="sm" variant="ghost" onClick={() => setShowPast((v) => !v)}>
            {showPast ? 'Ocultar semanas pasadas' : `Ver semanas pasadas (${weeks.filter((w) => w.end < today).length})`}
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {weeks
          .filter((w) => showPast || w.end >= today)
          .map((w, i, list) => {
            const newPhase = w.phase !== null && (i === 0 || list[i - 1].phase !== w.phase)
            return (
              <div key={w.goal.id}>
                {newPhase && (
                  <h3 className="mt-4 mb-2 flex items-center gap-2 text-xs font-semibold text-muted first:mt-0">
                    <span className={cx('size-2 rounded-full', PHASE_BG[w.phase! % PHASE_BG.length])} /> {plan.phases[w.phase!].name}
                  </h3>
                )}
                <WeekRow week={w} days={days} ctx={ctx} defaultOpen={w === week} />
              </div>
            )
          })}
        {loose.length > 0 && (
          <Card title="Fuera de las semanas" bodyClass="p-0">
            <ItemList items={loose} ctx={ctx} showDate />
          </Card>
        )}
        {weeks.length === 0 && <p className="text-sm text-muted">Añade objetivos semanales: cada uno marca una semana del plan.</p>}
      </div>
    </section>
  )
}

type Ctx = {
  today: string
  subjects: Map<string, StudySubject>
  tests: Map<string, StudyTest>
  classes: Map<string, CalendarEvent[]>
  phases: number
  phaseOfDay: (d: string) => number | null
  onToggle: (i: StudyPlanItem, v: boolean) => void
  onEdit: (d: ItemDraft) => void
  onTest: (t: StudyTest) => void
}

function WeekRow({ week, days, ctx, defaultOpen }: { week: PlanWeek; days: Map<string, StudyPlanItem[]>; ctx: Ctx; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const past = week.end < ctx.today
  const complete = week.total > 0 && week.done === week.total
  const dates: string[] = []
  for (let d = week.start; d <= week.end; d = addDaysKey(d, 1)) dates.push(d)
  return (
    <section className={cx('card overflow-hidden', defaultOpen && 'ring-1 ring-accent/40')}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left">
        <span className="num w-8 shrink-0 text-xs font-semibold text-muted">S{week.index}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{fmtRange(week.start, week.end)}</span>
          {!open && <span className="block truncate text-[11px] text-muted">{week.goals.map((g) => g.title).join(' · ')}</span>}
        </span>
        <span className={cx('num shrink-0 text-xs', complete ? 'text-emerald-700 dark:text-emerald-400' : past ? 'text-amber-700 dark:text-amber-400' : 'text-muted')}>
          {week.done}/{week.total}
        </span>
        <ChevronDown className={cx('size-4 shrink-0 text-faint transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-line">
          <div className="bg-surface-2/50 px-4 py-1.5 text-[11px] font-medium text-muted">Objetivos de la semana</div>
          <ItemList items={week.goals} ctx={ctx} />
          {dates.map((d) => (
            <div key={d} className="border-t border-line">
              <DayHeader date={d} ctx={ctx} />
              <DayBody date={d} items={days.get(d) ?? []} ctx={ctx} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function DayHeader({ date, ctx }: { date: string; ctx: Ctx }) {
  const ph = ctx.phaseOfDay(date)
  return (
    <div className={cx('flex items-center gap-2 px-4 pt-2.5 text-xs font-semibold', date === ctx.today ? 'text-accent' : 'text-fg')}>
      {ph !== null && <span className={cx('size-1.5 rounded-full', PHASE_BG[ph % PHASE_BG.length])} />}
      <span className="capitalize">{fmtDay(date)}</span>
      {date === ctx.today && <span className="rounded bg-accent/10 px-1 text-[10px] uppercase">hoy</span>}
    </div>
  )
}

/** A day: classes and deadlines from the calendar, then the tasks. */
function DayBody({ date, items, ctx }: { date: string; items: StudyPlanItem[]; ctx: Ctx }) {
  const cls = ctx.classes.get(date) ?? []
  return (
    <>
      {cls.length > 0 && (
        <ul className="space-y-0.5 px-4 pt-2">
          {cls.map((e) => (
            <li key={e.id} className="flex items-center gap-1.5 text-[11px] text-muted">
              <GraduationCap className="size-3 shrink-0 text-violet-600 dark:text-violet-400" />
              <span className="num shrink-0">{e.all_day ? 'Todo el día' : new Date(e.start_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="truncate">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
      {items.length ? <ItemList items={items} ctx={ctx} /> : <p className="px-4 py-2.5 text-xs text-faint">Sin tareas.</p>}
    </>
  )
}

function ItemList({ items, ctx, showDate }: { items: StudyPlanItem[]; ctx: Ctx; showDate?: boolean }) {
  const openPdf = useOpenPdf()
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => {
        const Icon = KIND_ICON[i.kind]
        const s = i.subject_id ? ctx.subjects.get(i.subject_id) : undefined
        const test = i.test_id ? ctx.tests.get(i.test_id) : undefined
        const rest = i.kind === 'rest' || i.kind === 'buffer'
        return (
          <li key={i.id} className="flex items-start gap-3 px-4 py-2">
            <span className="pt-0.5">
              <Check checked={i.is_done} onChange={(v) => ctx.onToggle(i, v)} label={`Hecho: ${i.title}`} />
            </span>
            <button type="button" onClick={() => ctx.onEdit(i)} className="min-w-0 flex-1 text-left">
              <span className={cx('block text-sm', i.is_done && 'text-muted line-through', rest && !i.is_done && 'text-muted')}>{i.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                <span className={cx('inline-flex items-center gap-1', KIND_TONE[i.kind])}>
                  <Icon className="size-3" /> {PLAN_KIND_LABELS[i.kind]}
                </span>
                {showDate && <span className="num">{fmtDay(i.date)}</span>}
                {s && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <span className={cx('size-1.5 shrink-0 rounded-full', COLOR_BG[s.color])} />
                    <span className="truncate">{s.code || s.name}</span>
                  </span>
                )}
              </span>
              {i.notes && <span className="mt-1 block text-[11px] whitespace-pre-line text-muted">{i.notes}</span>}
            </button>
            {test && isStored(test.path) && (
              <Button size="icon" variant="ghost" onClick={() => void openPdf(test.path)} aria-label={`Abrir ${test.name}`} title="Abrir el test">
                <ExternalLink className="size-3.5" />
              </Button>
            )}
            {test && <TestChip t={test} onOpen={ctx.onTest} label={test.score !== null ? undefined : 'Nota'} />}
          </li>
        )
      })}
    </ul>
  )
}
