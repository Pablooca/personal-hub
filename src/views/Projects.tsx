import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { CalendarDays, FolderGit2, KanbanSquare, List, ListChecks, Plus, Search } from 'lucide-react'
import { PageHeader } from '../components/Shell'
import { Badge, Button, Empty, ProgressBar, Segmented, cx } from '../components/ui'
import { daysUntil, fromDateKey } from '../lib/dates'
import { fmtDate } from '../lib/format'
import { AREA_LABELS, AREA_STYLES, PRIORITY_LABELS, PRIORITY_STYLES, STATUS_STYLES } from '../lib/theme'
import { PROJECT_AREAS, PROJECT_STATUSES, type Project, type ProjectArea, type ProjectStatus, type ProjectTask } from '../lib/types'
import { useData } from '../state/data'
import { ProjectDetail } from './ProjectDetail'

type Layout = 'board' | 'list'
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const

type Detail = { mode: 'new'; status: ProjectStatus } | { mode: 'edit'; id: string } | null

export function ProjectsView() {
  const { data, update } = useData()
  const [layout, setLayout] = useState<Layout>(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'board'))
  const [area, setArea] = useState<ProjectArea | 'all'>('all')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<Detail>(null)
  // If the open project disappears (deleted here or on another device), go back to the board.
  const missing = detail?.mode === 'edit' && !data.projects.some((p) => p.id === detail.id)
  useEffect(() => {
    if (missing) setDetail(null)
  }, [missing])
  const setOpenId = (id: string) => {
    setDetail({ mode: 'edit', id })
    window.scrollTo({ top: 0 })
  }
  const [dragOver, setDragOver] = useState<ProjectStatus | null>(null)

  const tasksByProject = useMemo(() => {
    const m = new Map<string, ProjectTask[]>()
    for (const t of data.project_tasks) {
      const l = m.get(t.project_id)
      if (l) l.push(t)
      else m.set(t.project_id, [t])
    }
    return m
  }, [data.project_tasks])

  const projects = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.projects
      .filter((p) => (area === 'all' || p.area === area) && (!q || p.title.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q)))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
  }, [data.projects, area, query])

  function newProject(status: ProjectStatus = 'backlog') {
    setDetail({ mode: 'new', status })
    window.scrollTo({ top: 0 })
  }

  function onDrop(e: DragEvent, status: ProjectStatus) {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('text/project-id')
    const p = data.projects.find((x) => x.id === id)
    if (!p || p.status === status) return
    void update('projects', id, { status, ...(status === 'completed' ? { progress: 100 } : {}) })
  }

  if (detail) {
    const project = detail.mode === 'edit' ? (data.projects.find((p) => p.id === detail.id) ?? null) : null
    if (detail.mode === 'edit' && !project) return null
    return (
      <ProjectDetail
        key={detail.mode === 'edit' ? detail.id : 'new'}
        project={project}
        initialStatus={detail.mode === 'new' ? detail.status : undefined}
        initialArea={area === 'all' ? undefined : area}
        tasks={project ? (tasksByProject.get(project.id) ?? []) : []}
        onBack={() => setDetail(null)}
        onCreated={(id) => setDetail({ mode: 'edit', id })}
      />
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Seguimiento de proyectos"
        title="Proyectos"
        actions={
          <>
            <Segmented
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'board', label: <><KanbanSquare className="size-3.5" /> Tablero</> },
                { value: 'list', label: <><List className="size-3.5" /> Lista</> },
              ]}
            />
            <Button variant="primary" onClick={() => newProject()}>
              <Plus className="size-4" /> <span className="hidden sm:inline">Nuevo proyecto</span>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input className="field pl-8" placeholder="Buscar proyectos…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1">
          {(['all', ...PROJECT_AREAS] as const).map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={cx(
                'h-8 shrink-0 rounded-lg px-3 text-xs font-medium transition',
                area === a ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {a === 'all' ? 'Todas' : AREA_LABELS[a]}
            </button>
          ))}
        </div>
      </div>

      {layout === 'board' ? (
        <div className="scrollbar-thin -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {PROJECT_STATUSES.map((status) => {
            const col = projects.filter((p) => p.status === status)
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
                    <span className={cx('size-2 rounded-full', STATUS_STYLES[status].dot)} />
                    {STATUS_STYLES[status].label}
                    <span className="num font-normal text-faint">{col.length}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="size-6" onClick={() => newProject(status)} aria-label={`Añadir a ${STATUS_STYLES[status].label}`}>
                    <Plus className="size-3.5" />
                  </Button>
                </header>
                <div className="flex min-h-24 flex-col gap-2">
                  {col.map((p) => (
                    <ProjectCard key={p.id} p={p} tasks={tasksByProject.get(p.id) ?? []} onOpen={() => setOpenId(p.id)} />
                  ))}
                  {col.length === 0 && <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-line py-6 text-xs text-faint">Suelta aquí</div>}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <ProjectList projects={projects} tasksByProject={tasksByProject} onOpen={setOpenId} />
      )}

    </>
  )
}

