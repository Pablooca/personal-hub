import { useMemo, useState } from 'react'
import { CalendarRange, ChevronDown, ClipboardCheck, Coffee, Flag, Pencil, Plus, RotateCcw, Target } from 'lucide-react'
import { Button, Card, Check, Empty, ProgressBar, Segmented, cx } from '../../components/ui'
import { COLOR_BG } from '../../lib/categories'
import { toDateKey } from '../../lib/dates'
import { PLAN_KIND_LABELS, currentWeek, daysBetween, dueTopics, fmtRange, markReviewed, phaseOf, planStatus, planWeeks, topicProgress, type PlanWeek } from '../../lib/studyPlan'
import type { PlanItemKind, StudyPlan, StudyPlanItem, StudyProgram } from '../../lib/types'
import { useData } from '../../state/data'
import { ItemModal, PlanModal, type ItemDraft } from './PlanModals'

const KIND_ICON: Record<PlanItemKind, typeof Target> = { goal: Target, review: RotateCcw, mock: ClipboardCheck, buffer: Coffee, milestone: Flag }
const KIND_TONE: Record<PlanItemKind, string> = {
  goal: 'text-sky-700 dark:text-sky-400',
  review: 'text-violet-700 dark:text-violet-400',
  mock: 'text-rose-700 dark:text-rose-400',
  buffer: 'text-emerald-700 dark:text-emerald-400',
  milestone: 'text-amber-700 dark:text-amber-400',
}
const PHASE_BG = ['bg-sky-500', 'bg-violet-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500']
const weekday = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')

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

