/** Rules, budgets, recurring charges and category comparison. Pure functions. */
import type { Bill, Category, CategoryRule, Transaction, TxType } from './types'
import { OPENING_BALANCE, SAVINGS_WITHDRAWAL } from './finance.ts'

export const foldText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** First rule whose text appears in the concept; the longest pattern wins. */
export function matchRule(rules: readonly CategoryRule[], concept: string, type: TxType): CategoryRule | null {
  const c = foldText(concept)
  return [...rules].filter((r) => r.type === type && r.pattern.trim() && c.includes(foldText(r.pattern))).sort((a, b) => b.pattern.length - a.pattern.length)[0] ?? null
}

export interface BudgetLine {
  category: Category
  limit: number
  spent: number
  pct: number
  /** Spending at this pace by the end of the month. */
  projected: number
  state: 'ok' | 'warn' | 'over'
}

export function budgetLines(categories: readonly Category[], monthTxs: readonly Transaction[], ym: string, today: string): BudgetLine[] {
  const [y, m] = ym.split('-').map(Number)
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const day = today.slice(0, 7) === ym ? Number(today.slice(8, 10)) : total
  return categories
    .filter((c) => c.type === 'expense' && c.budget !== null && c.budget !== undefined && c.budget > 0)
    .map((category) => {
      const spent = Math.round(monthTxs.filter((t) => t.type === 'expense' && t.category === category.name).reduce((a, t) => a + t.amount, 0) * 100) / 100
      const limit = category.budget!
      const pct = (spent / limit) * 100
      return { category, limit, spent, pct, projected: (spent / day) * total, state: (pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok') as BudgetLine['state'] }
    })
    .sort((a, b) => b.pct - a.pct)
}

// ------------------------------------------------------------------ recurring
export const BILL_PERIODS = ['weekly', 'monthly', 'bimonthly', 'quarterly', 'yearly'] as const
export const PERIOD_LABELS: Record<Bill['period'], string> = { weekly: 'Cada semana', monthly: 'Cada mes', bimonthly: 'Cada 2 meses', quarterly: 'Cada 3 meses', yearly: 'Cada año' }
const MONTHS: Partial<Record<Bill['period'], number>> = { monthly: 1, bimonthly: 2, quarterly: 3, yearly: 12 }

const DAY = 86_400_000
const utc = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)))
const key = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Charge dates in [from, to], counted from the anchor so months never drift. */
export function chargeDates(bill: Pick<Bill, 'anchor_date' | 'period'>, from: string, to: string): string[] {
  const out: string[] = []
  const a = new Date(utc(bill.anchor_date))
  const step = MONTHS[bill.period]
  for (let i = 0; i < 2000; i++) {
    let d: string
    if (!step) d = key(a.getTime() + i * 7 * DAY)
    else {
      const last = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + i * step + 1, 0)).getUTCDate()
      d = key(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + i * step, Math.min(a.getUTCDate(), last)))
    }
    if (d > to) break
    if (d >= from) out.push(d)
  }
  return out
}
/** Monthly equivalent. */
export const monthlyCost = (b: Pick<Bill, 'amount' | 'period'>) => (b.period === 'weekly' ? (b.amount * 52) / 12 : b.amount / MONTHS[b.period]!)

export interface Detected {
  key: string
  name: string
  category: string
  account: string
  amount: number
  period: Bill['period']
  last: string
  times: number
}

/** Merchant part of a concept: no numbers, dates or places after a comma. */
export const merchantKey = (concept: string) => foldText(concept).replace(/[0-9*#]+/g, ' ').replace(/\b(compra|pago|recibo|internet|movil|en|de|tarjeta|apple pay|s\.?l\.?|s\.?a\.?)\b/g, ' ').split(',')[0].replace(/[^a-zñ. ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30)

/** Same merchant, similar amount, regular interval, at least three times, still alive. */
export function detectRecurring(txs: readonly Transaction[], bills: readonly Bill[], today: string): Detected[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.type !== 'expense' || t.category === SAVINGS_WITHDRAWAL || t.category === OPENING_BALANCE) continue
    const k = merchantKey(t.concept)
    if (k.length < 3) continue
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  const known = bills.map((b) => merchantKey(b.name))
  const out: Detected[] = []
  for (const [k, list] of groups) {
    if (known.includes(k)) continue
    // Cluster by amount (±12 %): a shop can be both a subscription and one-off purchases.
    const left = [...list].sort((a, b) => a.date.localeCompare(b.date))
    while (left.length >= 3) {
      const ref = left[left.length - 1].amount
      const cluster = left.filter((t) => Math.abs(t.amount - ref) <= Math.max(0.5, ref * 0.12))
      for (const t of cluster) left.splice(left.indexOf(t), 1)
      if (cluster.length < 3) continue
      const gaps = cluster.slice(1).map((t, i) => (utc(t.date) - utc(cluster[i].date)) / DAY)
      const mid = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
      const period = (mid >= 6 && mid <= 8 ? 'weekly' : mid >= 26 && mid <= 35 ? 'monthly' : mid >= 55 && mid <= 66 ? 'bimonthly' : mid >= 85 && mid <= 97 ? 'quarterly' : mid >= 350 && mid <= 380 ? 'yearly' : null) as Bill['period'] | null
      if (!period) continue
      const tol = period === 'weekly' ? 2 : period === 'yearly' ? 20 : 6
      if (gaps.filter((g) => Math.abs(g - mid) <= tol).length < Math.ceil(gaps.length * 0.7)) continue
      const last = cluster[cluster.length - 1]
      // Not charged for more than one and a half periods: cancelled.
      if ((utc(today) - utc(last.date)) / DAY > mid * 1.6 + 3) continue
      out.push({ key: `${k}|${period}`, name: last.concept, category: last.category, account: last.account, amount: last.amount, period, last: last.date, times: cluster.length })
      break
    }
  }
  return out.sort((a, b) => monthlyCost(b) - monthlyCost(a))
}

// ----------------------------------------------------------------- comparison
export interface Comparison {
  category: string
  current: number
  average: number
  diff: number
}

/** This month against the average of the previous `n` months with data. */
export function compareCategories(txs: readonly Transaction[], ym: string, n = 6): Comparison[] {
  const [y, m] = ym.split('-').map(Number)
  const prev = Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 2 - i, 1)).toISOString().slice(0, 7))
  const withData = prev.filter((p) => txs.some((t) => t.date.startsWith(p)))
  const sum = (months: string[]) => {
    const map = new Map<string, number>()
    for (const t of txs) if (t.type === 'expense' && t.category !== SAVINGS_WITHDRAWAL && t.category !== OPENING_BALANCE && months.includes(t.date.slice(0, 7))) map.set(t.category, (map.get(t.category) ?? 0) + t.amount)
    return map
  }
  const cur = sum([ym])
  const old = sum(withData)
  return [...new Set([...cur.keys(), ...old.keys()])]
    .map((category) => {
      const current = cur.get(category) ?? 0
      const average = withData.length ? (old.get(category) ?? 0) / withData.length : 0
      return { category, current, average, diff: current - average }
    })
    .filter((c) => c.current >= 1 || c.average >= 1)
    .sort((a, b) => b.current - a.current || b.average - a.average)
}
