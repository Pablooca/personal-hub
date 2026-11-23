import type { NewRow, Priority, TaskCategory, TaskStatus } from './types'

/** status and is_done always travel together (the DB trigger enforces the same rule). */
export const taskStatusPatch = (status: TaskStatus) => ({ status, is_done: status === 'done' })

/** Build a new Kanban task: either a project sub-task or a standalone work/personal task. */
export function newTask(
  title: string,
  owner: { projectId: string } | { category: TaskCategory },
  status: TaskStatus = 'todo',
  jiraKey: string | null = null,
  extra: { description?: string; priority?: Priority; start_date?: string | null; due_date?: string | null } = {},
): NewRow<'project_tasks'> {
  return {
    description: '',
    priority: 'medium',
    start_date: null,
    due_date: null,
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