function PlanBody({ plan, program, today, onNew }: { plan: StudyPlan; program: StudyProgram; today: string; onNew: () => void }) {
  const { data, update } = useData()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ItemDraft | null>(null)
  const [showPast, setShowPast] = useState(false)

  const subjects = data.study_subjects.filter((s) => s.program_id === program.id)
  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const items = useMemo(() => data.study_plan_items.filter((i) => i.plan_id === plan.id), [data.study_plan_items, plan.id])
  const { weeks, loose } = useMemo(() => planWeeks(plan, items), [plan, items])
  const status = planStatus(plan, items, today)
  const week = currentWeek(weeks, today)
  const phaseIdx = phaseOf(plan.phases, today)
  const phase = phaseIdx !== null ? plan.phases[phaseIdx] : null
  const topics = data.study_topics.filter((t) => subjectById.has(t.subject_id))
  const due = dueTopics(topics, today)

  const toggle = (i: StudyPlanItem, v: boolean) => void update('study_plan_items', i.id, { is_done: v })
  const days = daysBetween(plan.start_date, plan.end_date) + 1
  const width = (a: string, b: string) => ((daysBetween(a, b) + 1) / days) * 100

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
        <Button size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" /> Plan
        </Button>
        <Button size="sm" onClick={onNew} aria-label="Nuevo plan">
          <CalendarRange className="size-3.5" />
        </Button>
        <Button size="sm" variant="primary" onClick={() => setDraft({ plan_id: plan.id, kind: 'goal', date: week?.start ?? today, end_date: week?.end ?? null })}>
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
          <ProgressBar className="mt-2" value={status.total ? (status.done / status.total) * 100 : 0} label="Objetivos hechos" />
          <div className="mt-1 text-[11px] text-muted">{status.elapsed}% del tiempo transcurrido</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Pendiente de días pasados</div>
          <div className={cx('num mt-2 text-2xl font-semibold', status.behind > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>{status.behind}</div>
          <div className="mt-1 text-xs text-muted">{status.behind ? 'usa el próximo día colchón' : 'al día'}</div>
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

      {/* ------------------------------------------------------------ this week + reviews */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title={week ? `Esta semana · S${week.index} · ${fmtRange(week.start, week.end)}` : 'Esta semana'} action={week && <span className="num text-xs text-muted">{week.done}/{week.total}</span>} bodyClass="p-0">
          {week ? <WeekItems week={week} today={today} subjects={subjectById} onToggle={toggle} onEdit={setDraft} /> : <p className="p-4 text-sm text-muted">No hay objetivos para esta semana.</p>}
        </Card>
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

      {/* ------------------------------------------------------------ progress per subject */}
      <Card title="Progreso por asignatura" className="mt-3" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-muted">
                <th className="px-4 py-2 font-medium">Asignatura</th>
                <th className="px-2 py-2 text-right font-medium">Temas</th>
                <th className="px-2 py-2 text-right font-medium">Subrayado</th>
                <th className="px-2 py-2 text-right font-medium">1ª vuelta</th>
                <th className="px-2 py-2 text-right font-medium">Repasado</th>
                <th className="px-2 py-2 text-right font-medium">Final</th>
                <th className="w-32 px-4 py-2 font-medium">Avance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {subjects.map((s) => {
                const p = topicProgress(topics.filter((t) => t.subject_id === s.id), today)
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

      {/* ------------------------------------------------------------ weeks */}
      <section className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Semanas</h2>
          {weeks.some((w) => w.end < today) && (
            <Button size="sm" variant="ghost" onClick={() => setShowPast((v) => !v)}>
              {showPast ? 'Ocultar pasadas' : `Ver pasadas (${weeks.filter((w) => w.end < today).length})`}
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
                  <WeekRow week={w} today={today} subjects={subjectById} onToggle={toggle} onEdit={setDraft} defaultOpen={w === week} />
                </div>
              )
            })}
          {loose.length > 0 && (
            <Card title="Fuera de las semanas" bodyClass="p-0">
              <ItemList items={loose} today={today} subjects={subjectById} onToggle={toggle} onEdit={setDraft} showDate />
            </Card>
          )}
          {weeks.length === 0 && <p className="text-sm text-muted">Añade objetivos semanales: cada uno marca una semana del plan.</p>}
        </div>
      </section>

      {editing && <PlanModal programId={program.id} plan={plan} onClose={() => setEditing(false)} />}
      {draft && <ItemModal draft={draft} subjects={subjects} onClose={() => setDraft(null)} />}
    </>
  )
}

type Subjects = Map<string, { name: string; code: string; color: keyof typeof COLOR_BG }>
type RowProps = { today: string; subjects: Subjects; onToggle: (i: StudyPlanItem, v: boolean) => void; onEdit: (d: ItemDraft) => void }

function WeekRow({ week, defaultOpen, ...rest }: RowProps & { week: PlanWeek; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const past = week.end < rest.today
  const complete = week.total > 0 && week.done === week.total
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
          <WeekItems week={week} {...rest} />
        </div>
      )}
    </section>
  )
}

function WeekItems({ week, ...rest }: RowProps & { week: PlanWeek }) {
  return (
    <>
      <ItemList items={week.goals} {...rest} />
      {week.blocks.length > 0 && (
        <>
          <div className="border-t border-line bg-surface-2/50 px-4 py-1.5 text-[11px] font-medium text-muted">Bloques con fecha</div>
          <ItemList items={week.blocks} {...rest} showDate />
        </>
      )}
    </>
  )
}

function ItemList({ items, today, subjects, onToggle, onEdit, showDate }: RowProps & { items: StudyPlanItem[]; showDate?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => {
        const Icon = KIND_ICON[i.kind]
        const s = i.subject_id ? subjects.get(i.subject_id) : undefined
        const isToday = i.date === today && i.kind !== 'goal'
        return (
          <li key={i.id} className={cx('flex items-start gap-3 px-4 py-2.5', isToday && 'bg-accent/5')}>
            <span className="pt-0.5">
              <Check checked={i.is_done} onChange={(v) => onToggle(i, v)} label={`Hecho: ${i.title}`} />
            </span>
            <button type="button" onClick={() => onEdit(i)} className="min-w-0 flex-1 text-left">
              <span className={cx('block text-sm', i.is_done && 'text-muted line-through')}>{i.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                <span className={cx('inline-flex items-center gap-1', KIND_TONE[i.kind])}>
                  <Icon className="size-3" /> {PLAN_KIND_LABELS[i.kind]}
                </span>
                {showDate && <span className={cx('num', isToday && 'font-semibold text-fg')}>{isToday ? 'hoy' : weekday(i.date)}</span>}
                {s && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <span className={cx('size-1.5 shrink-0 rounded-full', COLOR_BG[s.color])} />
                    <span className="truncate">{s.code || s.name}</span>
                  </span>
                )}
              </span>
              {i.notes && <span className="mt-1 block text-[11px] whitespace-pre-line text-muted">{i.notes}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
