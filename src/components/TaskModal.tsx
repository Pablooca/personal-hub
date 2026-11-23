import { useState } from 'react'
import { Clock, ExternalLink, Trash2 } from 'lucide-react'
import { TASK_CATEGORY_LABELS, normaliseJiraKey, taskStatusPatch } from '../lib/tasks'
import { PRIORITY_LABELS, TASK_STATUS_STYLES } from '../lib/theme'
import { PRIORITIES, TASK_STATUSES, type Priority, type ProjectTask, type TaskCategory, type TaskStatus } from '../lib/types'
import { fmtHours } from '../lib/worklog'
import { useData } from '../state/data'
import { useToast } from '../state/toast'
import { Button, Field, Modal, cx } from './ui'

/** Grows a textarea to fit its content. */
const autoGrow = (el: HTMLTextAreaElement | null) => {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

/** Owner select value: "cat:work" | "cat:personal" | "<project id>" */
const ownerValue = (t: Pick<ProjectTask, 'project_id' | 'category'>) => (t.project_id ? t.project_id : `cat:${t.category ?? 'work'}`)

export function TaskModal({
  task,
  onClose,
  onLogHours,
  onOpenProject,
}: {
  task: ProjectTask
  onClose: () => void
  /** Omitted → the "Registrar horas" button is hidden. */
  onLogHours?: (t: ProjectTask) => void
  /** Omitted (e.g. already on the project page) → no "Abrir proyecto" link. */
  onOpenProject?: (projectId: string) => void
}) {
  const { data, update, remove } = useData()
  const toast = useToast()
  const [title, setTitle] = useState(task.title)
  const [owner, setOwner] = useState(ownerValue(task))
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [jira, setJira] = useState(task.jira_key ?? '')
  const [description, setDescription] = useState(task.description ?? '')
  const [priority, setPriority] = useState<Priority>(task.priority ?? 'medium')
  const [startDate, setStartDate] = useState(task.start_date ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const datesValid = !startDate || !dueDate || dueDate >= startDate
  const logged = data.work_logs.filter((l) => l.task_id === task.id).reduce((a, l) => a + l.hours, 0)

  async function save() {
    if (!title.trim() || !datesValid) return
    const isCat = owner.startsWith('cat:')
    onClose()
    await update('project_tasks', task.id, {
      title: title.trim(),
      project_id: isCat ? null : owner,
      category: isCat ? (owner.slice(4) as TaskCategory) : null,
      jira_key: normaliseJiraKey(jira),
      description,
      priority,
      start_date: startDate || null,
      due_date: dueDate || null,
      ...taskStatusPatch(status),
    })
  }

  return (
    <Modal
      open
      full
      onClose={onClose}
      title="Tarea"
      footer={
        <>
          <Button
            variant="danger"
            className="mr-auto"
            onClick={async () => {
              onClose()
              await remove('project_tasks', task.id)
              toast('success', 'Tarea eliminada')
            }}
          >
            <Trash2 className="size-4" /> <span className="hidden sm:inline">Eliminar</span>
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!title.trim() || !datesValid}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="flex min-h-full flex-col gap-5 lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {/* ------------------------------------------------ main: title + description */}
        <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
          <label className="block">
            <span className="label">Título</span>
            <textarea
              ref={autoGrow}
              rows={1}
              className="field resize-none overflow-hidden text-lg leading-snug font-semibold"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value.replace(/\n/g, ' '))
                autoGrow(e.target)
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              maxLength={300}
            />
          </label>
          <label className="flex min-h-0 flex-1 flex-col">
            <span className="label">Descripción</span>
            <textarea
              className="field min-h-[40dvh] flex-1 resize-none text-sm leading-relaxed lg:min-h-0"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles, criterios de aceptación, enlaces, notas…"
              maxLength={5000}
            />
          </label>
        </div>

        {/* ------------------------------------------------ side: properties */}
        <aside className="space-y-4 lg:overflow-y-auto lg:border-l lg:border-line lg:pl-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Field label="Estado">
              <select className="field" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                {TASK_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {TASK_STATUS_STYLES[st].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prioridad">
              <select className="field" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pertenece a" className="col-span-2 lg:col-span-1">
              <select className="field" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <optgroup label="Sin proyecto">
                  {(Object.keys(TASK_CATEGORY_LABELS) as TaskCategory[]).map((c) => (
                    <option key={c} value={`cat:${c}`}>
                      {TASK_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Proyectos">
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <Field label="Fecha de inicio">
              <input type="date" className="field num" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Fecha de fin">
              <input
                type="date"
                className={cx('field num', !datesValid && 'border-rose-500')}
                value={dueDate}
                min={startDate || undefined}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
            <Field label="Clave de Jira" className="col-span-2 lg:col-span-1">
              <input className="field num uppercase" placeholder="PROJ-123 (opcional)" value={jira} onChange={(e) => setJira(e.target.value)} maxLength={40} />
            </Field>
          </div>
          {!datesValid && <p className="-mt-2 text-xs text-rose-500">La fecha de fin debe ser igual o posterior a la de inicio.</p>}

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
            <Clock className="size-4 text-faint" />
            <span className="text-muted">
              Horas registradas: <span className="num font-medium text-fg">{fmtHours(logged)}</span>
            </span>
            {onLogHours && (
              <Button
                type="button"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  onClose()
                  onLogHours(task)
                }}
              >
                Registrar horas
              </Button>
            )}
          </div>
          {task.project_id && onOpenProject && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
              onClick={() => {
                onClose()
                onOpenProject(task.project_id!)
              }}
            >
              <ExternalLink className="size-3.5" /> Abrir proyecto
            </button>
          )}
          <p className="font-mono text-[10px] text-faint">Creada el {new Date(task.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </aside>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
