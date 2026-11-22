import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDownUp, ChevronLeft, ChevronRight, Download, PiggyBank, Plus, Scale, Search, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { PageHeader } from '../components/Shell'
import { Button, Card, Empty, Field, Modal, Segmented, Stat, cx } from '../components/ui'
import { addMonths, fromDateKey, monthKey, startOfMonth, toDateKey } from '../lib/dates'
import { byCategory, downloadCsv, inMonth, summarise, toCsv } from '../lib/finance'
import { fmtDate, fmtMoney, fmtMoneyShort, fmtMonth, fmtPct, labelize } from '../lib/format'
import { TX_CATEGORY_SUGGESTIONS, TX_STYLES } from '../lib/theme'
import { TX_TYPES, type Transaction, type TxType } from '../lib/types'
import { useData } from '../state/data'
import { useToast } from '../state/toast'

type Scope = 'month' | 'all'
type SortKey = 'date' | 'amount'

const CAT_COLORS = ['bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-teal-500', 'bg-fuchsia-500', 'bg-orange-500', 'bg-slate-400']

export function FinanceView() {
  const { data } = useData()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [editing, setEditing] = useState<Transaction | null>(null)
  const ym = monthKey(month)

  const monthTxs = useMemo(() => inMonth(data.transactions, ym), [data.transactions, ym])
  const s = useMemo(() => summarise(monthTxs), [monthTxs])
  const prev = useMemo(() => summarise(inMonth(data.transactions, monthKey(addMonths(month, -1)))), [data.transactions, month])
  const categories = useMemo(() => byCategory(monthTxs, 'expense'), [monthTxs])

  const trend = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const m = addMonths(month, i - 5)
        return { m, ...summarise(inMonth(data.transactions, monthKey(m))) }
      }),
    [data.transactions, month],
  )
  const trendMax = Math.max(1, ...trend.flatMap((t) => [t.income, t.expense + t.investment]))

  const delta = (cur: number, before: number) => {
    if (!before) return null
    const pct = ((cur - before) / before) * 100
    return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% vs last month`
  }

  const isCurrentMonth = ym === monthKey(new Date())

  return (
    <>
      <PageHeader
        eyebrow="Personal Finance"
        title={<span className="capitalize">{fmtMonth(month)}</span>}
        actions={
          <div className="flex items-center rounded-lg border border-line bg-surface">
            <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <button onClick={() => setMonth(startOfMonth(new Date()))} disabled={isCurrentMonth} className="h-8 px-2 text-xs font-medium text-muted hover:text-fg disabled:opacity-50">
              This month
            </button>
            <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Income" value={fmtMoney(s.income)} tone={TX_STYLES.income.text} hint={delta(s.income, prev.income)} icon={<TrendingUp className="size-4" />} />
        <Stat label="Expenses" value={fmtMoney(s.expense)} tone={TX_STYLES.expense.text} hint={delta(s.expense, prev.expense)} icon={<TrendingDown className="size-4" />} />
        <Stat label="Invested" value={fmtMoney(s.investment)} tone={TX_STYLES.investment.text} hint={delta(s.investment, prev.investment)} icon={<PiggyBank className="size-4" />} />
        <Stat
          label="Net balance"
          value={fmtMoney(s.net)}
          tone={s.net >= 0 ? 'text-fg' : 'text-rose-600 dark:text-rose-400'}
          hint="income − expenses − invested"
          icon={<Scale className="size-4" />}
        />
        <div className="col-span-2 lg:col-span-1">
          <Stat
            label="Savings rate"
            value={fmtPct(s.savingsRate)}
            tone={s.savingsRate >= 20 ? 'text-emerald-600 dark:text-emerald-400' : s.savingsRate >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}
            hint="(income − expenses) / income"
            icon={<PiggyBank className="size-4" />}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <QuickEntry defaultDate={isCurrentMonth ? toDateKey(new Date()) : `${ym}-01`} />

        <Card title="Expenses by category" action={<span className="num text-xs text-muted">{fmtMoney(s.expense)}</span>}>
          {categories.length === 0 ? (
            <Empty>No expenses this month.</Empty>
          ) : (
            <>
              <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-line">
                {categories.map((c, i) => (
                  <div key={c.category} className={CAT_COLORS[i % CAT_COLORS.length]} style={{ width: `${(c.total / s.expense) * 100}%` }} title={c.category} />
                ))}
              </div>
              <ul className="space-y-2.5">
                {categories.map((c, i) => (
                  <li key={c.category} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className={cx('size-2 rounded-sm', CAT_COLORS[i % CAT_COLORS.length])} />
                        {labelize(c.category)}
                      </span>
                      <span className="flex items-baseline gap-2">
                        <span className="num text-[11px] text-faint">{((c.total / s.expense) * 100).toFixed(0)}%</span>
                        <span className="num font-medium">{fmtMoney(c.total)}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="6-month trend" action={<Legend />}>
          <div className="flex h-44 items-end gap-2">
            {trend.map((t) => (
              <div key={t.m.toISOString()} className="flex h-full flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end justify-center gap-1">
                  <div className="w-1/3 max-w-3 rounded-t bg-emerald-500/80" style={{ height: `${(t.income / trendMax) * 100}%` }} title={`Income ${fmtMoney(t.income)}`} />
                  <div className="flex w-1/3 max-w-3 flex-col justify-end" style={{ height: `${((t.expense + t.investment) / trendMax) * 100}%` }}>
                    <div className="rounded-t bg-sky-500/80" style={{ height: `${t.expense + t.investment ? (t.investment / (t.expense + t.investment)) * 100 : 0}%` }} title={`Invested ${fmtMoney(t.investment)}`} />
                    <div className="flex-1 bg-rose-500/80" title={`Expenses ${fmtMoney(t.expense)}`} />
                  </div>
                </div>
                <span className={cx('font-mono text-[10px] uppercase', monthKey(t.m) === ym ? 'font-semibold text-fg' : 'text-faint')}>
                  {fmtDate(t.m, { month: 'short' })}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t border-line pt-3 text-xs text-muted">
            <span>Avg. savings rate</span>
            <span className="num font-medium text-fg">
              {fmtPct(trend.filter((t) => t.income > 0).reduce((a, t) => a + t.savingsRate, 0) / Math.max(1, trend.filter((t) => t.income > 0).length))}
            </span>
          </div>
        </Card>
      </div>

      <Ledger month={month} onEdit={setEditing} />
      {editing && <TxModal key={editing.id} tx={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function Legend() {
  return (
    <div className="flex gap-2.5 text-[10px] text-muted">
      <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500" />In</span>
      <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-rose-500" />Out</span>
      <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-sky-500" />Inv</span>
    </div>
  )
}

// ---------------------------------------------------------------- entry form
function TxFields({
  value,
  onChange,
}: {
  value: { type: TxType; amount: string; date: string; category: string; concept: string; account: string }
  onChange: (patch: Partial<typeof value>) => void
}) {
  const listId = `cats-${value.type}`
  return (
    <div className="space-y-3">
      <Segmented
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
        value={value.type}
        onChange={(type) => onChange({ type, category: TX_CATEGORY_SUGGESTIONS[type][0] })}
        options={TX_TYPES.map((t) => ({ value: t, label: TX_STYLES[t].label }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (€)">
          <input className="field num" inputMode="decimal" placeholder="0.00" value={value.amount} onChange={(e) => onChange({ amount: e.target.value })} required />
        </Field>
        <Field label="Date">
          <input type="date" className="field num" value={value.date} onChange={(e) => onChange({ date: e.target.value })} required />
        </Field>
        <Field label="Category">
          <input className="field" list={listId} value={value.category} onChange={(e) => onChange({ category: e.target.value })} required />
          <datalist id={listId}>
            {TX_CATEGORY_SUGGESTIONS[value.type].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Account">
          <input className="field" list="accounts" value={value.account} onChange={(e) => onChange({ account: e.target.value })} />
          <datalist id="accounts">
            {['checking', 'savings', 'credit', 'broker', 'cash'].map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Concept">
        <input className="field" placeholder="Description" value={value.concept} onChange={(e) => onChange({ concept: e.target.value })} maxLength={200} />
      </Field>
    </div>
  )
}

const parseAmount = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function QuickEntry({ defaultDate }: { defaultDate: string }) {
  const { create } = useData()
  const toast = useToast()
  const blank = (type: TxType = 'expense') => ({ type, amount: '', date: defaultDate, category: TX_CATEGORY_SUGGESTIONS[type][0], concept: '', account: 'checking' })
  const [v, setV] = useState(blank)
  const [lastDefault, setLastDefault] = useState(defaultDate)
  if (lastDefault !== defaultDate) {
    setLastDefault(defaultDate)
    setV((x) => ({ ...x, date: defaultDate }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amount = parseAmount(v.amount)
    if (amount === null || !v.date) return
    const ok = await create('transactions', {
      type: v.type,
      amount,
      date: v.date,
      category: v.category.trim().toLowerCase() || 'other',
      concept: v.concept.trim(),
      account: v.account.trim() || 'checking',
    })
    if (ok) {
      toast('success', `${TX_STYLES[v.type].label} of ${fmtMoney(amount)} saved`)
      setV(blank(v.type))
    }
  }

  return (
    <Card title="Quick entry">
      <form onSubmit={submit} className="space-y-4">
        <TxFields value={v} onChange={(p) => setV((x) => ({ ...x, ...p }))} />
        <Button type="submit" variant="primary" className="w-full" disabled={parseAmount(v.amount) === null}>
          <Plus className="size-4" /> Add {TX_STYLES[v.type].label.toLowerCase()}
        </Button>
      </form>
    </Card>
  )
}

function TxModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { update, remove } = useData()
  const toast = useToast()
  const [v, setV] = useState({ type: tx.type, amount: String(tx.amount), date: tx.date, category: tx.category, concept: tx.concept, account: tx.account })
  const amount = parseAmount(v.amount)

  async function save() {
    if (amount === null) return
    onClose()
    await update('transactions', tx.id, {
      type: v.type,
      amount,
      date: v.date,
      category: v.category.trim().toLowerCase() || 'other',
      concept: v.concept.trim(),
      account: v.account.trim() || 'checking',
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit transaction"
      footer={
        <>
          <Button
            variant="danger"
            className="mr-auto"
            onClick={async () => {
              onClose()
              await remove('transactions', tx.id)
              toast('success', 'Transaction deleted')
            }}
          >
            <Trash2 className="size-4" /> Delete
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={amount === null}>
            Save
          </Button>
        </>
      }
    >
      <TxFields value={v} onChange={(p) => setV((x) => ({ ...x, ...p }))} />
    </Modal>
  )
}

// ---------------------------------------------------------------- ledger table
function Ledger({ month, onEdit }: { month: Date; onEdit: (t: Transaction) => void }) {
  const { data, remove } = useData()
  const [scope, setScope] = useState<Scope>('month')
  const [type, setType] = useState<TxType | 'all'>('all')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })

  const base = useMemo(() => (scope === 'month' ? inMonth(data.transactions, monthKey(month)) : data.transactions), [data.transactions, scope, month])
  const allCategories = useMemo(() => [...new Set(base.map((t) => t.category))].sort(), [base])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return base
      .filter(
        (t) =>
          (type === 'all' || t.type === type) &&
          (category === 'all' || t.category === category) &&
          (!q || t.concept.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.account.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const d = sort.key === 'date' ? a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at) : a.amount - b.amount
        return d * sort.dir
      })
  }, [base, type, category, query, sort])

  const totals = useMemo(() => summarise(rows), [rows])

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }))

  const exportCsv = () => {
    const suffix = scope === 'month' ? monthKey(month) : 'all'
    downloadCsv(`transactions-${suffix}.csv`, toCsv(rows))
  }

  return (
    <section className="card mt-4 overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="mr-auto text-sm font-semibold">Ledger</h2>
        <Segmented value={scope} onChange={setScope} options={[{ value: 'month', label: fmtDate(month, { month: 'short', year: '2-digit' }) }, { value: 'all', label: 'All time' }]} />
        <Button size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="size-3.5" /> CSV
        </Button>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input className="field h-8 pl-8 text-xs" placeholder="Search concept, category, account…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="field h-8 w-auto text-xs" value={type} onChange={(e) => setType(e.target.value as TxType | 'all')} aria-label="Filter by type">
          <option value="all">All types</option>
          {TX_TYPES.map((t) => (
            <option key={t} value={t}>
              {TX_STYLES[t].label}
            </option>
          ))}
        </select>
        <select className="field h-8 w-auto text-xs" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="all">All categories</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {labelize(c)}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="p-4">
          <Empty>No transactions match.</Empty>
        </div>
      ) : (
        <>
          <div className="scrollbar-thin max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface text-left shadow-[0_1px_0_var(--line)]">
                <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:tracking-wider [&>th]:text-muted [&>th]:uppercase">
                  <th>
                    <button className="inline-flex items-center gap-1 uppercase hover:text-fg" onClick={() => toggleSort('date')}>
                      Date <ArrowDownUp className={cx('size-3', sort.key === 'date' ? 'text-accent' : 'opacity-40')} />
                    </button>
                  </th>
                  <th>Concept</th>
                  <th className="hidden sm:table-cell">Category</th>
                  <th className="hidden md:table-cell">Account</th>
                  <th className="text-right">
                    <button className="inline-flex items-center gap-1 uppercase hover:text-fg" onClick={() => toggleSort('amount')}>
                      Amount <ArrowDownUp className={cx('size-3', sort.key === 'amount' ? 'text-accent' : 'opacity-40')} />
                    </button>
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((t) => (
                  <tr key={t.id} className="group cursor-pointer hover:bg-surface-2" onClick={() => onEdit(t)}>
                    <td className="num px-4 py-2.5 text-xs whitespace-nowrap text-muted">{fmtDate(fromDateKey(t.date), { day: '2-digit', month: 'short', year: scope === 'all' ? '2-digit' : undefined })}</td>
                    <td className="max-w-0 px-4 py-2.5">
                      <div className="truncate">{t.concept || <span className="text-faint">—</span>}</div>
                      <div className="truncate text-[11px] text-muted sm:hidden">{labelize(t.category)}</div>
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{labelize(t.category)}</td>
                    <td className="hidden px-4 py-2.5 font-mono text-xs text-muted md:table-cell">{t.account}</td>
                    <td className={cx('num px-4 py-2.5 text-right font-medium whitespace-nowrap', TX_STYLES[t.type].text)}>
                      {TX_STYLES[t.type].sign} {fmtMoney(t.amount)}
                    </td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-60" onClick={() => remove('transactions', t.id)} aria-label="Delete">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line bg-surface-2 px-4 py-2.5 font-mono text-[11px] text-muted">
            <span>{rows.length} rows</span>
            <span className="flex flex-wrap gap-x-4">
              <span className={TX_STYLES.income.text}>+{fmtMoneyShort(totals.income)}</span>
              <span className={TX_STYLES.expense.text}>−{fmtMoneyShort(totals.expense)}</span>
              <span className={TX_STYLES.investment.text}>→{fmtMoneyShort(totals.investment)}</span>
              <span className="text-fg">= {fmtMoneyShort(totals.net)}</span>
            </span>
          </footer>
        </>
      )}
    </section>
  )
}
