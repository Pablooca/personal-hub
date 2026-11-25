import { useMemo, useState } from 'react'
import { CalendarRange, Flag, Footprints, Gauge, Pencil, Plus } from 'lucide-react'
import { PageHeader } from '../../components/Shell'
import { Button, Empty, cx } from '../../components/ui'
import { fromDateKey, toDateKey } from '../../lib/dates'
import { fmtDate } from '../../lib/format'
import { evaluate, fmtDuration, fmtKm, fmtPace, goalPace } from '../../lib/running'
import type { RaceGoal, Run } from '../../lib/types'
import { useData } from '../../state/data'
import { GoalModal } from './GoalModal'
import { PlanPanel } from './PlanPanel'
import { Readiness } from './Readiness'
import { RunModal, RunsPanel, type RunSeed } from './Runs'

type Tab = 'ready' | 'plan' | 'runs'
const TABS: { id: Tab; label: string; icon: typeof Gauge }[] = [
  { id: 'ready', label: '¿Voy bien?', icon: Gauge },
  { id: 'plan', label: 'Planning', icon: CalendarRange },
  { id: 'runs', label: 'Entrenamientos', icon: Footprints },
]

export function RunningView() {
  const { data } = useData()
  const today = toDateKey(new Date())
  const [tab, setTab] = useState<Tab>('ready')
  const [goalId, setGoalId] = useState<string | null>(null)
  const [goalModal, setGoalModal] = useState<RaceGoal | 'new' | null>(null)
  const [runModal, setRunModal] = useState<{ run: Run | null; seed?: RunSeed } | null>(null)

  const goals = useMemo(() => {
    const next = data.race_goals.filter((g) => g.date >= today).sort((a, b) => a.date.localeCompare(b.date))
    const past = data.race_goals.filter((g) => g.date < today).sort((a, b) => b.date.localeCompare(a.date))
    return [...next, ...past]
  }, [data.race_goals, today])
  const goal = goals.find((g) => g.id === goalId) ?? goals[0] ?? null
  const ready = useMemo(() => (goal ? evaluate(goal, data.run_plan, data.runs, today) : null), [goal, data.run_plan, data.runs, today])

  return (
    <>
      <PageHeader
        eyebrow="Entrenamiento"
        title="Running & Race Prep"
        actions={
          <>
            <Button onClick={() => setGoalModal('new')}>
              <Flag className="size-4" /> Nueva carrera
            </Button>
            <Button variant="primary" onClick={() => setRunModal({ run: null })}>
              <Plus className="size-4" /> Registrar entreno
            </Button>
          </>
        }
      />

      {!goal || !ready ? (
        <>
          <Empty icon={<Flag className="size-6 text-faint" />}>
            <p>Define tu carrera objetivo para empezar.</p>
            <Button className="mt-1" onClick={() => setGoalModal('new')}>
              <Plus className="size-4" /> Añadir carrera
            </Button>
          </Empty>
          {data.runs.length > 0 && (
            <div className="mt-5">
              <RunsPanel goal={null} onOpen={(run) => setRunModal({ run })} />
            </div>
          )}
        </>
      ) : (
        <>
          <section className="card mb-4 flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              {goals.length > 1 ? (
                <select className="field mb-1 max-w-xs font-semibold" aria-label="Carrera objetivo" value={goal.id} onChange={(e) => setGoalId(e.target.value)}>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-lg font-semibold break-words">{goal.name}</div>
              )}
              <div className="text-sm text-muted">
                {fmtDate(fromDateKey(goal.date), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {fmtKm(goal.distance_km)} km
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Fact label="Faltan" value={ready.daysLeft < 0 ? 'Terminada' : ready.daysLeft === 0 ? '¡Es hoy!' : `${ready.daysLeft} ${ready.daysLeft === 1 ? 'día' : 'días'}`} />
              <Fact label="Objetivo" value={fmtDuration(goal.target_s)} />
              <Fact label="Ritmo objetivo" value={`${fmtPace(goalPace(goal))} /km`} />
              <Fact label="Marca previa" value={goal.previous_best_s ? fmtDuration(goal.previous_best_s) : '—'} />
            </dl>
            <Button size="icon" className="size-9" aria-label="Editar carrera" title="Editar carrera" onClick={() => setGoalModal(goal)}>
              <Pencil className="size-4" />
            </Button>
          </section>

          <div role="tablist" aria-label="Secciones de running" className="scrollbar-none -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cx('-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition', tab === id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}
              >
                <Icon className={cx('size-4', tab === id && 'text-accent')} /> {label}
              </button>
            ))}
          </div>

          {tab === 'ready' && <Readiness goal={goal} r={ready} />}
          {tab === 'plan' && <PlanPanel goal={goal} onComplete={(session, run) => setRunModal(run ? { run } : { run: null, seed: { session } })} />}
          {tab === 'runs' && <RunsPanel goal={goal} onOpen={(run) => setRunModal({ run })} />}
        </>
      )}

      {goalModal && <GoalModal goal={goalModal === 'new' ? null : goalModal} onClose={() => setGoalModal(null)} onSaved={setGoalId} />}
      {runModal && <RunModal key={runModal.run?.id ?? runModal.seed?.session.id ?? 'new'} run={runModal.run} seed={runModal.seed} goal={goal} onClose={() => setRunModal(null)} />}
    </>
  )
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="eyebrow">{label}</dt>
    <dd className="num mt-0.5 font-semibold whitespace-nowrap">{value}</dd>
  </div>
)
