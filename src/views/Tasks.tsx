import { useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { Briefcase, CalendarDays, Clock, Plus, Search, User } from 'lucide-react'
import { PageHeader } from '../components/Shell'
import { LogHoursModal, type LogDraft } from '../components/LogHoursModal'
import { TaskModal } from '../components/TaskModal'
import { Button, Check, cx } from '../components/ui'
import { TASK_CATEGORY_LABELS, newTask, taskStatusPatch } from '../lib/tasks'
import { AREA_DOT, PRIORITY_LABELS, PRIORITY_STYLES, TASK_STATUS_STYLES } from '../lib/theme'
import { daysUntil, fromDateKey } from '../lib/dates'
import { fmtDate } from '../lib/format'
import { TASK_STATUSES, type Project, type ProjectTask, type TaskCategory, type TaskStatus } from '../lib/types'
import { fmtHours } from '../lib/worklog'
import { useData } from '../state/data'

/** 'all' | 'projects' | 'cat:work' | 'cat:personal' | <project id> */
type Scope = string
const DONE_VISIBLE = 12
const JIRA_PREFIX = /^([A-Za-z][A-Za-z0-9]+-\d+)[\s:·-]+(.+)$/

export function TasksView({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const { data, create, update } = useData()
  const [scope, setScope] = useState<Scope>('all')
  const [query, setQuery] = useState('')
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null)
  const [adding, setAdding] = useState<TaskStatus | null>(null)
  const [editing, setEditing] = useState<ProjectTask | null>(null)
  const [logDraft, setLogDraft] = useState<LogDraft | null>(null)
  const [showAllDone, setShowAllDone] = useState(false)

  const projectsById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects])
  const loggedByTask = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of data.work_logs) if (l.task_id) m.set(l.task_id, (m.get(l.task_id) ?? 0) + l.hours)
    return m
  }, [data.work_logs])

  const tasks = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.project_tasks.filter((t) => {
      const inScope =
        scope === 'all' ||
        (scope === 'projects' && t.project_id !== null) ||
        (scope.startsWith('cat:') && t.project_id === null && t.category === scope.slice(4)) ||
        t.project_id === scope
      if (!inScope) return false
      if (!q) return true
      const project = t.project_id ? projectsById.get(t.project_id)?.title ?? '' : ''
      return t.title.toLowerCase().includes(q) || (t.jira_key ?? '').toLowerCase().includes(q) || project.toLowerCase().includes(q)
    })
  }, [data.project_tasks, scope, query, projectsById])

  const counts = useMemo(() => {
    const open = data.project_tasks.filter((t) => t.status !== 'done')
    return {
      all: open.length,
      work: open.filter((t) => !t.project_id && t.category === 'work').length,
      personal: open.filter((t) => !t.project_id && t.category === 'personal').length,
      projects: open.filter((t) => t.project_id).length,
    }
  }, [data.project_tasks])

  function onDrop(e: DragEvent, status: TaskStatus) {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('text/task-id')
    const t = data.project_tasks.find((x) => x.id === id)
    if (t && t.status !== status) void update('project_tasks', id, taskStatusPatch(status))
  }

  const activeProjects = data.projects.filter((p) => p.status !== 'completed')
  const chip = (value: Scope, label: string, n: number | null, icon?: ReactNode) => (
    <button
      key={value}
      onClick={() => setScope(value)}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition',
        scope === value ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      {icon}
      {label}
      {n !== null && <span className="num opacity-60">{n}</span>}
    </button>
  )

  return (
    <>
      <PageHeader
        eyebrow="Kanban de tareas"
        title="Tareas"
        actions={
          <Button variant="primary" onClick={() => setAdding('todo')}>
            <Plus className="size-4" /> <span className="max-sm:sr-only">Nueva tarea</span>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input className="field pl-8" placeholder="Buscar tarea o clave Jira…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1">
          {chip('all', 'Todas', counts.all)}
          {chip('cat:work', 'Trabajo', counts.work, <Briefcase className="size-3.5" />)}
          {chip('cat:personal', 'Personal', counts.personal, <User className="size-3.5" />)}
          {chip('projects', 'Proyectos', counts.projects)}
        </div>
        <select
          className="field h-8 w-auto max-w-56 text-xs"
          value={projectsById.has(scope) ? scope : ''}
          onChange={(e) => setScope(e.target.value || 'projects')}
          aria-label="Filtrar por proyecto"
        >
          <option value="">Proyecto concreto…</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      <div className="scrollbar-thin -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {TASK_STATUSES.map((status) => {
          let col = tasks.filter((t) => t.status === status)
          col =
            status === 'done'
              ? [...col].sort((a, b) => b.created_at.localeCompare(a.created_at))
              : [...col].sort((a, b) => Number(a.project_id !== null) - Number(b.project_id !== null) || a.created_at.localeCompare(b.created_at))
          const hidden = status === 'done' && !showAllDone ? Math.max(0, col.length - DONE_VISIBLE) : 0
          if (hidden) col = col.slice(0, DONE_VISIBLE)
          return (
            <section
              key={status}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(status)
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => onDrop(e, status)}
              className={cx(
                'flex w-[82vw] shrink-0 snap-start flex-col rounded-xl border bg-surface-2/60 p-2 transition sm:w-72 lg:w-auto',
                dragOver === status ? 'border-accent bg-accent/5' : 'border-line',
              )}
            >
              <header className="flex items-center justify-between px-1.5 pt-1 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className={cx('size-2 rounded-full', TASK_STATUS_STYLES[status].dot)} />
                  {TASK_STATUS_STYLES[status].label}
                  <span className="num font-normal text-faint">{tasks.filter((t) => t.status === status).length}</span>
                </div>
                <Button variant="ghost" size="icon" className="size-6" onClick={() => setAdding(status)} aria-label={`Añadir a ${TASK_STATUS_STYLES[status].label}`}>
                  <Plus className="size-3.5" />
                </Button>
              </header>

              <div className="flex min-h-24 flex-col gap-2">
                {adding === status && (
                  <QuickAdd
                    scope={scope}
                    projects={activeProjects}
                    onCancel={() => setAdding(null)}
                    onAdd={async (title, owner, jira) => {
                      await create('project_tasks', newTask(title, owner, status, jira))
                    }}
                  />
                )}
                {col.map((t) => (
                  <TaskCard
                    key={t.id}
                    t={t}
                    project={t.project_id ? projectsById.get(t.project_id) : undefined}
                    logged={loggedByTask.get(t.id) ?? 0}
                    onOpen={() => setEditing(t)}
                    onToggle={(v) => update('project_tasks', t.id, taskStatusPatch(v ? 'done' : t.status === 'done' ? 'todo' : t.status))}
                    onLog={() => setLogDraft({ task_id: t.id })}
                  />
                ))}
                {hidden > 0 && (
                  <button className="py-1 text-xs text-muted hover:text-fg" onClick={() => setShowAllDone(true)}>
                    Ver {hidden} más
                  </button>
                )}
                {col.length === 0 && adding !== status && (
                  <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-line py-6 text-xs text-faint">Suelta aquí</div>
                )}
              </div>
            </section>
          )
        })}
      </div>

      {editing && (
        <TaskModal
          key={editing.id}
          task={editing}
          onClose={() => setEditing(null)}
          onLogHours={(t) => setLogDraft({ task_id: t.id })}
          onOpenProject={onOpenProject}
        />
      )}
      <LogHoursModal draft={logDraft} onClose={() => setLogDraft(null)} />
    </>
  )
}

