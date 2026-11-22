import type { EventCategory, Priority, ProjectArea, ProjectStatus, TxType } from './types'

/** Category palette — Tailwind classes kept literal so they are not purged. */
export const CATEGORY_STYLES: Record<EventCategory, { dot: string; chip: string; bar: string; label: string }> = {
  work: {
    label: 'Work',
    dot: 'bg-sky-500',
    bar: 'border-l-sky-500',
    chip: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25',
  },
  master: {
    label: 'Master',
    dot: 'bg-violet-500',
    bar: 'border-l-violet-500',
    chip: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25',
  },
  research: {
    label: 'Research',
    dot: 'bg-emerald-500',
    bar: 'border-l-emerald-500',
    chip: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  },
  training: {
    label: 'Training',
    dot: 'bg-amber-500',
    bar: 'border-l-amber-500',
    chip: 'bg-amber-500/14 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  personal: {
    label: 'Personal',
    dot: 'bg-rose-500',
    bar: 'border-l-rose-500',
    chip: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25',
  },
}

export const AREA_STYLES: Record<ProjectArea, string> = {
  research: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
  engineering: 'text-sky-700 dark:text-sky-300 bg-sky-500/10 border-sky-500/25',
  academic: 'text-violet-700 dark:text-violet-300 bg-violet-500/10 border-violet-500/25',
  personal: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/25',
}

export const STATUS_STYLES: Record<ProjectStatus, { label: string; dot: string }> = {
  backlog: { label: 'Backlog', dot: 'bg-slate-400' },
  in_progress: { label: 'In progress', dot: 'bg-sky-500' },
  review: { label: 'Review', dot: 'bg-amber-500' },
  completed: { label: 'Completed', dot: 'bg-emerald-500' },
}

export const PRIORITY_STYLES: Record<Priority, string> = {
  low: 'text-muted',
  medium: 'text-amber-600 dark:text-amber-400',
  high: 'text-rose-600 dark:text-rose-400',
}

export const TX_STYLES: Record<TxType, { label: string; text: string; bg: string; sign: string }> = {
  income: { label: 'Income', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500', sign: '+' },
  expense: { label: 'Expense', text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500', sign: '−' },
  investment: { label: 'Investment', text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500', sign: '→' },
}

export const TX_CATEGORY_SUGGESTIONS: Record<TxType, string[]> = {
  income: ['salary', 'scholarship', 'freelance', 'refund', 'other'],
  expense: ['groceries', 'dining', 'transport', 'housing', 'subscriptions', 'health', 'education', 'leisure', 'other'],
  investment: ['index_fund', 'etf', 'pension', 'crypto', 'savings'],
}
