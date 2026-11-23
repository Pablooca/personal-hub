import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ChevronLeft, ChevronRight, Landmark, PiggyBank, Plus, Scale, Settings2, Star, TrendingDown, TrendingUp } from 'lucide-react'
import { PageHeader } from '../../components/Shell'
import { Button, Card, Empty, Stat, cx } from '../../components/ui'
import { COLOR_BG, categoryColor, categoryLabel, defaultCategories } from '../../lib/categories'
import { addMonths, monthKey, startOfMonth, toDateKey } from '../../lib/dates'
import { accountBalances, byCategory, inMonth, summarise, yearToDate } from '../../lib/finance'
import { capitalize, fmtDate, fmtMoney, fmtMonth, fmtPct } from '../../lib/format'
import { ACCOUNT_KIND_LABELS, TX_STYLES } from '../../lib/theme'
import type { CategoryColor, Transaction } from '../../lib/types'
import { useData } from '../../state/data'
import { Ledger, needsReview } from './Ledger'
import { ManageModal, type ManageTab } from './Manage'
import { QuickEntry, TxModal } from './TxForms'

const FALLBACK: CategoryColor[] = ['rose', 'amber', 'sky', 'violet', 'emerald', 'teal', 'fuchsia', 'orange', 'slate']
const SEED_FLAG = 'ph-categories-seeded'

