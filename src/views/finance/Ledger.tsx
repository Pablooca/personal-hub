import { useMemo, useState } from 'react'
import { AlertCircle, ArrowDownUp, Download, Search, Trash2 } from 'lucide-react'
import { Button, Empty, Segmented, cx } from '../../components/ui'
import { UNCATEGORIZED, categoryLabel, categoryNames } from '../../lib/categories'
import { fromDateKey, monthKey } from '../../lib/dates'
import { downloadCsv, inMonth, summarise, toCsv } from '../../lib/finance'
import { fmtDate, fmtMoney, fmtMoneyShort } from '../../lib/format'
import { TX_STYLES } from '../../lib/theme'
import { TX_TYPES, type Transaction, type TxType } from '../../lib/types'
import { useData } from '../../state/data'

type Scope = 'month' | 'all'
type SortKey = 'date' | 'amount'

export const needsReview = (t: Transaction) => t.category === UNCATEGORIZED

export function Ledger({
  month,
  onEdit,
  reviewOnly,
  setReviewOnly,
}: {
  month: Date
  onEdit: (t: Transaction) => void
  reviewOnly: boolean
  setReviewOnly: (v: boolean) => void
}) {
  const { data, remove, update } = useData()
  const [scope, setScope] = useState<Scope>('month')
  const [type, setType] = useState<TxType | 'all'>('all')
  const [category, setCategory] = useState('all')
  const [account, setAccount] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })

  // "Por revisar" always looks at every month: nothing should hide there.
  const base = useMemo(
    () => (reviewOnly ? data.transactions.filter(needsReview) : scope === 'month' ? inMonth(data.transactions, monthKey(month)) : data.transactions),
    [data.transactions, scope, month, reviewOnly],
  )
  const allCategories = useMemo(() => [...new Set(base.map((t) => t.category))].sort(), [base])
  const allAccounts = useMemo(() => [...new Set([...data.accounts.map((a) => a.name), ...base.map((t) => t.account)])], [base, data.accounts])
  const reviewCount = useMemo(() => data.transactions.filter(needsReview).length, [data.transactions])
  const expenseCategories = categoryNames(data, 'expense')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return base
      .filter(
        (t) =>
          (type === 'all' || t.type === type) &&
          (category === 'all' || t.category === category) &&
          (account === 'all' || t.account === account) &&
          (!q || t.concept.toLowerCase().includes(q) || categoryLabel(t.category).toLowerCase().includes(q) || t.account.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const d = sort.key === 'date' ? a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at) : a.amount - b.amount
        return d * sort.dir
      })
  }, [base, type, category, account, query, sort])

  const totals = useMemo(() => summarise(rows), [rows])
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }))

  const exportCsv = () => {
    const suffix = reviewOnly ? 'por-revisar' : scope === 'month' ? monthKey(month) : 'todo'
    downloadCsv(`movimientos-${suffix}.csv`, toCsv(rows))
  }

  return (
    <section id="ledger" className="card mt-4 scroll-mt-6 overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="mr-auto text-sm font-semibold">Movimientos</h2>
        <button
          onClick={() => setReviewOnly(!reviewOnly)}
          className={cx(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition',
            reviewOnly
              ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
              : reviewCount
                ? 'border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300'
                : 'border-line text-muted',
          )}
          aria-pressed={reviewOnly}
        >
          <AlertCircle className="size-3.5" />
          Por revisar
          <span className="num">{reviewCount}</span>
        </button>
        {!reviewOnly && (
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'month', label: fmtDate(month, { month: 'short', year: '2-digit' }) },
              { value: 'all', label: 'Todo' },
            ]}
          />
        )}
        <Button size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="size-3.5" /> CSV
        </Button>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input className="field h-8 pl-8 text-xs" placeholder="Buscar concepto, categoría, cuenta…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="field h-8 w-auto text-xs" value={type} onChange={(e) => setType(e.target.value as TxType | 'all')} aria-label="Filtrar por tipo">
          <option value="all">Todos los tipos</option>
          {TX_TYPES.map((t) => (
            <option key={t} value={t}>
              {TX_STYLES[t].label}
            </option>
          ))}
        </select>
        <select className="field h-8 w-auto text-xs" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filtrar por categoría">
          <option value="all">Todas las categorías</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <select className="field h-8 w-auto text-xs" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Filtrar por cuenta">
          <option value="all">Todas las cuentas</option>
          {allAccounts.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="p-4">
          <Empty>{reviewOnly ? '🎉 Nada pendiente de revisar.' : 'No hay movimientos con estos filtros.'}</Empty>
        </div>
      ) : (
        <>
          <div className="scrollbar-thin max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface text-left shadow-[0_1px_0_var(--line)]">
                <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:tracking-wider [&>th]:text-muted [&>th]:uppercase">
                  <th>
                    <button className="inline-flex items-center gap-1 uppercase hover:text-fg" onClick={() => toggleSort('date')}>
                      Fecha <ArrowDownUp className={cx('size-3', sort.key === 'date' ? 'text-accent' : 'opacity-40')} />
                    </button>
                  </th>
                  <th>Concepto</th>
                  <th className="hidden sm:table-cell">Categoría</th>
                  <th className="hidden md:table-cell">Cuenta</th>
                  <th className="text-right">
                    <button className="inline-flex items-center gap-1 uppercase hover:text-fg" onClick={() => toggleSort('amount')}>
                      Importe <ArrowDownUp className={cx('size-3', sort.key === 'amount' ? 'text-accent' : 'opacity-40')} />
                    </button>
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((t) => {
                  const review = needsReview(t)
                  const quickCategory = review && (
                    <select
                      className="h-7 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 text-xs font-medium text-amber-700 outline-none focus:ring-2 focus:ring-[var(--ring)] dark:text-amber-300"
                      value=""
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => e.target.value && update('transactions', t.id, { category: e.target.value })}
                      aria-label={`Categorizar ${t.concept}`}
                    >
                      <option value="">⚠ Por revisar · elegir…</option>
                      {(t.type === 'expense' ? expenseCategories : categoryNames(data, t.type)).map((c) => (
                        <option key={c} value={c}>
                          {categoryLabel(c)}
                        </option>
                      ))}
                    </select>
                  )
                  return (
                    <tr key={t.id} className={cx('group cursor-pointer hover:bg-surface-2', review && 'bg-amber-500/[0.04]')} onClick={() => onEdit(t)} title="Editar">
                      <td className="num px-4 py-2.5 text-xs whitespace-nowrap text-muted">
                        {fmtDate(fromDateKey(t.date), { day: '2-digit', month: 'short', year: scope === 'all' || reviewOnly ? '2-digit' : undefined })}
                      </td>
                      <td className="max-w-0 px-4 py-2.5">
                        <div className="truncate">{t.concept || <span className="text-faint">—</span>}</div>
                        <div className="mt-0.5 truncate text-[11px] text-muted sm:hidden">{review ? quickCategory : categoryLabel(t.category)}</div>
                      </td>
                      <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{review ? quickCategory : categoryLabel(t.category)}</td>
                      <td className="hidden px-4 py-2.5 text-xs text-muted md:table-cell">{t.account}</td>
                      <td className={cx('num px-4 py-2.5 text-right font-medium whitespace-nowrap', TX_STYLES[t.type].text)}>
                        {TX_STYLES[t.type].sign} {fmtMoney(t.amount)}
                      </td>
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-60"
                          onClick={() => remove('transactions', t.id)}
                          aria-label="Eliminar"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line bg-surface-2 px-4 py-2.5 font-mono text-[11px] text-muted">
            <span>{rows.length} movimientos</span>
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