function OwnerTag({ t, project }: { t: ProjectTask; project?: Project }) {
  if (project)
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 truncate text-[11px] text-muted">
        <span className={cx('size-1.5 shrink-0 rounded-full', AREA_DOT[project.area])} />
        <span className="truncate">{project.title}</span>
      </span>
    )
  const work = t.category === 'work'
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-none font-semibold',
        work ? 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
      )}
    >
      {work ? <Briefcase className="size-2.5" /> : <User className="size-2.5" />}
      {TASK_CATEGORY_LABELS[t.category ?? 'work']}
    </span>
  )
}

function TaskCard({
  t,
  project,
  logged,
  onOpen,
  onToggle,
  onLog,
}: {
  t: ProjectTask
  project?: Project
  logged: number
  onOpen: () => void
  onToggle: (v: boolean) => void
  onLog: () => void
}) {
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', t.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onOpen}
      className="group cursor-pointer rounded-lg border border-line bg-surface p-3 shadow-sm shadow-black/[0.02] transition hover:border-line-strong active:cursor-grabbing"
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5">
          <Check checked={t.is_done} onChange={onToggle} label={`Completar ${t.title}`} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={cx('text-sm leading-snug', t.is_done && 'text-faint line-through')}>{t.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <OwnerTag t={t} project={project} />
            {t.jira_key && <span className="font-mono text-[10px] text-muted">{t.jira_key}</span>}
            {t.priority !== 'medium' && <span className={cx('font-mono text-[10px] font-semibold uppercase', PRIORITY_STYLES[t.priority])}>{PRIORITY_LABELS[t.priority]}</span>}
            {t.due_date && (
              <span
                className={cx(
                  'num inline-flex items-center gap-1 text-[10px]',
                  !t.is_done && daysUntil(t.due_date) < 0 ? 'text-rose-700 dark:text-rose-400' : !t.is_done && daysUntil(t.due_date) <= 2 ? 'text-amber-700 dark:text-amber-400' : 'text-muted',
                )}
                title="Fecha de fin"
              >
                <CalendarDays className="size-3" />
                {fmtDate(fromDateKey(t.due_date))}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        {logged > 0 && <span className="num mr-auto text-[11px] text-faint">{fmtHours(logged)}</span>}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onLog()
          }}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-faint opacity-0 transition group-hover:opacity-100 hover:bg-surface-2 hover:text-fg focus:opacity-100 max-md:opacity-100"
          title="Registrar horas"
        >
          <Clock className="size-3" /> Horas
        </button>
      </div>
    </article>
  )
}

