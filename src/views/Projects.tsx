import { useMemo, useState, type DragEvent } from 'react'
import { CalendarDays, ExternalLink, FolderGit2, KanbanSquare, List, ListChecks, Plus, Search, Trash2, Wand2, X } from 'lucide-react'
import { PageHeader } from '../components/Shell'
import { Badge, Button, Check, Empty, Field, Modal, ProgressBar, Segmented, cx } from '../components/ui'
import { daysUntil, fromDateKey } from '../lib/dates'
import { fmtDate, labelize } from '../lib/format'
import { AREA_STYLES, PRIORITY_STYLES, STATUS_STYLES } from '../lib/theme'
import { PRIORITIES, PROJECT_AREAS, PROJECT_STATUSES, type Project, type ProjectArea, type ProjectStatus, type ProjectTask } from '../lib/types'
import { useData } from '../state/data'
import { useToast } from '../state/toast'

type Layout = 'board' | 'list'
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const

export function ProjectsView() {
  const { data, update, create } = useData()
  const toast = useToast()
  const [layout, setLayout] = useState<Layout>(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'board'))
  const [area, setArea] = useState<ProjectArea | 'all'>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
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

  async function newProject(status: ProjectStatus = 'backlog') {
    const p = await create('projects', {
      title: 'Untitled project',
      area: area === 'all' ? 'engineering' : area,
      status,
      progress: 0,
      priority: 'medium',
      deadline: null,
      repo_url: null,
      notes: '',
    })
    if (p) {
      setOpenId(p.id)
      toast('success', 'Project created')
    }
  }

  function onDrop(e: DragEvent, status: ProjectStatus) {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('text/project-id')
    const p = data.projects.find((x) => x.id === id)
    if (!p || p.status === status) return
    void update('projects', id, { status, ...(status === 'completed' ? { progress: 100 } : {}) })
  }

  const open = data.projects.find((p) => p.id === openId) ?? null

  return (
    <>
      <PageHeader
        eyebrow="Projects Tracker"
        title="Projects"
        actions={
          <>
            <Segmented
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'board', label: <><KanbanSquare className="size-3.5" /> Board</> },
                { value: 'list', label: <><List className="size-3.5" /> List</> },
              ]}
            />
            <Button variant="primary" onClick={() => newProject()}>
              <Plus className="size-4" /> <span className="hidden sm:inline">New project</span>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input className="field pl-8" placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1">
          {(['all', ...PROJECT_AREAS] as const).map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={cx(
                'h-8 shrink-0 rounded-lg px-3 text-xs font-medium capitalize transition',
                area === a ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {a}
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
                  <Button variant="ghost" size="icon" className="size-6" onClick={() => newProject(status)} aria-label={`Add to ${status}`}>
                    <Plus className="size-3.5" />
                  </Button>
                </header>
                <div className="flex min-h-24 flex-col gap-2">
                  {col.map((p) => (
                    <ProjectCard key={p.id} p={p} tasks={tasksByProject.get(p.id) ?? []} onOpen={() => setOpenId(p.id)} />
                  ))}
                  {col.length === 0 && <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-line py-6 text-xs text-faint">Drop here</div>}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <ProjectList projects={projects} tasksByProject={tasksByProject} onOpen={setOpenId} />
      )}

      {open && <ProjectModal key={open.id} project={open} tasks={tasksByProject.get(open.id) ?? []} onClose={() => setOpenId(null)} />}
    </>
  )
}

