/** Bank statement → movements, with duplicate detection. Pure functions. */
import type { Cell } from './xls'
import type { Transaction } from './types'

export interface BankRow {
  date: string
  concept: string
  /** Signed: negative = money out. */
  amount: number
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function parseBankDate(x: Cell): string | null {
  if (typeof x === 'number') {
    // Excel serial date.
    if (x < 20_000 || x > 80_000) return null
    return new Date(Math.round((x - 25_569) * 86_400_000)).toISOString().slice(0, 10)
  }
  const m = x?.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return x && /^\d{4}-\d{2}-\d{2}$/.test(x.trim()) ? x.trim() : null
}

export function parseBankAmount(x: Cell): number | null {
  if (typeof x === 'number') return Math.round(x * 100) / 100
  if (!x) return null
  let s = x.replace(/[^\d,.\-−+]/g, '').replace('−', '-')
  if (!/\d/.test(s)) return null
  if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Card and account numbers never get into the database. */
export function cleanConcept(s: string): string {
  return s
    .replace(/\b(?:tarj(?:eta)?\.?\s*)?(?:\*|x|\d){4}[\s-]*(?:(?:\*|x|\d){2,4}[\s-]*){2,3}(?:\*|x|\d){1,4}\b/gi, '')
    .replace(/\bES\d{2}(?:\s?\d{4}){5}\b/gi, '')
    .replace(/[,;]?\s*tarj(?:eta)?\.?\s*:?\s*[*\dxX]+/gi, '')
    .replace(/\d{8,}/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,.;:-]+$/, '')
    .trim()
    .slice(0, 200)
}

/** Find the header row (date, concept, amount) anywhere in the sheet and read below it. */
export function parseStatement(rows: Cell[][]): { rows: BankRow[]; skipped: number } {
  const is = (c: Cell, re: RegExp) => typeof c === 'string' && re.test(fold(c))
  const h = rows.findIndex((r) => r.some((c) => is(c, /^(fecha|date)/)) && r.some((c) => is(c, /^(concepto|descripcion|detalle|concept)/)) && r.some((c) => is(c, /^(importe|cantidad|amount)/)))
  if (h < 0) throw new Error('No encuentro las columnas de fecha, concepto e importe.')
  const head = rows[h]
  const cDate = head.findIndex((c) => is(c, /^(fecha|date)/))
  const cConcept = head.findIndex((c) => is(c, /^(concepto|descripcion|detalle|concept)/))
  const cAmount = head.findIndex((c) => is(c, /^(importe|cantidad|amount)/))
  const out: BankRow[] = []
  let skipped = 0
  for (const r of rows.slice(h + 1)) {
    if (!r?.some((c) => c !== null && c !== '')) continue
    const date = parseBankDate(r[cDate] ?? null)
    const amount = parseBankAmount(r[cAmount] ?? null)
    if (!date || amount === null || amount === 0) {
      skipped++
      continue
    }
    out.push({ date, amount, concept: cleanConcept(String(r[cConcept] ?? '')) })
  }
  return { rows: out, skipped }
}

/** CSV with , ; or tab. */
export function parseCsv(text: string): Cell[][] {
  const t = text.replace(/^﻿/, '')
  const first = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0]
  const rows: string[][] = [[]]
  let cur = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === sep) {
      rows[rows.length - 1].push(cur)
      cur = ''
    } else if (c === '\n') {
      rows[rows.length - 1].push(cur.replace(/\r$/, ''))
      rows.push([])
      cur = ''
    } else cur += c
  }
  rows[rows.length - 1].push(cur)
  return rows
}

export type ImportState = 'new' | 'duplicate' | 'maybe'
export interface ImportRow extends BankRow {
  state: ImportState
  /** The movement it looks like. */
  match: Transaction | null
}

const DAY = 86_400_000
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY
/** Account-side sign of a stored movement. */
const signed = (t: Transaction) => (t.type === 'income' ? t.amount : -t.amount)

/**
 * Exact: same day and amount (counting repeats). Possible: same amount within
 * four days — typically a card payment already recorded by Apple Pay.
 */
export function markDuplicates(rows: BankRow[], existing: Transaction[], account: string): ImportRow[] {
  const pool = existing.filter((t) => t.account === account || t.type === 'investment')
  const used = new Set<string>()
  const out: ImportRow[] = rows.map((r) => ({ ...r, state: 'new' as ImportState, match: null }))
  const take = (r: ImportRow, state: ImportState, test: (t: Transaction) => boolean) => {
    const t = pool.find((x) => !used.has(x.id) && Math.abs(Math.abs(signed(x)) - Math.abs(r.amount)) < 0.005 && (x.type === 'investment' || Math.sign(signed(x)) === Math.sign(r.amount)) && test(x))
    if (!t) return
    used.add(t.id)
    r.state = state
    r.match = t
  }
  for (const r of out) take(r, 'duplicate', (t) => t.date === r.date)
  for (const r of out) if (r.state === 'new') take(r, 'maybe', (t) => days(t.date, r.date) <= 4)
  return out
}