function Deadline({ date, start }: { date: string; start?: string | null }) {
  const d = daysUntil(date)
  return (
    <span className={cx('num inline-flex items-center gap-1', d < 0 ? 'text-rose-500' : d <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-muted')}>
      <CalendarDays className="size-3" />
      {start && <>{fmtDate(fromDateKey(start))} → </>}
      {fmtDate(fromDateKey(date))}
    </span>
  )
}

function ProjectCard({ p, tasks, onOpen }: { p: Project; tasks: ProjectTask[]; onOpen: () => void }) {
  const done = tasks.filter((t) => t.is_done).length
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/project-id', p.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onOpen}
      className="cursor-pointer rounded-lg border border-line bg-surface p-3 shadow-sm shadow-black/[0.02] transition hover:-translate-y-px hover:border-line-strong active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm leading-snug font-medium">{p.title}</h3>
        <span className={cx('font-mono text-[10px] font-semibold uppercase', PRIORITY_STYLES[p.priority])}>{PRIORITY_LABELS[p.priority]}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <Badge className={AREA_STYLES[p.area]}>{AREA_LABELS[p.area]}</Badge>
        {p.deadline && <Deadline date={p.deadline} start={p.start_date} />}
      </div>
      {p.description && <p className="mt-2 line-clamp-2 text-xs text-muted">{p.description}</p>}
      <div className="mt-3 flex items-center gap-2">
        <ProgressBar value={p.progress} />
        <span className="num w-8 text-right text-[11px] text-muted">{p.progress}%</span>
      </div>
      <div className="mt-2.5 flex items-center gap-3 font-mono text-[11px] text-faint">
        {tasks.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <ListChecks className="size-3" />
            {done}/{tasks.length}
          </span>
        )}
        {p.repo_url && (
          <span className="inline-flex items-center gap-1">
            <FolderGit2 className="size-3" /> repo
          </span>
        )}
      </div>
    </article>
  )
}

function ProjectList({
  projects,
  tasksByProject,
  onOpen,
}: {
  projects: Project[]
  tasksByProject: Map<string, ProjectTask[]>
  onOpen: (id: string) => void
}) {
  const { update } = useData()
  if (projects.length === 0) return <Empty>Ningún proyecto coincide con los filtros.</Empty>
  return (
    <div className="card overflow-hidden">
      {/* desktop table */}
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-line bg-surface-2 text-left">
          <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:tracking-wider [&>th]:text-muted [&>th]:uppercase">
            <th>Proyecto</th>
            <th>Área</th>
            <th>Estado</th>
            <th>Prioridad</th>
            <th className="w-48">Progreso</th>
            <th>Fecha fin</th>
            <th>Tareas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {projects.map((p) => {
            const tasks = tasksByProject.get(p.id) ?? []
            return (
              <tr key={p.id} className="cursor-pointer hover:bg-surface-2" onClick={() => onOpen(p.id)}>
                <td className="px-4 py-3 font-medium">{p.title}</td>
                <td className="px-4 py-3">
                  <Badge className={AREA_STYLES[p.area]}>{AREA_LABELS[p.area]}</Badge>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <select
                    className="field h-8 w-36 text-xs"
                    value={p.status}
                    onChange={(e) => {
                      const status = e.target.value as ProjectStatus
                      void update('projects', p.id, { status, ...(status === 'completed' ? { progress: 100 } : {}) })
                    }}
                  >
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
                <td className="px-4 py-3 text-xs">{p.deadline ? <Deadline date={p.deadline} /> : <span className="text-faint">—</span>}</td>
                <td className="num px-4 py-3 text-xs text-muted">
                  {tasks.filter((t) => t.is_done).length}/{tasks.length}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* mobile list */}
      <ul className="divide-y divide-line md:hidden">
        {projects.map((p) => {
          const tasks = tasksByProject.get(p.id) ?? []
          return (
            <li key={p.id} className="p-4" onClick={() => onOpen(p.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cx('size-2 rounded-full', STATUS_STYLES[p.status].dot)} />
                  <span className="text-sm font-medium">{p.title}</span>
                </div>
                <span className={cx('font-mono text-[10px] uppercase', PRIORITY_STYLES[p.priority])}>{PRIORITY_LABELS[p.priority]}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 pl-4 text-[11px]">
                <Badge className={AREA_STYLES[p.area]}>{AREA_LABELS[p.area]}</Badge>
                <span className="text-muted">{STATUS_STYLES[p.status].label}</span>
                {p.deadline && <Deadline date={p.deadline} />}
                <span className="num ml-auto text-faint">
                  {tasks.filter((t) => t.is_done).length}/{tasks.length}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 pl-4">
                <ProgressBar value={p.progress} />
                <span className="num w-8 text-right text-[11px] text-muted">{p.progress}%</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