function Deadline({ date }: { date: string }) {
  const d = daysUntil(date)
  return (
    <span className={cx('num inline-flex items-center gap-1', d < 0 ? 'text-rose-500' : d <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-muted')}>
      <CalendarDays className="size-3" />
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
        <span className={cx('font-mono text-[10px] font-semibold uppercase', PRIORITY_STYLES[p.priority])}>{p.priority}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <Badge className={AREA_STYLES[p.area]}>{p.area}</Badge>
        {p.deadline && <Deadline date={p.deadline} />}
      </div>
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
  if (projects.length === 0) return <Empty>No projects match your filters.</Empty>
  return (
    <div className="card overflow-hidden">
      {/* desktop table */}
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-line bg-surface-2 text-left">
          <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:tracking-wider [&>th]:text-muted [&>th]:uppercase">
            <th>Project</th>
            <th>Area</th>
            <th>Status</th>
            <th>Priority</th>
            <th className="w-48">Progress</th>
            <th>Deadline</th>
            <th>Tasks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {projects.map((p) => {
            const tasks = tasksByProject.get(p.id) ?? []
            return (
              <tr key={p.id} className="cursor-pointer hover:bg-surface-2" onClick={() => onOpen(p.id)}>
                <td className="px-4 py-3 font-medium">{p.title}</td>
                <td className="px-4 py-3">
                  <Badge className={AREA_STYLES[p.area]}>{p.area}</Badge>
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
                <td className={cx('px-4 py-3 font-mono text-xs uppercase', PRIORITY_STYLES[p.priority])}>{p.priority}</td>
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
                <span className={cx('font-mono text-[10px] uppercase', PRIORITY_STYLES[p.priority])}>{p.priority}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 pl-4 text-[11px]">
                <Badge className={AREA_STYLES[p.area]}>{p.area}</Badge>
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

// ---------------------------------------------------------------- Editor
/** Mounted with `key={project.id}` so the local form resets per project. */
function ProjectModal({ project, tasks, onClose }: { project: Project; tasks: ProjectTask[]; onClose: () => void }) {
  const { update, remove, create } = useData()
  const toast = useToast()
  const [form, setForm] = useState<Project>(project)
  const [newTask, setNewTask] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = <K extends keyof Project>(k: K, v: Project[K]) => setForm((f) => ({ ...f, [k]: v }))
  const dirty = (['title', 'area', 'status', 'priority', 'deadline', 'repo_url', 'notes', 'progress'] as const).some((k) => form[k] !== project[k])
  const done = tasks.filter((t) => t.is_done).length
  const repoValid = !form.repo_url || /^https?:\/\/\S+$/i.test(form.repo_url)

  async function save() {
    if (!form.title.trim() || !repoValid) return
    await update('projects', project.id, {
      title: form.title.trim(),
      area: form.area,
      status: form.status,
      priority: form.priority,
      deadline: form.deadline || null,
      repo_url: form.repo_url?.trim() || null,
      notes: form.notes,
      progress: form.progress,
    })
    toast('success', 'Project saved')
    onClose()
  }

  async function addTask() {
    const title = newTask.trim()
    if (!title) return
    setNewTask('')
    await create('project_tasks', { project_id: project.id, title, is_done: false })
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={<span className="flex items-center gap-2"><span className={cx('size-2 rounded-full', STATUS_STYLES[form.status].dot)} /> Project</span>}
      footer={
        <>
          {confirmDelete ? (
            <div className="mr-auto flex items-center gap-2 text-xs">
              <span className="text-muted">Delete project and its tasks?</span>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  onClose()
                  await remove('projects', project.id)
                  toast('success', 'Project deleted')
                }}
              >
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> <span className="hidden sm:inline">Delete</span>
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={save} disabled={!dirty || !form.title.trim() || !repoValid}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <input
          className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-faint"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Project title"
          maxLength={200}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Status">
            <select className="field" value={form.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_STYLES[s].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Area">
            <select className="field" value={form.area} onChange={(e) => set('area', e.target.value as ProjectArea)}>
              {PROJECT_AREAS.map((a) => (
                <option key={a} value={a}>
                  {labelize(a)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className="field" value={form.priority} onChange={(e) => set('priority', e.target.value as Project['priority'])}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {labelize(p)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Deadline">
            <input type="date" className="field num" value={form.deadline ?? ''} onChange={(e) => set('deadline', e.target.value || null)} />
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="label">Progress</span>
            <div className="flex items-center gap-2">
              {tasks.length > 0 && (
                <button
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                  onClick={() => set('progress', Math.round((done / tasks.length) * 100))}
                  title="Set progress from completed sub-tasks"
                >
                  <Wand2 className="size-3" /> from tasks
                </button>
              )}
              <span className="num text-sm font-semibold">{form.progress}%</span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={form.progress}
            onChange={(e) => set('progress', Number(e.target.value))}
            className="w-full"
            aria-label="Progress"
          />
        </div>

        <Field label="Repository URL">
          <div className="flex gap-2">
            <input
              className={cx('field num text-xs', !repoValid && 'border-rose-500')}
              placeholder="https://github.com/…"
              value={form.repo_url ?? ''}
              onChange={(e) => set('repo_url', e.target.value || null)}
            />
            {form.repo_url && repoValid && (
              <a href={form.repo_url} target="_blank" rel="noopener noreferrer" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line hover:bg-surface-2" aria-label="Open repository">
                <ExternalLink className="size-4" />
              </a>
            )}
          </div>
        </Field>

        {/* sub-tasks — saved immediately */}
        <div>
          <div className="flex items-center justify-between">
            <span className="label">Sub-tasks · milestones</span>
            <span className="num text-[11px] text-muted">
              {done}/{tasks.length}
            </span>
          </div>
          <ul className="space-y-1">
            {tasks.map((t) => (
              <li key={t.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <Check checked={t.is_done} onChange={(v) => update('project_tasks', t.id, { is_done: v })} label={t.title} />
                <span className={cx('flex-1 text-sm', t.is_done && 'text-faint line-through')}>{t.title}</span>
                <button
                  onClick={() => remove('project_tasks', t.id)}
                  className="text-faint opacity-0 group-hover:opacity-100 hover:text-rose-500 focus:opacity-100 max-md:opacity-100"
                  aria-label={`Delete ${t.title}`}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-1.5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void addTask()
            }}
          >
            <input className="field" placeholder="Add a sub-task and press Enter" value={newTask} onChange={(e) => setNewTask(e.target.value)} maxLength={300} />
            <Button type="submit" disabled={!newTask.trim()} aria-label="Add sub-task">
              <Plus className="size-4" />
            </Button>
          </form>
        </div>

        <Field label="Technical notes">
          <textarea
            className="field num min-h-32 text-xs leading-relaxed"
            rows={6}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Architecture decisions, TODOs, links… (Markdown friendly)"
          />
        </Field>
      </div>
    </Modal>
  )
}
