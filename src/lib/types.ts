export const EVENT_CATEGORIES = ['work', 'master', 'research', 'training', 'personal'] as const
export type EventCategory = (typeof EVENT_CATEGORIES)[number]

export const PROJECT_AREAS = ['research', 'engineering', 'academic', 'personal'] as const
export type ProjectArea = (typeof PROJECT_AREAS)[number]

export const PROJECT_STATUSES = ['backlog', 'in_progress', 'review', 'completed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PRIORITIES = ['low', 'medium', 'high'] as const
export type Priority = (typeof PRIORITIES)[number]

export const TX_TYPES = ['income', 'expense', 'investment'] as const
export type TxType = (typeof TX_TYPES)[number]

export interface CalendarEvent {
  id: string
  user_id?: string
  title: string
  description: string
  start_at: string // ISO timestamp
  end_at: string // ISO timestamp
  category: EventCategory
  is_completed: boolean
  created_at: string
}

export interface Project {
  id: string
  user_id?: string
  title: string
  area: ProjectArea
  status: ProjectStatus
  progress: number
  priority: Priority
  deadline: string | null // YYYY-MM-DD
  repo_url: string | null
  notes: string
  updated_at: string
}

export interface ProjectTask {
  id: string
  user_id?: string
  project_id: string
  title: string
  is_done: boolean
  created_at: string
}

export interface Transaction {
  id: string
  user_id?: string
  date: string // YYYY-MM-DD
  type: TxType
  category: string
  concept: string
  amount: number
  account: string
  created_at: string
}

export interface Tables {
  events: CalendarEvent
  projects: Project
  project_tasks: ProjectTask
  transactions: Transaction
}

export type TableName = keyof Tables
export type Dataset = { [K in TableName]: Tables[K][] }
/** Row payload for inserts: server-managed fields are optional. */
export type NewRow<K extends TableName> = Omit<Tables[K], 'id' | 'user_id' | 'created_at' | 'updated_at'> & {
  id?: string
}
