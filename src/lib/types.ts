export const EVENT_CATEGORIES = ['work', 'master', 'research', 'training', 'personal', 'vacation', 'holiday'] as const
export type EventCategory = (typeof EVENT_CATEGORIES)[number]

export const PROJECT_AREAS = ['research', 'engineering', 'academic', 'personal'] as const
export type ProjectArea = (typeof PROJECT_AREAS)[number]

export const PROJECT_STATUSES = ['backlog', 'in_progress', 'review', 'completed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_CATEGORIES = ['work', 'personal'] as const
export type TaskCategory = (typeof TASK_CATEGORIES)[number]

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
  all_day: boolean
  series_id: string | null
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
  description: string
  start_date: string | null // YYYY-MM-DD
  deadline: string | null // YYYY-MM-DD — end date
  repo_url: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface ProjectTask {
  id: string
  user_id?: string
  project_id: string | null // null → standalone task with a category
  category: TaskCategory | null
  title: string
  status: TaskStatus
  is_done: boolean // always status === 'done'
  jira_key: string | null
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

export const CATEGORY_COLORS = ['rose', 'orange', 'amber', 'lime', 'emerald', 'teal', 'cyan', 'sky', 'indigo', 'violet', 'fuchsia', 'slate'] as const
export type CategoryColor = (typeof CATEGORY_COLORS)[number]

export interface Category {
  id: string
  user_id?: string
  name: string // lower-case; matches transactions.category
  type: TxType
  color: CategoryColor
  created_at: string
}

export const ACCOUNT_KINDS = ['checking', 'savings', 'credit', 'cash', 'investment'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export interface Account {
  id: string
  user_id?: string
  name: string
  kind: AccountKind
  color: CategoryColor
  is_primary: boolean
  created_at: string
}

export interface WorkLog {
  id: string
  user_id?: string
  date: string // YYYY-MM-DD
  hours: number
  description: string
  jira_key: string | null
  task_id: string | null
  created_at: string
}

export const SUBJECT_STATUSES = ['in_progress', 'passed', 'failed'] as const
export type SubjectStatus = (typeof SUBJECT_STATUSES)[number]

export interface StudyProgram {
  id: string
  user_id?: string
  name: string
  institution: string
  academic_year: string
  total_credits: number | null
  created_at: string
}

export interface StudySubject {
  id: string
  user_id?: string
  program_id: string
  name: string
  code: string
  credits: number
  semester: string
  professor: string
  color: CategoryColor
  status: SubjectStatus
  /** Official grade (e.g. from the acta). Overrides the calculated one. */
  final_grade: number | null
  target_grade: number
  created_at: string
}

export const ASSESSMENT_KINDS = ['delivery', 'exam'] as const
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number]

export interface StudyAssessment {
  id: string
  user_id?: string
  subject_id: string
  name: string
  weight: number // % of the final grade
  grade: number | null // 0–10, null = not graded yet
  /** 'delivery' = has a deadline · 'exam' = happens at a date and time. */
  kind: AssessmentKind
  /** Delivery deadline or exam date+time (ISO). Drives the Telegram reminders. */
  due_at: string | null
  /** Delivered / sat: no more reminders. */
  is_done: boolean
  created_at: string
}

export interface StudyFile {
  id: string
  user_id?: string
  subject_id: string
  name: string
  topic: string
  storage_path: string
  size_bytes: number
  created_at: string
}

export interface Tables {
  events: CalendarEvent
  projects: Project
  project_tasks: ProjectTask
  transactions: Transaction
  categories: Category
  accounts: Account
  work_logs: WorkLog
  study_programs: StudyProgram
  study_subjects: StudySubject
  study_assessments: StudyAssessment
  study_files: StudyFile
}

export type TableName = keyof Tables
export type Dataset = { [K in TableName]: Tables[K][] }
/** Row payload for inserts: server-managed fields are optional. */
export type NewRow<K extends TableName> = Omit<Tables[K], 'id' | 'user_id' | 'created_at' | 'updated_at'> & {
  id?: string
}
