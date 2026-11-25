import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, FolderGit2, FolderKanban, LayoutGrid, List, Plus, Search } from 'lucide-react'
import { PageHeader } from '../components/Shell'
import { Badge, Button, Empty, ProgressBar, Segmented, cx } from '../components/ui'
import { daysUntil, fromDateKey } from '../lib/dates'
import { fmtDate } from '../lib/format'
import { AREA_LABELS, AREA_STYLES, PRIORITY_LABELS, PRIORITY_STYLES, STATUS_STYLES, TASK_STATUS_STYLES } from '../lib/theme'
import { PROJECT_AREAS, PROJECT_STATUSES, TASK_STATUSES, type Project, type ProjectArea, type ProjectStatus, type ProjectTask } from '../lib/types'
import { useData } from '../state/data'
import { ProjectDetail } from './ProjectDetail'

type Layout = 'grid' | 'list'
type StatusFilter = 'active' | 'all' | ProjectStatus
type Detail = { mode: 'new' } | { mode: 'edit'; id: string } | null

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const
const STATUS_RANK: Record<ProjectStatus, number> = { in_progress: 0, review: 1, backlog: 2, completed: 3 }

/**
 * "Proyectos": the portfolio of projects only. Each project opens its own page.
 * Day-to-day task flow lives on the task Kanban ("Tareas").
 */
export function ProjectsView({ openProjectId, onOpenHandled }: { openProjectId?: string | null; onOpenHandled?: () => void }) {
  const { data, update } = useData()
  const [layout, setLayout] = useState<Layout>('grid')
  const [area, setArea] = useState<ProjectArea | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<Detail>(null)

  // Deep link from other views (task Kanban, overview).
  useEffect(() => {
    if (!openProjectId) return
    setDetail({ mode: 'edit', id: openProjectId })
    window.scrollTo({ top: 0 })
    onOpenHandled?.()
  }, [openProjectId, onOpenHandled])

  // If the open project disappears (deleted here or on another device), go back to the list.
  const missing = detail?.mode === 'edit' && !data.projects.some((p) => p.id === detail.id)
  useEffect(() => {
    if (missing) setDetail(null)
  }, [missing])

  const tasksByProject = useMemo(() => {
    const m = new Map<string, ProjectTask[]>()
    for (const t of data.project_tasks) {
      if (!t.project_id) continue
      const l = m.get(t.project_id)
      if (l) l.push(t)
      else m.set(t.project_id, [t])
    }
    return m
  }, [data.project_tasks])

  const projects = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.projects
      .filter(
        (p) =>
          (area === 'all' || p.area === area) &&
          (statusFilter === 'all' || (statusFilter === 'active' ? p.status === 'in_progress' || p.status === 'review' : p.status === statusFilter)) &&
          (!q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q)),
      )
      .sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'),
      )
  }, [data.projects, area, statusFilter, query])

  const open = (id: string) => {
    setDetail({ mode: 'edit', id })
    window.scrollTo({ top: 0 })
  }

  if (detail) {
    const project = detail.mode === 'edit' ? (data.projects.find((p) => p.id === detail.id) ?? null) : null
    if (detail.mode === 'edit' && !project) return null
    return (
      <ProjectDetail
        key={detail.mode === 'edit' ? detail.id : 'new'}
        project={project}
        initialArea={area === 'all' ? undefined : area}
        tasks={project ? (tasksByProject.get(project.id) ?? []) : []}
        onBack={() => setDetail(null)}
        onCreated={(id) => setDetail({ mode: 'edit', id })}
      />
    )
  }

  const counts = {
    all: data.projects.length,
    active: data.projects.filter((p) => p.status === 'in_progress' || p.status === 'review').length,
  }

  return (
    <>
      <PageHeader
        eyebrow="Cartera de proyectos"
        title="Proyectos"
        actions={
          <>
            <Segmented
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'grid', label: <><LayoutGrid className="size-3.5" /> Tarjetas</> },
                { value: 'list', label: <><List className="size-3.5" /> Lista</> },
              ]}
            />
            <Button
              variant="primary"
              onClick={() => {
                setDetail({ mode: 'new' })
                window.scrollTo({ top: 0 })
              }}
            >
              <Plus className="size-4" /> <span className="max-sm:sr-only">Nuevo proyecto</span>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input className="field pl-8" placeholder="Buscar proyectos…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="field h-9 w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} aria-label="Filtrar por estado">
          <option value="all">Todos los estados ({counts.all})</option>
          <option value="active">Activos ({counts.active})</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_STYLES[s].label}
            </option>
          ))}
        </select>
        <div className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1">
          {(['all', ...PROJECT_AREAS] as const).map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={cx('h-8 shrink-0 rounded-lg px-3 text-xs font-medium transition', area === a ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
            >
              {a === 'all' ? 'Todas las áreas' : AREA_LABELS[a]}
            </button>
          ))}
        </div>
      </div>

      {projects.length === 0 ? (
        <Empty icon={<FolderKanban className="size-5" />}>
          {data.projects.length === 0 ? 'Aún no tienes proyectos.' : 'Ningún proyecto coincide con los filtros.'}
          {data.projects.length === 0 && (
            <Button size="sm" variant="primary" onClick={() => setDetail({ mode: 'new' })}>
              <Plus className="size-3.5" /> Crear el primero
            </Button>
          )}
        </Empty>
      ) : layout === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} tasks={tasksByProject.get(p.id) ?? []} onOpen={() => open(p.id)} />
          ))}
        </div>
      ) : (
        <ProjectList
          projects={projects}
          tasksByProject={tasksByProject}
          onOpen={open}
          onStatus={(id, status) => update('projects', id, { status, ...(status === 'completed' ? { progress: 100 } : {}) })}
        />
      )}
    </>
  )
}

