import { useState } from 'react'
import { ArrowLeft, CalendarRange, ExternalLink, Loader2, Maximize2, Plus, Trash2, Wand2, X } from 'lucide-react'
import { Badge, Button, Card, Check, Field, ProgressBar, cx } from '../components/ui'
import { daysUntil, fromDateKey, startOfDay } from '../lib/dates'
import { fmtDate, uid } from '../lib/format'
import { AREA_LABELS, AREA_STYLES, PRIORITY_LABELS, PRIORITY_STYLES, STATUS_STYLES, TASK_STATUS_STYLES } from '../lib/theme'
import { TaskModal } from '../components/TaskModal'
import { LogHoursModal, type LogDraft } from '../components/LogHoursModal'
import { PRIORITIES, PROJECT_AREAS, PROJECT_STATUSES, TASK_STATUSES, type Project, type ProjectArea, type ProjectStatus, type ProjectTask, type TaskStatus } from '../lib/types'
import { newTask as buildTask, taskStatusPatch } from '../lib/tasks'
import { useData } from '../state/data'
import { useTaskActions } from '../state/useTasks'
import { useToast } from '../state/toast'

type Form = Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>

/** Textarea that grows with its content (long project names wrap instead of being cut). */
const autoGrow = (el: HTMLTextAreaElement | null) => {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function StatusSelect({ value, onChange }: { value: TaskStatus; onChange: (v: TaskStatus) => void }) {
  return (
    <select
      className="mt-0.5 h-7 shrink-0 rounded-md border border-line bg-surface-2 px-1.5 text-[11px] text-muted outline-none focus:ring-2 focus:ring-[var(--ring)]"
      value={value}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      aria-label="Estado de la subtarea"
    >
      {TASK_STATUSES.map((st) => (
        <option key={st} value={st}>
          {TASK_STATUS_STYLES[st].label}
        </option>
      ))}
    </select>
  )
}

const EDITABLE = ['title', 'description', 'area', 'status', 'priority', 'start_date', 'deadline', 'repo_url', 'notes', 'progress'] as const

function blank(status: ProjectStatus, area: ProjectArea): Form {
  return {
    title: '',
    description: '',
    area,
    status,
    progress: 0,
    priority: 'medium',
    start_date: null,
    deadline: null,
    repo_url: null,
    notes: '',
  }
}

/**
 * Full-page project view. `project === null` means "create a new project":
 * sub-tasks are kept as drafts and inserted together with the project on save.
 */
export function ProjectDetail({
  project,
  tasks,
  initialStatus = 'backlog',
  initialArea = 'engineering',
  onBack,
  onCreated,
}: {
  project: Project | null
  tasks: ProjectTask[]
  initialStatus?: ProjectStatus
  initialArea?: ProjectArea
  onBack: () => void
  onCreated: (id: string) => void
}) {
  const { create, createMany, update, remove } = useData()
  const { setStatus: applyStatus } = useTaskActions()
  const toast = useToast()
  const isNew = project === null
  const [form, setForm] = useState<Form>(() => (project ? { ...project } : blank(initialStatus, initialArea)))
  const [draftTasks, setDraftTasks] = useState<{ id: string; title: string; status: TaskStatus; is_done: boolean }[]>([])
  const [newTask, setNewTask] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [detailTask, setDetailTask] = useState<ProjectTask | null>(null)
  const [logDraft, setLogDraft] = useState<LogDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const dirty = isNew || EDITABLE.some((k) => (form[k] ?? null) !== (project[k] ?? null))
  const repoValid = !form.repo_url || /^https?:\/\/\S+$/i.test(form.repo_url)
  const datesValid = !form.start_date || !form.deadline || form.deadline >= form.start_date
  const canSave = form.title.trim().length > 0 && repoValid && datesValid && dirty && !saving

  const allTasks = isNew ? draftTasks : tasks
  const done = allTasks.filter((t) => t.is_done).length

  function back() {
    if (dirty && !(isNew && !form.title.trim()) && !window.confirm('¿Descartar los cambios sin guardar?')) return
    onBack()
  }

  async function save() {
    if (!canSave) return
    const payload = {
      ...form,
      title: form.title.trim(),
      repo_url: form.repo_url?.trim() || null,
      start_date: form.start_date || null,
      deadline: form.deadline || null,
    }
    setSaving(true)
    if (isNew) {
      const created = await create('projects', payload)
      if (created && draftTasks.length) {
        await createMany(
          'project_tasks',
          draftTasks.map((t) => buildTask(t.title, { projectId: created.id }, t.status)),
        )
      }
      setSaving(false)
      if (created) {
        toast('success', 'Proyecto creado')
        onCreated(created.id)
      }
    } else {
      await update('projects', project.id, payload)
      setSaving(false)
      toast('success', 'Proyecto guardado')
    }
  }

  async function addTask() {
    const title = newTask.trim()
    if (!title) return
    setNewTask('')
    if (isNew) setDraftTasks((t) => [...t, { id: uid(), title, ...taskStatusPatch('todo') }])
    else await create('project_tasks', buildTask(title, { projectId: project.id }))
  }

  const setTaskStatus = (id: string, status: TaskStatus) =>
    isNew
      ? setDraftTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...taskStatusPatch(status) } : t)))
      : applyStatus(tasks.find((t) => t.id === id)!, status)
  const toggleTask = (id: string, v: boolean) => setTaskStatus(id, v ? 'done' : 'todo')
  const deleteTask = (id: string) => (isNew ? setDraftTasks((ts) => ts.filter((t) => t.id !== id)) : remove('project_tasks', id))
  const renameTask = (id: string, title: string) => {
    const t = title.trim()
    if (!t) return
    if (isNew) setDraftTasks((ts) => ts.map((x) => (x.id === id ? { ...x, title: t } : x)))
    else if (tasks.find((x) => x.id === id)?.title !== t) void update('project_tasks', id, { title: t })
  }

  // ------------------------------------------------------------ timeline
  const timeline = (() => {
    if (!form.start_date || !form.deadline || !datesValid) return null
    const s = fromDateKey(form.start_date).getTime()
    const e = fromDateKey(form.deadline).getTime()
    const total = Math.max(1, Math.round((e - s) / 86_400_000))
    const elapsed = Math.round((startOfDay(new Date()).getTime() - s) / 86_400_000)
    return { total, elapsed, pct: Math.max(0, Math.min(100, (elapsed / total) * 100)), left: daysUntil(form.deadline) }
  })()

  return (
    <div className="pb-20">
      {/* --------------------------------------------------- header */}
      <button onClick={back} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Todos los proyectos
      </button>

      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow mb-1 flex items-center gap-2">
            <span className={cx('size-2 rounded-full', STATUS_STYLES[form.status].dot)} />
            {isNew ? 'Nuevo proyecto' : STATUS_STYLES[form.status].label}
            <Badge className={AREA_STYLES[form.area]}>{AREA_LABELS[form.area]}</Badge>
          </div>
          <textarea
            autoFocus={isNew}
            rows={1}
            ref={autoGrow}
            className="w-full resize-none overflow-hidden bg-transparent text-xl leading-snug font-semibold tracking-tight outline-none placeholder:text-faint sm:text-2xl"
            value={form.title}
            onChange={(e) => {
              set('title', e.target.value.replace(/\n/g, ' '))
              autoGrow(e.target)
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            placeholder="Nombre del proyecto"
            maxLength={200}
            aria-label="Nombre del proyecto"
          />
        </div>
        {!isNew &&
          (confirmDelete ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted">¿Eliminar el proyecto y sus subtareas?</span>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  onBack()
                  await remove('projects', project.id)
                }}
              >
                Confirmar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Eliminar
            </Button>
          ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------------------------- main column */}
        <div className="space-y-4">
          <Card title="Descripción">
            <textarea
              className="field min-h-28 text-sm leading-relaxed"
              rows={5}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="¿De qué trata el proyecto? Objetivo, alcance, resultado esperado…"
            />
          </Card>

          <Card
            title="Subtareas · hitos"
            action={
              <span className="num text-xs text-muted">
                {done}/{allTasks.length}
              </span>
            }
          >
            {allTasks.length > 0 && <ProgressBar value={(done / allTasks.length) * 100} tone="emerald" className="mb-3" />}
            <ul className="space-y-0.5">
              {allTasks.map((t) => {
                const full = 'due_date' in t ? (t as ProjectTask) : null
                const due = full?.due_date ? daysUntil(full.due_date) : null
                const overdue = due !== null && due < 0 && !t.is_done
                return (
                <li key={t.id} className="group flex items-start gap-2.5 rounded-lg px-2 py-1 hover:bg-surface-2">
                  <div className="pt-1.5">
                    <Check checked={t.is_done} onChange={(v) => toggleTask(t.id, v)} label={t.title} />
                  </div>
                  <div className="min-w-0 flex-1">
                  <textarea
                    key={t.title}
                    rows={1}
                    ref={autoGrow}
                    className={cx(
                      'block w-full resize-none overflow-hidden rounded bg-transparent px-1 py-1 text-sm leading-snug outline-none focus:bg-surface focus:ring-1 focus:ring-line',
                      t.is_done && 'text-faint line-through',
                    )}
                    defaultValue={t.title}
                    onInput={(e) => autoGrow(e.currentTarget)}
                    onBlur={(e) => renameTask(t.id, e.target.value.replace(/\n/g, ' '))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.currentTarget.blur()
                      }
                    }}
                    aria-label="Título de la subtarea"
                  />
                  <div className="px-1 pt-0.5 pb-1 sm:hidden">
                    <StatusSelect value={t.status} onChange={(v) => setTaskStatus(t.id, v)} />
                  </div>
                  {full && (full.due_date || full.start_date || full.priority !== 'medium' || full.description) && (
                    <button
                      type="button"
                      onClick={() => setDetailTask(full)}
                      className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-0.5 px-1 pb-0.5 text-left text-[11px] text-muted"
                    >
                      {full.priority !== 'medium' && (
                        <span className={cx('font-mono font-semibold uppercase', PRIORITY_STYLES[full.priority])}>{PRIORITY_LABELS[full.priority]}</span>
                      )}
                      {(full.start_date || full.due_date) && (
                        <span className={cx('num', overdue ? 'text-rose-700 dark:text-rose-400' : '')}>
                          {full.start_date ? fmtDate(fromDateKey(full.start_date)) : '…'} → {full.due_date ? fmtDate(fromDateKey(full.due_date)) : '…'}
                          {overdue && ' · vencida'}
                        </span>
                      )}
                      {full.description && <span className="min-w-0 flex-1 truncate">{full.description}</span>}
                    </button>
                  )}
                  </div>
                  <div className="hidden sm:block">
                    <StatusSelect value={t.status} onChange={(v) => setTaskStatus(t.id, v)} />
                  </div>
                  {full && (
                    <button
                      onClick={() => setDetailTask(full)}
                      className="mt-1 shrink-0 rounded p-1 text-faint hover:bg-surface hover:text-fg"
                      aria-label={`Detalles de ${t.title}`}
                      title="Fechas, prioridad y descripción"
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteTask(t.id)}
                    className="mt-1.5 text-faint opacity-0 group-hover:opacity-100 hover:text-rose-500 focus:opacity-100 max-md:opacity-100"
                    aria-label={`Eliminar ${t.title}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
                )
              })}
            </ul>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void addTask()
              }}
            >
              <input className="field" placeholder="Añade una subtarea y pulsa Intro" value={newTask} onChange={(e) => setNewTask(e.target.value)} maxLength={300} />
              <Button type="submit" disabled={!newTask.trim()} aria-label="Añadir subtarea">
                <Plus className="size-4" />
              </Button>
            </form>
            {isNew && draftTasks.length > 0 && <p className="mt-2 font-mono text-[10px] text-faint">Las subtareas se guardan al crear el proyecto.</p>}
          </Card>

          <Card title="Notas técnicas">
            <textarea
              className="field num min-h-40 text-xs leading-relaxed"
              rows={8}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Decisiones de arquitectura, pendientes, enlaces… (admite Markdown)"
            />
          </Card>
        </div>

        {/* ------------------------------------------------- side column */}
        <div className="space-y-4">
          <Card title="Detalles">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Estado">
                <select className="field" value={form.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_STYLES[s].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prioridad">
                <select className="field" value={form.priority} onChange={(e) => set('priority', e.target.value as Project['priority'])}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Área" className="col-span-2">
                <select className="field" value={form.area} onChange={(e) => set('area', e.target.value as ProjectArea)}>
                  {PROJECT_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {AREA_LABELS[a]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha de inicio">
                <input type="date" className="field num" value={form.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />
              </Field>
              <Field label="Fecha de fin">
                <input
                  type="date"
                  className={cx('field num', !datesValid && 'border-rose-500')}
                  value={form.deadline ?? ''}
                  min={form.start_date ?? undefined}
                  onChange={(e) => set('deadline', e.target.value || null)}
                />
              </Field>
            </div>
            {!datesValid && <p className="mt-2 text-xs text-rose-500">La fecha de fin debe ser igual o posterior a la de inicio.</p>}

            {timeline && (
              <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarRange className="size-3.5" /> Cronograma
                  </span>
                  <span className={cx('num', timeline.left < 0 ? 'text-rose-500' : timeline.left <= 7 ? 'text-amber-700 dark:text-amber-400' : '')}>
                    {timeline.elapsed < 0 ? `empieza en ${-timeline.elapsed} d` : timeline.left < 0 ? `${-timeline.left} d de retraso` : `quedan ${timeline.left} d`}
                  </span>
                </div>
                <div className="relative mt-2 h-1.5 rounded-full bg-line">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-faint/60" style={{ width: `${timeline.pct}%` }} title="Tiempo transcurrido" />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${form.progress}%`, height: '50%', top: '25%' }} title="Progreso" />
                </div>
                <div className="num mt-1.5 flex justify-between text-[10px] text-faint">
                  <span>{fmtDate(fromDateKey(form.start_date!), { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                  <span>{timeline.total} d</span>
                  <span>{fmtDate(fromDateKey(form.deadline!), { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                </div>
              </div>
            )}

            <Field label="URL del repositorio" className="mt-4">
              <div className="flex gap-2">
                <input
                  className={cx('field num text-xs', !repoValid && 'border-rose-500')}
                  placeholder="https://github.com/…"
                  value={form.repo_url ?? ''}
                  onChange={(e) => set('repo_url', e.target.value || null)}
                />
                {form.repo_url && repoValid && (
                  <a
                    href={form.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line hover:bg-surface-2"
                    aria-label="Abrir repositorio"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                )}
              </div>
            </Field>
          </Card>

          <Card
            title="Progreso"
            action={
              allTasks.length > 0 && (
                <button
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                  onClick={() => set('progress', Math.round((done / allTasks.length) * 100))}
                  title="Calcular el progreso a partir de las subtareas completadas"
                >
                  <Wand2 className="size-3" /> según subtareas
                </button>
              )
            }
          >
            <div className="num text-3xl font-semibold">{form.progress}%</div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.progress}
              onChange={(e) => set('progress', Number(e.target.value))}
              className="mt-2 w-full"
              aria-label="Progreso"
            />
          </Card>
        </div>
      </div>

      {detailTask && (
        <TaskModal
          key={detailTask.id}
          task={tasks.find((x) => x.id === detailTask.id) ?? detailTask}
          onClose={() => setDetailTask(null)}
          onLogHours={(t) => setLogDraft({ task_id: t.id })}
        />
      )}
      <LogHoursModal draft={logDraft} onClose={() => setLogDraft(null)} />

      {/* --------------------------------------------------- save bar */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-16 z-30 flex justify-center px-4 md:bottom-6">
          <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 shadow-xl shadow-black/10">
            <span className="flex-1 text-xs text-muted">{isNew ? 'Nuevo proyecto' : 'Cambios sin guardar'}</span>
            {!isNew && (
              <Button variant="ghost" size="sm" onClick={() => setForm({ ...project })}>
                Descartar
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={save} disabled={!canSave}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {isNew ? 'Crear proyecto' : 'Guardar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
