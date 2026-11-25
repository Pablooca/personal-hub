import { useMemo, useState } from 'react'
import { CalendarClock, Plus, Repeat, Sparkles, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge, Button, Card, Empty, Field, Modal, cx } from '../../components/ui'
import { PERIOD_LABELS, BILL_PERIODS, budgetLines, chargeDates, compareCategories, detectRecurring, monthlyCost, type Detected } from '../../lib/budget'
import { categoryLabel, categoryNames } from '../../lib/categories'
import { fromDateKey, toDateKey } from '../../lib/dates'
import { fmtDate, fmtMoney } from '../../lib/format'
import type { Bill, Transaction } from '../../lib/types'
import { useData } from '../../state/data'
import { parseAmount, usePrimaryAccountName } from './TxForms'

// ------------------------------------------------------------------- budgets
export function BudgetCard({ ym, monthTxs, onManage }: { ym: string; monthTxs: Transaction[]; onManage: () => void }) {
  const { data } = useData()
  const lines = useMemo(() => budgetLines(data.categories, monthTxs, ym, toDateKey(new Date())), [data.categories, monthTxs, ym])
  const limit = lines.reduce((a, l) => a + l.limit, 0)
  const spent = lines.reduce((a, l) => a + l.spent, 0)
  return (
    <Card
      title="Presupuestos"
      action={
        <Button size="sm" variant="ghost" onClick={onManage}>
          {lines.length ? 'Editar' : <><Plus className="size-3.5" /> Definir</>}
        </Button>
      }
    >
      {!lines.length ? (
        <Empty>Pon un límite mensual a las categorías que quieras controlar. Te avisará al 80 % y al 100 %.</Empty>
      ) : (
        <>
          <div className="mb-3 flex items-baseline justify-between text-sm">
            <span className="text-muted">Total</span>
            <span className="num">
              <span className="font-semibold">{fmtMoney(spent)}</span> <span className="text-muted">de {fmtMoney(limit)}</span>
            </span>
          </div>
          <ul className="space-y-3">
            {lines.map((l) => (
              <li key={l.category.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{categoryLabel(l.category.name)}</span>
                  <span className="num shrink-0 text-xs">
                    <span className="text-sm font-medium">{fmtMoney(l.spent)}</span> <span className="text-muted">/ {fmtMoney(l.limit)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-line" role="progressbar" aria-label={categoryLabel(l.category.name)} aria-valuenow={Math.round(l.pct)} aria-valuemin={0} aria-valuemax={100}>
                  <div className={cx('h-full rounded-full', l.state === 'over' ? 'bg-rose-500' : l.state === 'warn' ? 'bg-amber-500' : 'bg-sky-500')} style={{ width: `${Math.min(100, l.pct)}%` }} />
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {l.state === 'over' ? `Superado en ${fmtMoney(l.spent - l.limit)}` : l.projected > l.limit * 1.02 ? `A este ritmo acabarás en ${fmtMoney(l.projected)}` : `Quedan ${fmtMoney(l.limit - l.spent)}`}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

// ----------------------------------------------------------------- recurring
export function BillsCard() {
  const { data, create } = useData()
  const [editing, setEditing] = useState<Partial<Bill> | null>(null)
  const [showAll, setShowAll] = useState(false)
  const today = toDateKey(new Date())
  const horizon = toDateKey(new Date(Date.now() + 400 * 86_400_000))
  const list = useMemo(
    () => data.bills.map((b) => ({ b, next: b.active ? (chargeDates(b, today, horizon)[0] ?? null) : null })).sort((x, y) => (x.next ?? '9').localeCompare(y.next ?? '9')),
    [data.bills, today, horizon],
  )
  const found = useMemo(() => detectRecurring(data.transactions, data.bills, today), [data.transactions, data.bills, today])
  const monthly = data.bills.filter((b) => b.active).reduce((a, b) => a + monthlyCost(b), 0)

  const add = (d: Detected) => void create('bills', { name: d.name.slice(0, 200), amount: d.amount, category: d.category, account: d.account, period: d.period, anchor_date: d.last, notify_days: 1, active: true })

  return (
    <Card
      title="Suscripciones y cobros"
      action={
        <Button size="sm" variant="ghost" onClick={() => setEditing({})}>
          <Plus className="size-3.5" /> Cobro
        </Button>
      }
    >
      {list.length > 0 && (
        <div className="mb-3 flex items-baseline justify-between text-sm">
          <span className="text-muted">Al mes</span>
          <span className="num text-lg font-semibold">{fmtMoney(monthly)}</span>
        </div>
      )}
      {!list.length && !found.length && <Empty icon={<Repeat className="size-5" />}>Aún no hay cobros recurrentes.</Empty>}
      <ul className="space-y-0.5">
        {list.map(({ b, next }) => (
          <li key={b.id}>
            <button type="button" onClick={() => setEditing(b)} className={cx('-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-2', !b.active && 'opacity-50')}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{b.name}</span>
                <span className="block text-[11px] text-muted">
                  {b.active ? (next ? `Próximo: ${fmtDate(fromDateKey(next), { day: 'numeric', month: 'short' })}` : '—') : 'Pausado'} · {PERIOD_LABELS[b.period].toLowerCase()}
                </span>
              </span>
              <span className="num text-sm font-medium">{fmtMoney(b.amount)}</span>
            </button>
          </li>
        ))}
      </ul>
      {found.length > 0 && (
        <div className={cx(list.length > 0 && 'mt-3 border-t border-line pt-3')}>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Sparkles className="size-3.5" /> Detectados en tus movimientos
          </div>
          <ul className="space-y-1">
            {found.slice(0, showAll ? 50 : 4).map((d) => (
              <li key={d.key} className="flex min-h-10 items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{d.name}</span>
                  <span className="block text-[11px] text-muted">
                    {PERIOD_LABELS[d.period]} · {d.times} veces
                  </span>
                </span>
                <span className="num">{fmtMoney(d.amount)}</span>
                <Button size="sm" onClick={() => add(d)} aria-label={`Añadir ${d.name}`}>
                  <Plus className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          {found.length > 4 && (
            <button type="button" className="mt-1 min-h-8 text-xs font-medium text-accent hover:underline" onClick={() => setShowAll((x) => !x)}>
              {showAll ? 'Ver menos' : `Ver los ${found.length}`}
            </button>
          )}
        </div>
      )}
      {editing && <BillModal bill={editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

export function BillModal({ bill, onClose }: { bill: Partial<Bill>; onClose: () => void }) {
  const { data, create, update, remove } = useData()
  const primary = usePrimaryAccountName()
  const [name, setName] = useState(bill.name ?? '')
  const [amount, setAmount] = useState(bill.amount ? String(bill.amount).replace('.', ',') : '')
  const [category, setCategory] = useState(bill.category ?? 'subscriptions')
  const [account, setAccount] = useState(bill.account ?? primary)
  const [period, setPeriod] = useState<Bill['period']>(bill.period ?? 'monthly')
  const [anchor, setAnchor] = useState(bill.anchor_date ?? toDateKey(new Date()))
  const [notify, setNotify] = useState(String(bill.notify_days ?? 1))
  const [active, setActive] = useState(bill.active ?? true)
  const value = parseAmount(amount)
  const names = categoryNames(data, 'expense')

  async function save() {
    if (!name.trim() || value === null || !anchor) return
    const row = { name: name.trim(), amount: value, category, account, period, anchor_date: anchor, notify_days: Number(notify), active }
    onClose()
    if (bill.id) await update('bills', bill.id, row)
    else await create('bills', row)
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={bill.id ? 'Editar cobro' : 'Nuevo cobro'}
      footer={
        <>
          {bill.id && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                onClose()
                void remove('bills', bill.id!)
              }}
            >
              <Trash2 className="size-4" /> Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!name.trim() || value === null} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nombre">
          <input className="field" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="Spotify, gimnasio…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Importe (€)">
            <input className="field num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Frecuencia">
            <select className="field" value={period} onChange={(e) => setPeriod(e.target.value as Bill['period'])}>
              {BILL_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha de un cobro">
            <input type="date" className="field num" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
          </Field>
          <Field label="Avisar">
            <select className="field" value={notify} onChange={(e) => setNotify(e.target.value)}>
              <option value="0">No avisar</option>
              <option value="1">El día antes</option>
              <option value="2">2 días antes</option>
              <option value="3">3 días antes</option>
              <option value="7">Una semana antes</option>
            </select>
          </Field>
          <Field label="Categoría">
            <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
              {[...new Set([category, ...names])].map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cuenta">
            <select className="field" value={account} onChange={(e) => setAccount(e.target.value)}>
              {[...new Set([account, ...data.accounts.map((a) => a.name)])].filter(Boolean).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activo
        </label>
        <p className="text-xs text-muted">No crea movimientos: solo lo muestra en la agenda y te avisa por Telegram. El gasto se registra cuando se cobra.</p>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- comparison
export function ComparisonCard({ ym }: { ym: string }) {
  const { data } = useData()
  const rows = useMemo(() => compareCategories(data.transactions, ym), [data.transactions, ym])
  const max = Math.max(1, ...rows.map((r) => Math.max(r.current, r.average)))
  const partial = ym === toDateKey(new Date()).slice(0, 7)
  return (
    <Card title="Este mes frente a tu media" action={<Badge className="border-line-strong text-muted">6 meses</Badge>}>
      {!rows.length ? (
        <Empty icon={<CalendarClock className="size-5" />}>Aún no hay gastos que comparar.</Empty>
      ) : (
        <>
          <ul className="space-y-2.5">
            {rows.slice(0, 9).map((r) => (
              <li key={r.category} title={`Media: ${fmtMoney(r.average)}`}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{categoryLabel(r.category)}</span>
                  <span className="num flex shrink-0 items-center gap-2 text-xs">
                    <span className="text-sm font-medium">{fmtMoney(r.current)}</span>
                    {r.average > 0 && Math.abs(r.diff) >= 1 && (
                      <span className={cx('inline-flex items-center gap-0.5', r.diff > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400')}>
                        {r.diff > 0 ? <TrendingUp className="size-3" aria-label="más" /> : <TrendingDown className="size-3" aria-label="menos" />}
                        {fmtMoney(Math.abs(r.diff))}
                      </span>
                    )}
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 rounded-full bg-line" aria-hidden>
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${(r.current / max) * 100}%` }} />
                  {r.average > 0 && <span className="absolute -inset-y-0.5 w-0.5 rounded bg-fg" style={{ left: `calc(${(r.average / max) * 100}% - 1px)` }} />}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            La marca vertical es tu media mensual.{partial && ' El mes aún no ha terminado.'}
          </p>
        </>
      )}
    </Card>
  )
}