function Dates({ p }: { p: Project }) {
  if (!p.deadline && !p.start_date) return null
  const d = p.deadline ? daysUntil(p.deadline) : null
  const late = d !== null && d < 0 && p.status !== 'completed'
  const soon = d !== null && d >= 0 && d <= 7 && p.status !== 'completed'
  return (
    <span className={cx('num inline-flex items-center gap-1', late ? 'text-rose-500' : soon ? 'text-amber-700 dark:text-amber-400' : 'text-muted')}>
      <CalendarDays className="size-3" />
      {p.start_date && <>{fmtDate(fromDateKey(p.start_date))} → </>}
      {p.deadline ? fmtDate(fromDateKey(p.deadline)) : '…'}
    </span>
  )
}

/** Compact per-status breakdown of a project's tasks. */
function TaskMix({ tasks }: { tasks: ProjectTask[] }) {
  if (tasks.length === 0) return <span className="text-faint">Sin tareas</span>
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-1.5 w-16 overflow-hidden rounded-full bg-line">
        {TASK_STATUSES.map((s) => {
          const n = tasks.filter((t) => t.status === s).length
          return n ? <span key={s} className={TASK_STATUS_STYLES[s].dot} style={{ width: `${(n / tasks.length) * 100}%` }} /> : null
        })}
      </span>
      <span className="num">
        {tasks.filter((t) => t.status === 'done').length}/{tasks.length}
      </span>
    </span>
  )
}

function ProjectCard({ p, tasks, onOpen }: { p: Project; tasks: ProjectTask[]; onOpen: () => void }) {
  return (
    <article
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      tabIndex={0}
      role="button"
      className="flex cursor-pointer flex-col rounded-xl border border-line bg-surface p-4 transition hover:-translate-y-px hover:border-line-strong hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-muted">
          <span className={cx('size-2 rounded-full', STATUS_STYLES[p.status].dot)} />
          {STATUS_STYLES[p.status].label}
        </span>
        <span className={cx('font-mono text-[10px] font-semibold uppercase', PRIORITY_STYLES[p.priority])}>{PRIORITY_LABELS[p.priority]}</span>
      </div>
      <h3 className="mt-2 leading-snug font-semibold">{p.title}</h3>
      <p className="mt-1 line-clamp-2 min-h-8 text-xs text-muted">{p.description || <span className="text-faint">Sin descripción</span>}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <Badge className={AREA_STYLES[p.area]}>{AREA_LABELS[p.area]}</Badge>
        <Dates p={p} />
        {p.repo_url && (
          <span className="inline-flex items-center gap-1 text-faint">
            <FolderGit2 className="size-3" /> repo
          </span>
        )}
      </div>
      <div className="mt-auto pt-4">
        <div className="flex items-center gap-2">
          <ProgressBar value={p.progress} />
          <span className="num w-9 text-right text-[11px] text-muted">{p.progress}%</span>
        </div>
        <div className="mt-2 font-mono text-[11px] text-muted">
          <TaskMix tasks={tasks} />
        </div>
      </div>
    </article>
  )
}

function ProjectList({
  projects,
  tasksByProject,
  onOpen,
  onStatus,
}: {
  projects: Project[]
  tasksByProject: Map<string, ProjectTask[]>
  onOpen: (id: string) => void
  onStatus: (id: string, s: ProjectStatus) => void
}) {
  return (
    <div className="card overflow-hidden">
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-line bg-surface-2 text-left">
          <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:tracking-wider [&>th]:text-muted [&>th]:uppercase">
            <th>Proyecto</th>
            <th>Área</th>
            <th>Estado</th>
            <th>Prioridad</th>
            <th className="w-44">Progreso</th>
            <th>Fechas</th>
            <th>Tareas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {projects.map((p) => (
            <tr key={p.id} className="cursor-pointer hover:bg-surface-2" onClick={() => onOpen(p.id)}>
              <td className="px-4 py-3 font-medium">{p.title}</td>
              <td className="px-4 py-3">
                <Badge className={AREA_STYLES[p.area]}>{AREA_LABELS[p.area]}</Badge>
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <select className="field h-8 w-36 text-xs" value={p.status} onChange={(e) => onStatus(p.id, e.target.value as ProjectStatus)} aria-label="Estado">
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_STYLES[s].label}
                    </option>
                  ))}
                </select>
              </td>
              <td className={cx('px-4 py-3 font-mono text-xs uppercase', PRIORITY_STYLES[p.priority])}>{PRIORITY_LABELS[p.priority]}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <ProgressBar value={p.progress} />
                  <span className="num w-9 text-right text-xs text-muted">{p.progress}%</span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs">{p.deadline || p.start_date ? <Dates p={p} /> : <span className="text-faint">—</span>}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">
                <TaskMix tasks={tasksByProject.get(p.id) ?? []} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-line md:hidden">
        {projects.map((p) => (
          <li key={p.id} className="p-4" onClick={() => onOpen(p.id)}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={cx('size-2 rounded-full', STATUS_STYLES[p.status].dot)} />
                <span className="text-sm font-medium">{p.title}</span>
              </div>
              <span className={cx('font-mono text-[10px] uppercase', PRIORITY_STYLES[p.priority])}>{PRIORITY_LABELS[p.priority]}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 pl-4 text-[11px]">
              <Badge className={AREA_STYLES[p.area]}>{AREA_LABELS[p.area]}</Badge>
              <Dates p={p} />
            </div>
            <div className="mt-2 flex items-center gap-2 pl-4">
              <ProgressBar value={p.progress} />
              <span className="num w-8 text-right text-[11px] text-muted">{p.progress}%</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