function QuickAdd({
  scope,
  projects,
  onAdd,
  onCancel,
}: {
  scope: Scope
  projects: Project[]
  onAdd: (title: string, owner: { projectId: string } | { category: TaskCategory }, jira: string | null) => Promise<void>
  onCancel: () => void
}) {
  const initialOwner = scope.startsWith('cat:') ? scope : projects.some((p) => p.id === scope) ? scope : 'cat:work'
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(initialOwner)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const raw = title.trim()
    if (!raw) return
    // "PLAT-142 Arreglar login" → Jira key + title
    const m = raw.match(JIRA_PREFIX)
    const [jira, text] = m ? [m[1], m[2].trim()] : [null, raw]
    setTitle('')
    await onAdd(text, owner.startsWith('cat:') ? { category: owner.slice(4) as TaskCategory } : { projectId: owner }, jira)
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-accent/50 bg-surface p-2.5 shadow-sm">
      <input
        autoFocus
        className="field h-8 text-sm"
        placeholder="Título (p. ej. PLAT-142 Arreglar login)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        maxLength={300}
      />
      <div className="flex gap-2">
        <select className="field h-8 flex-1 text-xs" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Pertenece a">
          <option value="cat:work">Trabajo</option>
          <option value="cat:personal">Personal</option>
          <optgroup label="Proyectos">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </optgroup>
        </select>
        <Button type="submit" size="sm" variant="primary" disabled={!title.trim()}>
          Añadir
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          ✕
        </Button>
      </div>
    </form>
  )
}
