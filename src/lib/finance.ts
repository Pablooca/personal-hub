import type { Account, Transaction } from './types'

/**
 * Opening balances (e.g. dated 31 Dec) carry money that already existed.
 * They count towards account balances but never as income.
 */
export const OPENING_BALANCE = 'opening_balance'

/**
 * Money moved back from a savings account to the primary one. Stored as a pair:
 * an income on the primary account and an expense on the savings account (so
 * balances stay right). Neither counts as income/expense; it reduces "Ahorrado".
 */
export const SAVINGS_WITHDRAWAL = 'savings_withdrawal'

export interface MonthSummary {
  income: number
  expense: number
  investment: number
  /** income − expense − saved: cash left in the current account. */
  net: number
  /** (income − expense) / income: share of income not spent (money moved to savings counts as saved). */
  savingsRate: number
}

export function summarise(txs: Transaction[]): MonthSummary {
  let income = 0
  let expense = 0
  let investment = 0
  for (const t of txs) {
    if (t.category === OPENING_BALANCE) continue
    if (t.category === SAVINGS_WITHDRAWAL) {
      if (t.type === 'income') investment -= t.amount
      continue
    }
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

/** Year-to-date: from 1 January of `ym`'s year through the end of month `ym` (inclusive). */
export const yearToDate = (txs: Transaction[], ym: string) => {
  const from = `${ym.slice(0, 4)}-01`
  return txs.filter((t) => {
    const m = t.date.slice(0, 7)
    return m >= from && m <= ym
  })
}

export function byCategory(txs: Transaction[], type: Transaction['type']) {
  const map = new Map<string, number>()
  for (const t of txs) if (t.type === type && t.category !== SAVINGS_WITHDRAWAL && t.category !== OPENING_BALANCE) map.set(t.category, (map.get(t.category) ?? 0) + t.amount)
  return [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total)
}

const csvCell = (v: string) => {
  // Neutralise spreadsheet formula injection, then quote when needed.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Spanish Excel-friendly CSV: `;` separator and decimal comma. */
export function toCsv(txs: Transaction[]): string {
  const head = ['fecha', 'tipo', 'categoria', 'concepto', 'importe', 'cuenta']
  const typeEs = { income: 'ingreso', expense: 'gasto', investment: 'ahorro' } as const
  const rows = txs.map((t) =>
    [t.date, typeEs[t.type], t.category, t.concept, t.amount.toFixed(2).replace('.', ','), t.account].map(csvCell).join(';'),
  )
  return [head.join(';'), ...rows].join('\n')
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

export interface AccountBalance {
  name: string
  account: Account | null // null → name only seen in transactions (e.g. an unmatched card)
  balance: number
  count: number
}

/**
 * Balance per account up to (and including) month `ym`.
 * income: +amount · expense: −amount on its account.
 * saved: +amount on its account and −amount on the primary account
 * (a transfer from the everyday account into savings).
 */
export function accountBalances(txs: Transaction[], accounts: Account[], ym?: string): AccountBalance[] {
  const primary = accounts.find((a) => a.is_primary)?.name
  const bal = new Map<string, { balance: number; count: number }>()
  const bump = (name: string, delta: number, counted = true) => {
    const cur = bal.get(name) ?? { balance: 0, count: 0 }
    cur.balance += delta
    if (counted) cur.count += 1
    bal.set(name, cur)
  }
  accounts.forEach((a) => bal.set(a.name, { balance: 0, count: 0 }))
  for (const t of txs) {
    if (ym && t.date.slice(0, 7) > ym) continue
    if (t.type === 'income') bump(t.account, t.amount)
    else if (t.type === 'expense') bump(t.account, -t.amount)
    else {
      bump(t.account, t.amount)
      if (primary && t.account !== primary) bump(primary, -t.amount, false)
    }
  }
  const known = new Map(accounts.map((a) => [a.name, a]))
  const order = (a: Account | null) => (a ? (a.is_primary ? -1 : accounts.indexOf(a)) : Number.MAX_SAFE_INTEGER)
  return [...bal.entries()]
    .map(([name, v]) => ({ name, account: known.get(name) ?? null, ...v }))
    .sort((a, b) => order(a.account) - order(b.account) || a.name.localeCompare(b.name))
}