export function FinanceView() {
  const { data, source, createMany } = useData()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [manage, setManage] = useState<ManageTab | null>(null)
  const [reviewOnly, setReviewOnly] = useState(false)
  const ym = monthKey(month)
  const year = month.getFullYear()

  // First visit with a fresh database: create the suggested categories once.
  const seeding = useRef(false)
  useEffect(() => {
    if (source !== 'supabase' || data.categories.length > 0 || seeding.current) return
    try {
      if (localStorage.getItem(SEED_FLAG)) return
      localStorage.setItem(SEED_FLAG, '1')
    } catch {
      /* ignore */
    }
    seeding.current = true
    void createMany('categories', defaultCategories())
  }, [source, data.categories.length, createMany])

  const monthTxs = useMemo(() => inMonth(data.transactions, ym), [data.transactions, ym])
  const s = useMemo(() => summarise(monthTxs), [monthTxs])
  const prev = useMemo(() => summarise(inMonth(data.transactions, monthKey(addMonths(month, -1)))), [data.transactions, month])
  const ytd = useMemo(() => summarise(yearToDate(data.transactions, ym)), [data.transactions, ym])
  const categories = useMemo(() => byCategory(monthTxs, 'expense'), [monthTxs])
  const balances = useMemo(() => accountBalances(data.transactions, data.accounts, ym), [data.transactions, data.accounts, ym])
  const totalBalance = balances.reduce((a, b) => a + b.balance, 0)
  const reviewCount = useMemo(() => data.transactions.filter(needsReview).length, [data.transactions])

  const trend = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = new Date(year, i, 1)
        return { m, ...summarise(inMonth(data.transactions, monthKey(m))) }
      }),
    [data.transactions, year],
  )
  const trendMax = Math.max(1, ...trend.flatMap((t) => [t.income, t.expense + t.investment]))

  const delta = (cur: number, before: number) => {
    if (!before) return null
    const pct = ((cur - before) / before) * 100
    return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)} % vs mes anterior`
  }
  const isCurrentMonth = ym === monthKey(new Date())
  const ytdLabel = month.getMonth() === 11 ? `${year}` : `ene–${fmtDate(month, { month: 'short' })} ${year}`

  const openReview = () => {
    setReviewOnly(true)
    document.getElementById('ledger')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      <PageHeader
        eyebrow="Finanzas personales"
        title={capitalize(fmtMonth(month))}
        actions={
          <>
            <Button onClick={() => setManage('accounts')}>
              <Settings2 className="size-4" /> <span className="hidden sm:inline">Cuentas y categorías</span>
            </Button>
            <div className="flex items-center rounded-lg border border-line bg-surface">
              <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Mes anterior">
                <ChevronLeft className="size-4" />
              </Button>
              <button
                onClick={() => setMonth(startOfMonth(new Date()))}
                disabled={isCurrentMonth}
                className="h-8 px-2 text-xs font-medium text-muted hover:text-fg disabled:opacity-50"
              >
                Este mes
              </button>
              <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Mes siguiente">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </>
        }
      />

      {reviewCount > 0 && (
        <button
          onClick={openReview}
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-left text-sm text-amber-800 transition hover:bg-amber-500/15 dark:text-amber-200"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span className="flex-1">
            <strong>
              {reviewCount} {reviewCount === 1 ? 'movimiento' : 'movimientos'}
            </strong>{' '}
            sin categorizar (p. ej. desde Apple Pay)
          </span>
          <span className="text-xs font-semibold">Revisar →</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Ingresos" value={fmtMoney(s.income)} tone={TX_STYLES.income.text} hint={delta(s.income, prev.income)} icon={<TrendingUp className="size-4" />} />
        <Stat label="Gastos" value={fmtMoney(s.expense)} tone={TX_STYLES.expense.text} hint={delta(s.expense, prev.expense)} icon={<TrendingDown className="size-4" />} />
        <Stat
          label="Ahorrado"
          value={fmtMoney(s.investment)}
          tone={TX_STYLES.investment.text}
          hint={s.withdrawn > 0 ? `retirado del ahorro: ${fmtMoney(s.withdrawn)}` : delta(s.investment, prev.investment)}
          icon={<PiggyBank className="size-4" />}
        />
        <Stat
          label="Balance neto"
          value={fmtMoney(s.net)}
          tone={s.net >= 0 ? 'text-fg' : 'text-rose-600 dark:text-rose-400'}
          hint="ingresos − gastos (lo ahorrado sigue contando)"
          icon={<Scale className="size-4" />}
        />
        <div className="col-span-2 lg:col-span-1">
          <Stat
            label={`Tasa de ahorro · ${year}`}
            value={fmtPct(ytd.savingsRate)}
            tone={ytd.savingsRate >= 20 ? 'text-emerald-600 dark:text-emerald-400' : ytd.savingsRate >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}
            hint={`Acumulado ${ytdLabel} · este mes ${fmtPct(s.savingsRate)}`}
            icon={<PiggyBank className="size-4" />}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <QuickEntry defaultDate={isCurrentMonth ? toDateKey(new Date()) : `${ym}-01`} onManage={setManage} />

        {/* ---------------------------------------------------- accounts */}
        <Card
          title="Cuentas"
          action={
            <Button size="sm" variant="ghost" onClick={() => setManage('accounts')}>
              <Plus className="size-3.5" /> Cuenta
            </Button>
          }
        >
          {balances.length === 0 ? (
            <Empty icon={<Landmark className="size-5" />}>
              Añade tus cuentas (p. ej. la de gastos del día a día y la de ahorro) y marca una como principal.
              <Button size="sm" variant="primary" onClick={() => setManage('accounts')}>
                <Plus className="size-3.5" /> Añadir cuenta
              </Button>
            </Empty>
          ) : (
            <>
              <ul className="space-y-1">
                {balances.map((b) => (
                  <li key={b.name} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                    <span className={cx('size-2.5 shrink-0 rounded-sm', b.account ? COLOR_BG[b.account.color] : 'bg-line-strong')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-sm">
                        {b.name}
                        {b.account?.is_primary && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-label="Cuenta principal" />}
                      </div>
                      <div className="text-[11px] text-faint">{b.account ? ACCOUNT_KIND_LABELS[b.account.kind] : 'No registrada'}</div>
                    </div>
                    <span className={cx('num text-sm font-medium', b.balance < 0 && 'text-rose-600 dark:text-rose-400')}>{fmtMoney(b.balance)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-baseline justify-between border-t border-line px-2 pt-3 text-xs text-muted">
                <span>Patrimonio a fin de {fmtDate(month, { month: 'long' })}</span>
                <span className="num text-base font-semibold text-fg">{fmtMoney(totalBalance)}</span>
              </div>
            </>
          )}
        </Card>

        {/* ---------------------------------------------------- categories */}
        <Card title="Gastos por categoría" action={<span className="num text-xs text-muted">{fmtMoney(s.expense)}</span>}>
          {categories.length === 0 ? (
            <Empty>Sin gastos este mes.</Empty>
          ) : (
            <>
              <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-line">
                {categories.map((c, i) => (
                  <div
                    key={c.category}
                    className={COLOR_BG[categoryColor(data, 'expense', c.category) ?? FALLBACK[i % FALLBACK.length]]}
                    style={{ width: `${(c.total / s.expense) * 100}%` }}
                    title={categoryLabel(c.category)}
                  />
                ))}
              </div>
              <ul className="space-y-2.5">
                {categories.map((c, i) => (
                  <li key={c.category} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cx('size-2 shrink-0 rounded-sm', COLOR_BG[categoryColor(data, 'expense', c.category) ?? FALLBACK[i % FALLBACK.length]])} />
                      <span className="truncate">{categoryLabel(c.category)}</span>
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="num text-[11px] text-faint">{((c.total / s.expense) * 100).toFixed(0)} %</span>
                      <span className="num font-medium">{fmtMoney(c.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------- year trend */}
      <Card className="mt-4" title={`Evolución ${year}`} action={<Legend />}>
        <div className="grid gap-6 md:grid-cols-[1fr_220px]">
          <div className="flex h-44 items-end gap-1.5 sm:gap-3">
            {trend.map((t) => {
              const sel = monthKey(t.m) === ym
              return (
                <button key={t.m.toISOString()} onClick={() => setMonth(t.m)} className="flex h-full flex-1 flex-col items-center gap-1.5" title={capitalize(fmtMonth(t.m))}>
                  <div className={cx('flex w-full flex-1 items-end justify-center gap-0.5 rounded-md sm:gap-1', sel && 'bg-surface-2 ring-1 ring-line')}>
                    <div className="w-1/3 max-w-3 rounded-t bg-emerald-500/80" style={{ height: `${(t.income / trendMax) * 100}%` }} />
                    <div className="flex w-1/3 max-w-3 flex-col justify-end" style={{ height: `${((t.expense + t.investment) / trendMax) * 100}%` }}>
                      <div className="rounded-t bg-sky-500/80" style={{ height: `${t.expense + t.investment ? (t.investment / (t.expense + t.investment)) * 100 : 0}%` }} />
                      <div className="flex-1 bg-rose-500/80" />
                    </div>
                  </div>
                  <span className={cx('font-mono text-[10px] uppercase', sel ? 'font-semibold text-fg' : 'text-faint')}>{fmtDate(t.m, { month: 'narrow' })}</span>
                </button>
              )
            })}
          </div>
          <dl className="space-y-2.5 text-sm md:border-l md:border-line md:pl-6">
            <div className="eyebrow">Acumulado {ytdLabel}</div>
            <Row label="Ingresos" value={fmtMoney(ytd.income)} tone={TX_STYLES.income.text} />
            <Row label="Gastos" value={fmtMoney(ytd.expense)} tone={TX_STYLES.expense.text} />
            <Row label="Ahorrado" value={fmtMoney(ytd.investment)} tone={TX_STYLES.investment.text} />
            {ytd.withdrawn > 0 && <Row label="Retirado del ahorro" value={fmtMoney(ytd.withdrawn)} />}
            <div className="border-t border-line pt-2.5">
              <Row label="Tasa de ahorro" value={fmtPct(ytd.savingsRate)} />
            </div>
          </dl>
        </div>
      </Card>

      <Ledger month={month} onEdit={setEditing} reviewOnly={reviewOnly} setReviewOnly={setReviewOnly} />
      {editing && <TxModal key={editing.id} tx={editing} onClose={() => setEditing(null)} onManage={setManage} />}
      <ManageModal tab={manage} onTab={setManage} onClose={() => setManage(null)} />
    </>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={cx('num font-medium', tone)}>{value}</dd>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex gap-2.5 text-[10px] text-muted">
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-sm bg-emerald-500" />
        Ingresos
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-sm bg-rose-500" />
        Gastos
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-sm bg-sky-500" />
        Ahorro
      </span>
    </div>
  )
}
