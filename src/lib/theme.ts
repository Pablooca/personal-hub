import type { AgendaSource } from './agenda'
import type { AccountKind, EventCategory, Priority, ProjectArea, ProjectStatus, TaskStatus, TxType } from './types'

/** Category palette — Tailwind classes kept literal so they are not purged. */
export const CATEGORY_STYLES: Record<EventCategory, { dot: string; chip: string; bar: string; label: string }> = {
  work: {
    label: 'Trabajo',
    dot: 'bg-sky-500',
    bar: 'border-l-sky-500',
    chip: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25',
  },
  master: {
    label: 'Máster',
    dot: 'bg-violet-500',
    bar: 'border-l-violet-500',
    chip: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25',
  },
  research: {
    label: 'Investigación',
    dot: 'bg-emerald-500',
    bar: 'border-l-emerald-500',
    chip: 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/25',
  },
  training: {
    label: 'Entrenamiento',
    dot: 'bg-amber-500',
    bar: 'border-l-amber-500',
    chip: 'bg-amber-500/14 text-amber-800 dark:text-amber-300 border-amber-500/30',
  },
  personal: {
    label: 'Personal',
    dot: 'bg-rose-500',
    bar: 'border-l-rose-500',
    chip: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25',
  },
  vacation: {
    label: 'Vacaciones',
    dot: 'bg-teal-500',
    bar: 'border-l-teal-500',
    chip: 'bg-teal-500/14 text-teal-800 dark:text-teal-300 border-teal-500/30',
  },
  holiday: {
    label: 'Festivo',
    dot: 'bg-orange-500',
    bar: 'border-l-orange-500',
    chip: 'bg-orange-500/14 text-orange-800 dark:text-orange-300 border-orange-500/30',
  },
}

export const AREA_STYLES: Record<ProjectArea, string> = {
  research: 'text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
  engineering: 'text-sky-700 dark:text-sky-300 bg-sky-500/10 border-sky-500/25',
  academic: 'text-violet-700 dark:text-violet-300 bg-violet-500/10 border-violet-500/25',
  personal: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/25',
}

export const STATUS_STYLES: Record<ProjectStatus, { label: string; dot: string }> = {
  backlog: { label: 'Pendiente', dot: 'bg-slate-400' },
  in_progress: { label: 'En curso', dot: 'bg-sky-500' },
  review: { label: 'En revisión', dot: 'bg-amber-500' },
  completed: { label: 'Completado', dot: 'bg-emerald-500' },
}

export const TASK_STATUS_STYLES: Record<TaskStatus, { label: string; dot: string }> = {
  todo: { label: 'Por hacer', dot: 'bg-slate-400' },
  in_progress: { label: 'En curso', dot: 'bg-sky-500' },
  review: { label: 'En revisión', dot: 'bg-amber-500' },
  done: { label: 'Hecho', dot: 'bg-emerald-500' },
}

/** Solid colour per project area, used as the project tag on task cards. */
export const AREA_DOT: Record<ProjectArea, string> = {
  research: 'bg-emerald-500',
  engineering: 'bg-sky-500',
  academic: 'bg-violet-500',
  personal: 'bg-rose-500',
}

export const PRIORITY_STYLES: Record<Priority, string> = {
  low: 'text-muted',
  medium: 'text-amber-700 dark:text-amber-400',
  high: 'text-rose-700 dark:text-rose-400',
}

export const TX_STYLES: Record<TxType, { label: string; text: string; bg: string; sign: string }> = {
  income: { label: 'Ingreso', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500', sign: '+' },
  expense: { label: 'Gasto', text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-500', sign: '−' },
  investment: { label: 'Ahorro', text: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-500', sign: '→' },
}

export const TX_CATEGORY_SUGGESTIONS: Record<TxType, string[]> = {
  income: ['salary', 'scholarship', 'freelance', 'refund', 'other'],
  expense: ['groceries', 'dining', 'transport', 'housing', 'subscriptions', 'health', 'education', 'leisure', 'other'],
  investment: ['savings', 'index_fund', 'pension', 'emergency_fund'],
}

export const AREA_LABELS: Record<ProjectArea, string> = {
  research: 'Investigación',
  engineering: 'Ingeniería',
  academic: 'Académico',
  personal: 'Personal',
}

export const PRIORITY_LABELS: Record<Priority, string> = { low: 'Baja', medium: 'Media', high: 'Alta' }

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  checking: 'Cuenta corriente',
  savings: 'Cuenta de ahorro',
  credit: 'Tarjeta de crédito',
  cash: 'Efectivo',
  investment: 'Inversión',
}

/** Derived agenda items (runs, deadlines, tournaments…). */
export const SOURCE_STYLES: Record<AgendaSource, { dot: string; chip: string; bar: string }> = {
  run: { dot: 'bg-rose-500', bar: 'border-l-rose-500', chip: 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/30' },
  study: { dot: 'bg-violet-500', bar: 'border-l-violet-500', chip: 'bg-violet-500/10 text-violet-800 dark:text-violet-300 border-violet-500/30' },
  tournament: { dot: 'bg-yellow-500', bar: 'border-l-yellow-500', chip: 'bg-yellow-500/12 text-yellow-900 dark:text-yellow-200 border-yellow-500/40' },
  task: { dot: 'bg-sky-500', bar: 'border-l-sky-500', chip: 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30' },
  project: { dot: 'bg-teal-500', bar: 'border-l-teal-500', chip: 'bg-teal-500/10 text-teal-800 dark:text-teal-300 border-teal-500/30' },
  bill: { dot: 'bg-emerald-500', bar: 'border-l-emerald-500', chip: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30' },
}
