import { useState } from 'react'
import { Clock, ExternalLink, Trash2 } from 'lucide-react'
import { TASK_CATEGORY_LABELS, normaliseJiraKey, taskStatusPatch } from '../lib/tasks'
import { TASK_STATUS_STYLES } from '../lib/theme'
import { TASK_STATUSES, type ProjectTask, type TaskCategory, type TaskStatus } from '../lib/types'
import { fmtHours } from '../lib/worklog'
import { useData } from '../state/data'
import { useToast } from '../state/toast'
import { Button, Field, Modal } from './ui'

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
  onLogHours: (t: ProjectTask) => void
  onOpenProject: (projectId: string) => void
}) {
  const { data, update, remove } = useData()
  const toast = useToast()
  const [title, setTitle] = useState(task.title)
  const [owner, setOwner] = useState(ownerValue(task))
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [jira, setJira] = useState(task.jira_key ?? '')
  const logged = data.work_logs.filter((l) => l.task_id === task.id).reduce((a, l) => a + l.hours, 0)

  async function save() {
    if (!title.trim()) return
    const isCat = owner.startsWith('cat:')
    onClose()
    await update('project_tasks', task.id, {
      title: title.trim(),
      project_id: isCat ? null : owner,
      category: isCat ? (owner.slice(4) as TaskCategory) : null,
      jira_key: normaliseJiraKey(jira),
      ...taskStatusPatch(status),
    })
  }

  return (
    <Modal
      open
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
          <Button variant="primary" onClick={save} disabled={!title.trim()}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Título">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pertenece a">
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
          <Field label="Estado">
            <select className="field" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_STYLES[s].label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Clave de Jira (opcional)">
          <input className="field num uppercase" placeholder="PROJ-123" value={jira} onChange={(e) => setJira(e.target.value)} maxLength={40} />
        </Field>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
          <Clock className="size-4 text-faint" />
          <span className="text-muted">
            Horas registradas: <span className="num font-medium text-fg">{fmtHours(logged)}</span>
          </span>
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
        </div>
        {task.project_id && (
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
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
