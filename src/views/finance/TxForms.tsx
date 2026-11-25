import { useState, type FormEvent } from 'react'
import { Plus, Settings2, Trash2 } from 'lucide-react'
import { Button, Card, Field, Modal, Segmented } from '../../components/ui'
import { UNCATEGORIZED, categoryLabel, categoryNames, normaliseCategory } from '../../lib/categories'
import { fmtMoney } from '../../lib/format'
import { TX_STYLES } from '../../lib/theme'
import { TX_TYPES, type Transaction, type TxType } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'

export interface TxDraft {
  type: TxType
  amount: string
  date: string
  category: string
  concept: string
  account: string
}

/** Accepts "14,50", "1.234,56", "1,234.56", "14.50 €". Returns null if not a positive number. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  const n = Math.abs(Number(s))
  return Number.isFinite(n) && n > 0 && n < 100_000_000 ? Math.round(n * 100) / 100 : null
}

export function usePrimaryAccountName(): string {
  const { data } = useData()
  return data.accounts.find((a) => a.is_primary)?.name ?? data.accounts[0]?.name ?? 'Cuenta principal'
}

const MANAGE = '__manage__'

export function TxFields({ value, onChange, onManage }: { value: TxDraft; onChange: (patch: Partial<TxDraft>) => void; onManage: (tab: 'accounts' | 'categories') => void }) {
  const { data } = useData()
  const names = categoryNames(data, value.type)
  const options = names.includes(value.category) || !value.category ? names : [value.category, ...names]
  const accounts = data.accounts.map((a) => a.name)
  const accountOptions = accounts.includes(value.account) || !value.account ? accounts : [value.account, ...accounts]

  return (
    <div className="space-y-3">
      <Segmented
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
        value={value.type}
        onChange={(type) => onChange({ type, category: categoryNames(data, type)[0] ?? '' })}
        options={TX_TYPES.map((t) => ({ value: t, label: TX_STYLES[t].label }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe (€)">
          <input className="field num" inputMode="decimal" placeholder="0,00" value={value.amount} onChange={(e) => onChange({ amount: e.target.value })} required />
        </Field>
        <Field label="Fecha">
          <input type="date" className="field num" value={value.date} onChange={(e) => onChange({ date: e.target.value })} required />
        </Field>
        <Field label="Categoría">
          <select
            className="field"
            value={value.category}
            onChange={(e) => (e.target.value === MANAGE ? onManage('categories') : onChange({ category: e.target.value }))}
          >
            {options.map((c) => (
              <option key={c} value={c}>
                {c === UNCATEGORIZED ? '⚠ Sin categorizar' : categoryLabel(c)}
              </option>
            ))}
            <option value={MANAGE}>＋ Gestionar categorías…</option>
          </select>
        </Field>
        <Field label={value.type === 'investment' ? 'Ahorrar en' : 'Cuenta'}>
          {accountOptions.length ? (
            <select className="field" value={value.account} onChange={(e) => (e.target.value === MANAGE ? onManage('accounts') : onChange({ account: e.target.value }))}>
              {accountOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              <option value={MANAGE}>＋ Gestionar cuentas…</option>
            </select>
          ) : (
            <input className="field" placeholder="Nombre de la cuenta" value={value.account} onChange={(e) => onChange({ account: e.target.value })} />
          )}
        </Field>
      </div>
      <Field label="Concepto">
        <input className="field" placeholder="Descripción" value={value.concept} onChange={(e) => onChange({ concept: e.target.value })} maxLength={200} />
      </Field>
    </div>
  )
}

const toRow = (v: TxDraft, amount: number) => ({
  type: v.type,
  amount,
  date: v.date,
  category: normaliseCategory(v.category) || 'other',
  concept: v.concept.trim(),
  account: v.account.trim() || 'Cuenta principal',
})

export function QuickEntry({ defaultDate, onManage, bare, onDone }: { defaultDate: string; onManage: (tab: 'accounts' | 'categories') => void; bare?: boolean; onDone?: () => void }) {
  const { data, create } = useData()
  const toast = useToast()
  const primary = usePrimaryAccountName()
  const blank = (type: TxType = 'expense'): TxDraft => ({
    type,
    amount: '',
    date: defaultDate,
    category: categoryNames(data, type)[0] ?? '',
    concept: '',
    account: type === 'investment' ? (data.accounts.find((a) => a.kind === 'savings')?.name ?? primary) : primary,
  })
  const [v, setV] = useState(blank)
  const [lastDefault, setLastDefault] = useState(defaultDate)
  if (lastDefault !== defaultDate) {
    setLastDefault(defaultDate)
    setV((x) => ({ ...x, date: defaultDate }))
  }
  // Follow the primary account (or new accounts/categories) until the user picks one by hand.
  const [accountTouched, setAccountTouched] = useState(false)
  const autoAccount = blank(v.type).account
  if (!accountTouched && v.account !== autoAccount) setV((x) => ({ ...x, account: autoAccount }))
  if (!v.category && categoryNames(data, v.type)[0]) setV((x) => ({ ...x, category: categoryNames(data, x.type)[0] }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amount = parseAmount(v.amount)
    if (amount === null || !v.date) return
    if (await create('transactions', toRow(v, amount))) {
      toast('success', `${TX_STYLES[v.type].label}: ${fmtMoney(amount)}`)
      setV(blank(v.type))
      onDone?.()
    }
  }

  const form = (
      <form onSubmit={submit} className="space-y-4">
        <TxFields
          value={v}
          onManage={onManage}
          onChange={(p) =>
            setV((x) => {
              if (p.account !== undefined) setAccountTouched(true)
              if (p.type && p.type !== x.type) setAccountTouched(false)
              const next = { ...x, ...p }
              // Switching to "Saved" pre-selects a savings account; switching back restores the primary.
              if (p.type && p.type !== x.type) next.account = blank(p.type).account
              return next
            })
          }
        />
        <Button type="submit" variant="primary" className="w-full" disabled={parseAmount(v.amount) === null}>
          <Plus className="size-4" /> Añadir {TX_STYLES[v.type].label.toLowerCase()}
        </Button>
        {v.type === 'investment' && <p className="text-center font-mono text-[10px] text-faint">Mueve dinero de tu cuenta principal a «{v.account}».</p>}
      </form>
  )
  if (bare) return form
  return (
    <Card
      title="Registro rápido"
      action={
        <Button size="sm" variant="ghost" onClick={() => onManage('accounts')}>
          <Settings2 className="size-3.5" /> Gestionar
        </Button>
      }
    >
      {form}
    </Card>
  )
}

export function TxModal({ tx, onClose, onManage }: { tx: Transaction; onClose: () => void; onManage: (tab: 'accounts' | 'categories') => void }) {
  const { update, remove } = useData()
  const [v, setV] = useState<TxDraft>({ type: tx.type, amount: String(tx.amount), date: tx.date, category: tx.category, concept: tx.concept, account: tx.account })
  const amount = parseAmount(v.amount)

  async function save() {
    if (amount === null) return
    onClose()
    await update('transactions', tx.id, toRow(v, amount))
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar movimiento"
      footer={
        <>
          <Button
            variant="danger"
            className="mr-auto"
            onClick={async () => {
              onClose()
              await remove('transactions', tx.id)
            }}
          >
            <Trash2 className="size-4" /> Eliminar
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={amount === null}>
            Guardar
          </Button>
        </>
      }
    >
      <TxFields value={v} onChange={(p) => setV((x) => ({ ...x, ...p }))} onManage={onManage} />
    </Modal>
  )
}
