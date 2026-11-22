import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toDateKey } from '../lib/dates'
import { TASK_CATEGORY_LABELS, normaliseJiraKey } from '../lib/tasks'
import type { WorkLog } from '../lib/types'
import { fmtHours, parseHours } from '../lib/worklog'
import { useData } from '../state/data'
import { useToast } from '../state/toast'
import { Button, Field, Modal, cx } from './ui'

export type LogDraft = Partial<WorkLog>

const QUICK = [0.5, 1, 2, 4, 8]

/** Create or edit a work-log entry. Pass `{ task_id }` / `{ date }` to prefill. */
export function LogHoursModal({ draft, onClose }: { draft: LogDraft | null; onClose: () => void }) {
  if (!draft) return null
  return <LogHoursForm key={draft.id ?? `${draft.task_id ?? ''}-${draft.date ?? ''}`} draft={draft} onClose={onClose} />
}

function LogHoursForm({ draft, onClose }: { draft: LogDraft; onClose: () => void }) {
  const { data, create, update, remove } = useData()
  const toast = useToast()
  const editing = Boolean(draft.id)
  const initialTask = data.project_tasks.find((t) => t.id === draft.task_id)

  const [date, setDate] = useState(draft.date ?? toDateKey(new Date()))
  const [hours, setHours] = useState(draft.hours ? String(draft.hours).replace('.', ',') : '')
  const [taskId, setTaskId] = useState(draft.task_id ?? '')
  const [jira, setJira] = useState(draft.jira_key ?? initialTask?.jira_key ?? '')
  const [description, setDescription] = useState(draft.description ?? '')

  const parsed = parseHours(hours)
  const dayTotal = data.work_logs.filter((l) => l.date === date && l.id !== draft.id).reduce((a, l) => a + l.hours, 0)

  // Tasks grouped for the selector: work first, then projects, then personal. Done tasks only if selected.
  const groups = useMemo(() => {
    const visible = data.project_tasks.filter((t) => t.status !== 'done' || t.id === taskId)
    const projectTitle = new Map(data.projects.map((p) => [p.id, p.title]))
    const g = new Map<string, typeof visible>()
    for (const t of visible) {
      const label = t.project_id ? (projectTitle.get(t.project_id) ?? 'Proyecto') : TASK_CATEGORY_LABELS[t.category ?? 'work']
      g.set(label, [...(g.get(label) ?? []), t])
    }
    return [...g.entries()].sort(([a], [b]) => (a === 'Trabajo' ? -1 : b === 'Trabajo' ? 1 : a.localeCompare(b)))
  }, [data.project_tasks, data.projects, taskId])

  const knownKeys = useMemo(
    () => [...new Set([...data.project_tasks.map((t) => t.jira_key), ...data.work_logs.map((l) => l.jira_key)].filter(Boolean) as string[])].sort(),
    [data.project_tasks, data.work_logs],
  )

  function pickTask(id: string) {
    setTaskId(id)
    const t = data.project_tasks.find((x) => x.id === id)
    if (t?.jira_key) setJira(t.jira_key)
    if (t && !description.trim()) setDescription(t.title)
  }

  async function save() {
    if (parsed === null || !date) return
    const row = {
      date,
      hours: parsed,
      description: description.trim(),
      jira_key: normaliseJiraKey(jira),
      task_id: taskId || null,
    }
    onClose()
    if (editing && draft.id) await update('work_logs', draft.id, row)
    else if (await create('work_logs', row)) toast('success', `${fmtHours(parsed)} registradas el ${date.split('-').reverse().join('/')}`)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Editar registro' : 'Registrar horas'}
      footer={
        <>
          {editing && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                onClose()
                await remove('work_logs', draft.id!)
              }}
            >
              <Trash2 className="size-4" /> Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={parsed === null || !date}>
            {editing ? 'Guardar' : 'Registrar'}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <input type="date" className="field num" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Horas">
            <input
              className={cx('field num', hours && parsed === null && 'border-rose-500')}
              inputMode="decimal"
              placeholder="p. ej. 2,5 o 1:30"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </Field>
        </div>
        <div className="-mt-2 flex flex-wrap items-center gap-1.5">
          {QUICK.map((q) => (
            <button
              type="button"
              key={q}
              onClick={() => setHours(String(q).replace('.', ','))}
              className={cx('num rounded-md border px-2 py-0.5 text-xs', parsed === q ? 'border-accent text-accent' : 'border-line text-muted hover:text-fg')}
            >
              {fmtHours(q)}
            </button>
          ))}
          <span className="ml-auto font-mono text-[11px] text-faint">
            Ese día: {fmtHours(dayTotal + (parsed ?? 0))}
          </span>
        </div>

        <Field label="Tarea (opcional)">
          <select className="field" value={taskId} onChange={(e) => pickTask(e.target.value)}>
            <option value="">— Sin tarea —</option>
            {groups.map(([label, tasks]) => (
              <optgroup key={label} label={label}>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.jira_key ? `${t.jira_key} · ` : ''}
                    {t.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field label="Clave de Jira">
          <input className="field num uppercase" list="jira-keys" placeholder="PROJ-123" value={jira} onChange={(e) => setJira(e.target.value)} maxLength={40} />
          <datalist id="jira-keys">
            {knownKeys.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </Field>

        <Field label="¿Qué has hecho?">
          <textarea
            className="field"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="p. ej. Revisión de PR, fix del bug de login, reunión de planificación…"
            maxLength={2000}
          />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
