import { Suspense, lazy, useState, type FormEvent } from 'react'
import { CalendarPlus, CheckSquare, Clock, Footprints, Plus, Receipt } from 'lucide-react'
import { toDateKey } from '../lib/dates'
import { newTask, TASK_CATEGORY_LABELS } from '../lib/tasks'
import type { TaskCategory } from '../lib/types'
import { useData } from '../state/data'
import { useToast } from '../state/toast'
import type { ManageTab } from '../views/finance/Manage'
import { EventModal } from './EventModal'
import { LogHoursModal } from './LogHoursModal'
import { Button, Field, Modal, cx } from './ui'

const QuickEntry = lazy(() => import('../views/finance/TxForms').then((m) => ({ default: m.QuickEntry })))
const ManageModal = lazy(() => import('../views/finance/Manage').then((m) => ({ default: m.ManageModal })))
const RunModal = lazy(() => import('../views/running/Runs').then((m) => ({ default: m.RunModal })))

export type AddKind = 'task' | 'expense' | 'event' | 'run' | 'hours'
const KINDS: { id: AddKind; label: string; icon: typeof Plus; cls: string }[] = [
  { id: 'task', label: 'Tarea', icon: CheckSquare, cls: 'text-sky-600 dark:text-sky-400' },
  { id: 'expense', label: 'Movimiento', icon: Receipt, cls: 'text-rose-600 dark:text-rose-400' },
  { id: 'event', label: 'Evento', icon: CalendarPlus, cls: 'text-violet-600 dark:text-violet-400' },
  { id: 'run', label: 'Entreno', icon: Footprints, cls: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'hours', label: 'Horas', icon: Clock, cls: 'text-amber-600 dark:text-amber-400' },
]

/** Add anything from any screen. */
export function QuickAdd({ onClose }: { onClose: () => void }) {
  const { data } = useData()
  const [kind, setKind] = useState<AddKind | null>(null)
  const [manage, setManage] = useState<ManageTab | null>(null)
  const today = toDateKey(new Date())
  const goal = data.race_goals.filter((g) => g.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? data.race_goals[0] ?? null

  if (kind === 'event') return <EventModal draft={{ dateKey: today }} onClose={onClose} />
  if (kind === 'hours') return <LogHoursModal draft={{ date: today }} onClose={onClose} />
  if (kind === 'run')
    return (
      <Suspense fallback={null}>
        <RunModal run={null} goal={goal} onClose={onClose} />
      </Suspense>
    )
  if (kind === 'expense')
    return (
      <Suspense fallback={null}>
        <Modal open onClose={onClose} title="Nuevo movimiento">
          <QuickEntry bare defaultDate={today} onManage={setManage} onDone={onClose} />
        </Modal>
        {manage && <ManageModal tab={manage} onTab={setManage} onClose={() => setManage(null)} />}
      </Suspense>
    )
  if (kind === 'task')
    return (
      <Modal open onClose={onClose} title="Nueva tarea">
        <TaskForm onDone={onClose} />
      </Modal>
    )
  return (
    <Modal open onClose={onClose} title="Añadir">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {KINDS.map(({ id, label, icon: Icon, cls }) => (
          <button key={id} type="button" onClick={() => setKind(id)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 text-sm font-medium transition hover:border-line-strong">
            <Icon className={cx('size-6', cls)} /> {label}
          </button>
        ))}
      </div>
    </Modal>
  )
}

const JIRA_PREFIX = /^([A-Za-z][A-Za-z0-9]+-\d+)[\s:·-]+(.+)$/

/** A real task (it lands in Tareas), optionally with a date. */
export function TaskForm({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const { data, create } = useData()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState('cat:personal')
  const [due, setDue] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const raw = title.trim()
    if (!raw) return
    const m = raw.match(JIRA_PREFIX)
    const [jira, text] = m ? [m[1], m[2].trim()] : [null, raw]
    setTitle('')
    const ok = await create('project_tasks', newTask(text, owner.startsWith('cat:') ? { category: owner.slice(4) as TaskCategory } : { projectId: owner }, 'todo', jira, { due_date: due || null }))
    if (ok) {
      toast('success', 'Tarea añadida')
      onDone?.()
    }
  }
  const today = new Date()
  const quick = (days: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() + days)
    return toDateKey(d)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Tarea">
        <input className="field" placeholder="p. ej. Escribir al tutor" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pertenece a">
          <select className="field" value={owner} onChange={(e) => setOwner(e.target.value)}>
            {(Object.keys(TASK_CATEGORY_LABELS) as TaskCategory[]).map((c) => (
              <option key={c} value={`cat:${c}`}>
                {TASK_CATEGORY_LABELS[c]}
              </option>
            ))}
            <optgroup label="Proyectos">
              {data.projects
                .filter((p) => p.status !== 'completed')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </optgroup>
          </select>
        </Field>
        <Field label="Fecha de fin">
          <input type="date" className="field num" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['Hoy', quick(0)],
            ['Mañana', quick(1)],
            ['En una semana', quick(7)],
            ['Sin fecha', ''],
          ] as const
        ).map(([label, v]) => (
          <button key={label} type="button" aria-pressed={due === v} onClick={() => setDue(v)} className={cx('min-h-8 rounded-lg border px-2.5 text-xs', due === v ? 'border-accent bg-accent/10 font-medium' : 'border-line text-muted hover:text-fg')}>
            {label}
          </button>
        ))}
      </div>
      <Button type="submit" variant="primary" className="w-full" disabled={!title.trim()}>
        <Plus className="size-4" /> Añadir tarea
      </Button>
      {compact && <p className="text-center font-mono text-[10px] text-faint">Se guarda en Tareas</p>}
    </form>
  )
}
