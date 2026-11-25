import type { NewRow, Priority, ProjectTask, Recurrence, TaskCategory, TaskStatus } from './types'

/** status and is_done always travel together (the DB trigger enforces the same rule). */
export const taskStatusPatch = (status: TaskStatus) => ({ status, is_done: status === 'done' })

/** Build a new Kanban task: either a project sub-task or a standalone work/personal task. */
export function newTask(
  title: string,
  owner: { projectId: string } | { category: TaskCategory },
  status: TaskStatus = 'todo',
  jiraKey: string | null = null,
  extra: { description?: string; priority?: Priority; start_date?: string | null; due_date?: string | null; recurrence?: Recurrence | null } = {},
): NewRow<'project_tasks'> {
  return {
    description: '',
    priority: 'medium',
    start_date: null,
    due_date: null,
    recurrence: null,
    ...extra,
    title,
    project_id: 'projectId' in owner ? owner.projectId : null,
    category: 'category' in owner ? owner.category : null,
    jira_key: normaliseJiraKey(jiraKey),
    ...taskStatusPatch(status),
  }
}

/** "plat-142 " → "PLAT-142"; empty → null. */
export function normaliseJiraKey(key: string | null | undefined): string | null {
  const k = (key ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return k ? k.slice(0, 40) : null
}

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = { work: 'Trabajo', personal: 'Personal' }

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  daily: 'Cada día',
  weekdays: 'De lunes a viernes',
  weekly: 'Cada semana',
  biweekly: 'Cada dos semanas',
  monthly: 'Cada mes',
  yearly: 'Cada año',
}

const DAY = 86_400_000
const toUtc = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)))
const key = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Next date after `from`. Months keep the day, clamped to the month's length. */
export function stepDate(from: string, r: Recurrence): string {
  const t = toUtc(from)
  if (r === 'daily') return key(t + DAY)
  if (r === 'weekly') return key(t + 7 * DAY)
  if (r === 'biweekly') return key(t + 14 * DAY)
  if (r === 'weekdays') {
    let n = t + DAY
    while ([0, 6].includes(new Date(n).getUTCDay())) n += DAY
    return key(n)
  }
  const d = new Date(t)
  const [y, m] = r === 'monthly' ? [d.getUTCFullYear(), d.getUTCMonth() + 1] : [d.getUTCFullYear() + 1, d.getUTCMonth()]
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return key(Date.UTC(y, m, Math.min(d.getUTCDate(), last)))
}

/** The task to create when a recurring one is completed; its date is always after today. */
export function nextOccurrence(t: ProjectTask, today: string): NewRow<'project_tasks'> | null {
  if (!t.recurrence) return null
  let due = stepDate(t.due_date ?? today, t.recurrence)
  for (let i = 0; i < 1000 && due <= today; i++) due = stepDate(due, t.recurrence)
  const shift = t.due_date && t.start_date ? toUtc(t.due_date) - toUtc(t.start_date) : null
  return {
    project_id: t.project_id, category: t.category, title: t.title, ...taskStatusPatch('todo'), jira_key: t.jira_key, description: t.description, priority: t.priority,
    start_date: shift === null ? null : key(toUtc(due) - shift), due_date: due, recurrence: t.recurrence,
  }
}

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none'
export const BUCKET_LABELS: Record<DueBucket, string> = { overdue: 'Atrasadas', today: 'Hoy', week: 'Próximos 7 días', later: 'Más adelante', none: 'Sin fecha' }
export function dueBucket(due: string | null, today: string): DueBucket {
  if (!due) return 'none'
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  return toUtc(due) - toUtc(today) <= 7 * DAY ? 'week' : 'later'
}
