import type { Category, CategoryColor, Dataset, TxType } from './types'
import { labelize } from './format'

/** Literal classes so Tailwind keeps them. */
export const COLOR_BG: Record<CategoryColor, string> = {
  rose: 'bg-rose-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  lime: 'bg-lime-500',
  emerald: 'bg-emerald-500',
  teal: 'bg-teal-500',
  cyan: 'bg-cyan-500',
  sky: 'bg-sky-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  fuchsia: 'bg-fuchsia-500',
  slate: 'bg-slate-400',
}

const DEFAULTS: Record<TxType, [string, CategoryColor][]> = {
  income: [
    ['salary', 'emerald'],
    ['scholarship', 'teal'],
    ['freelance', 'cyan'],
    ['refund', 'lime'],
    ['opening_balance', 'teal'],
    ['other', 'slate'],
  ],
  expense: [
    ['groceries', 'amber'],
    ['dining', 'orange'],
    ['transport', 'sky'],
    ['housing', 'rose'],
    ['subscriptions', 'fuchsia'],
    ['health', 'emerald'],
    ['education', 'violet'],
    ['leisure', 'indigo'],
    ['shopping', 'cyan'],
    ['other', 'slate'],
  ],
  investment: [
    ['savings', 'sky'],
    ['index_fund', 'indigo'],
    ['pension', 'violet'],
    ['emergency_fund', 'teal'],
  ],
}

export function defaultCategories(): Omit<Category, 'id' | 'created_at'>[] {
  return (Object.keys(DEFAULTS) as TxType[]).flatMap((type) => DEFAULTS[type].map(([name, color]) => ({ name, type, color })))
}

/** Category assigned by automations (Apple Pay webhook) when no rule matches. */
export const UNCATEGORIZED = 'uncategorized'

export const normaliseCategory = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

/** Category names for a type, sorted, including any legacy names only present in transactions. */
export function categoryNames(data: Dataset, type: TxType): string[] {
  const set = new Set(data.categories.filter((c) => c.type === type).map((c) => c.name))
  if (set.size === 0) DEFAULTS[type].forEach(([n]) => set.add(n))
  set.delete(UNCATEGORIZED)
  return [...set].sort()
}

export function categoryColor(data: Dataset, type: TxType, name: string): CategoryColor | null {
  return data.categories.find((c) => c.type === type && c.name === name)?.color ?? null
}

/** Spanish labels for the built-in category keys (also used by the Apple Pay webhook). */
const CATEGORY_LABELS: Record<string, string> = {
  salary: 'Nómina',
  scholarship: 'Beca',
  freelance: 'Freelance',
  refund: 'Devolución',
  opening_balance: 'Saldo inicial',
  groceries: 'Supermercado',
  dining: 'Restaurantes',
  transport: 'Transporte',
  housing: 'Vivienda',
  subscriptions: 'Suscripciones',
  health: 'Salud',
  education: 'Formación',
  leisure: 'Ocio',
  shopping: 'Compras',
  other: 'Otros',
  savings: 'Ahorro',
  index_fund: 'Fondo indexado',
  pension: 'Plan de pensiones',
  emergency_fund: 'Fondo de emergencia',
  uncategorized: 'Sin categorizar',
}

export const categoryLabel = (name: string) => CATEGORY_LABELS[name] ?? labelize(name)
