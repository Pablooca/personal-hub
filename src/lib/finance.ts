import type { Transaction } from './types'

export interface MonthSummary {
  income: number
  expense: number
  investment: number
  /** income − expense − investment: cash left in the account. */
  net: number
  /** (income − expense) / income: share of income not consumed (investing counts as saving). */
  savingsRate: number
}

export function summarise(txs: Transaction[]): MonthSummary {
  let income = 0
  let expense = 0
  let investment = 0
  for (const t of txs) {
    if (t.type === 'income') income += t.amount
    else if (t.type === 'expense') expense += t.amount
    else investment += t.amount
  }
  return {
    income,
    expense,
    investment,
    net: income - expense - investment,
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : 0,
  }
}

export const inMonth = (txs: Transaction[], ym: string) => txs.filter((t) => t.date.startsWith(ym))

export function byCategory(txs: Transaction[], type: Transaction['type']) {
  const map = new Map<string, number>()
  for (const t of txs) if (t.type === type) map.set(t.category, (map.get(t.category) ?? 0) + t.amount)
  return [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total)
}

const csvCell = (v: string | number) => {
  const s = String(v)
  // Quote when needed; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) && typeof v === 'string' ? `'${s}` : s
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(txs: Transaction[]): string {
  const head = ['date', 'type', 'category', 'concept', 'amount', 'account']
  const rows = txs.map((t) => [t.date, t.type, t.category, t.concept, t.amount.toFixed(2), t.account].map(csvCell).join(','))
  return [head.join(','), ...rows].join('\n')
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
