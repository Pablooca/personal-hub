import { useCallback } from 'react'
import { toDateKey } from '../lib/dates'
import { nextOccurrence, taskStatusPatch } from '../lib/tasks'
import type { ProjectTask, TaskStatus } from '../lib/types'
import { useData } from './data'
import { useToast } from './toast'

/** Change a task's status; completing a recurring one creates the next. */
export function useTaskActions() {
  const { update, create } = useData()
  const toast = useToast()
  const setStatus = useCallback(
    async (t: ProjectTask, status: TaskStatus, patch: Partial<ProjectTask> = {}) => {
      const merged = { ...t, ...patch }
      const next = status === 'done' && !t.is_done ? nextOccurrence(merged, toDateKey(new Date())) : null
      // The finished one stops repeating: reopening and closing it again must not create another.
      await update('project_tasks', t.id, { ...patch, ...taskStatusPatch(status), ...(next ? { recurrence: null } : {}) })
      if (next && (await create('project_tasks', next))) toast('success', `Siguiente: ${next.due_date!.split('-').reverse().join('/')}`)
    },
    [update, create, toast],
  )
  return { setStatus }
}
