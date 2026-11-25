import { useState, type FormEvent } from 'react'
import { Plus, Star, Trash2 } from 'lucide-react'
import { Button, Empty, Field, Modal, Segmented, cx } from '../../components/ui'
import { foldText, matchRule } from '../../lib/budget'
import { COLOR_BG, UNCATEGORIZED, categoryLabel, categoryNames, defaultCategories, normaliseCategory } from '../../lib/categories'
import { ACCOUNT_KIND_LABELS, TX_STYLES } from '../../lib/theme'
import { ACCOUNT_KINDS, CATEGORY_COLORS, TX_TYPES, type AccountKind, type Category, type CategoryColor, type CategoryRule, type TxType } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'
import { parseAmount } from './TxForms'

export type ManageTab = 'accounts' | 'categories' | 'rules'

export function ManageModal({ tab, onTab, onClose }: { tab: ManageTab | null; onTab: (t: ManageTab) => void; onClose: () => void }) {
  return (
    <Modal open={tab !== null} onClose={onClose} title="Cuentas, categorías y reglas" wide>
      <Segmented
        className="mb-4"
        value={tab ?? 'accounts'}
        onChange={onTab}
        options={[
          { value: 'accounts', label: 'Cuentas' },
          { value: 'categories', label: 'Categorías' },
          { value: 'rules', label: 'Reglas' },
        ]}
      />
      {tab === 'accounts' ? <AccountsManager /> : tab === 'rules' ? <RulesManager /> : <CategoriesManager />}
    </Modal>
  )
}

function ColorPicker({ value, onChange }: { value: CategoryColor; onChange: (c: CategoryColor) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cx('size-6 rounded-md transition', COLOR_BG[c], value === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'opacity-70 hover:opacity-100')}
          aria-label={c}
          aria-pressed={value === c}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- accounts
function AccountsManager() {
  const { data, create, update, remove, setPrimaryAccount } = useData()
  const toast = useToast()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('checking')
  const [color, setColor] = useState<CategoryColor>('sky')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const usage = (n: string) => data.transactions.filter((t) => t.account === n).length
  const taken = data.accounts.some((a) => a.name.toLowerCase() === name.trim().toLowerCase())

  async function add(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n || taken) return
    const ok = await create('accounts', { name: n, kind, color, is_primary: data.accounts.length === 0 })
    if (ok) {
      toast('success', `Cuenta «${n}» añadida`)
      setName('')
    }
  }

  return (
    <div className="space-y-5">
      {data.accounts.length === 0 ? (
        <Empty>Añade tu primera cuenta. La primera que crees será la principal.</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {data.accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className={cx('size-3 rounded', COLOR_BG[a.color])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {a.name}
                  {a.is_primary && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                      <Star className="size-2.5 fill-current" /> Principal
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-faint">{usage(a.name)} movimientos</div>
              </div>
              <select className="field h-8 w-auto text-xs" value={a.kind} onChange={(e) => update('accounts', a.id, { kind: e.target.value as AccountKind })} aria-label="Tipo de cuenta">
                {ACCOUNT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ACCOUNT_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              {!a.is_primary && (
                <Button size="sm" variant="ghost" onClick={() => setPrimaryAccount(a.id)} title="Marcar como principal">
                  <Star className="size-3.5" /> <span className="max-sm:sr-only">Hacer principal</span>
                </Button>
              )}
              {confirmId === a.id ? (
                <span className="flex items-center gap-1 text-xs">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      setConfirmId(null)
                      await remove('accounts', a.id)
                    }}
                  >
                    Eliminar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <Button size="icon" variant="ghost" onClick={() => setConfirmId(a.id)} aria-label={`Eliminar ${a.name}`} disabled={a.is_primary} title={a.is_primary ? 'Elige antes otra cuenta principal' : 'Eliminar'}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirmId && usage(data.accounts.find((a) => a.id === confirmId)?.name ?? '') > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">Los movimientos existentes conservan el nombre de la cuenta y aparecerán como cuenta no registrada.</p>
      )}

      <form onSubmit={add} className="space-y-3 rounded-lg border border-dashed border-line p-3">
        <div className="eyebrow">Nueva cuenta</div>
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <Field label="Nombre">
            <input className={cx('field', taken && 'border-rose-500')} placeholder="p. ej. Cuenta nómina, Ahorro, Visa" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Tipo">
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {ACCOUNT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ACCOUNT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ColorPicker value={color} onChange={setColor} />
        {taken && <p className="text-xs text-rose-500">Ya existe una cuenta con ese nombre.</p>}
        <Button type="submit" variant="primary" disabled={!name.trim() || taken}>
          <Plus className="size-4" /> Añadir cuenta
        </Button>
      </form>
      <p className="text-xs text-muted">
        La cuenta <strong>principal</strong> es la que se usa por defecto en los movimientos nuevos y en los pagos de Apple Pay, y de ella sale el dinero que marcas como <em>Ahorro</em>.
      </p>
    </div>
  )
}

function BudgetInput({ category }: { category: Category }) {
  const { update } = useData()
  const [v, setV] = useState(category.budget ? String(category.budget).replace('.', ',') : '')
  const value = v.trim() ? parseAmount(v) : null
  const bad = v.trim() !== '' && value === null
  return (
    <span className="relative shrink-0">
      <input
        className={cx('field num h-8 w-24 pr-6 text-right text-xs', bad && 'border-rose-500')}
        inputMode="decimal"
        aria-label={`Presupuesto mensual de ${categoryLabel(category.name)}`}
        placeholder="Límite"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => !bad && value !== category.budget && void update('categories', category.id, { budget: value })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 grid place-items-center text-xs text-faint">€</span>
    </span>
  )
}

// --------------------------------------------------------------------- rules
function RulesManager() {
  const { data, create, update, remove } = useData()
  const toast = useToast()
  const [type, setType] = useState<TxType>('expense')
  const [pattern, setPattern] = useState('')
  const [category, setCategory] = useState('')
  const names = categoryNames(data, type)
  const list = data.category_rules.filter((r) => r.type === type).sort((a, b) => a.pattern.localeCompare(b.pattern))
  const p = pattern.trim()
  const taken = list.some((r) => foldText(r.pattern) === foldText(p))
  const chosen = names.includes(category) ? category : (names[0] ?? '')
  const pending = data.transactions.filter((t) => t.category === UNCATEGORIZED).map((t) => ({ t, rule: matchRule(data.category_rules, t.concept, t.type) })).filter((x) => x.rule)
  const uses = (r: CategoryRule) => data.transactions.filter((t) => t.type === r.type && foldText(t.concept).includes(foldText(r.pattern))).length

  async function add(e: FormEvent) {
    e.preventDefault()
    if (p.length < 2 || taken || !chosen) return
    if (await create('category_rules', { pattern: p, type, category: chosen })) setPattern('')
  }
  async function applyPending() {
    for (const { t, rule } of pending) await update('transactions', t.id, { category: rule!.category })
    toast('success', `${pending.length} movimientos categorizados`)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Si el concepto contiene el texto, se asigna la categoría. Se aplican a Apple Pay, a la importación del banco y al escribir un movimiento. Si coinciden varias, gana la más larga.</p>
      <Segmented value={type} onChange={setType} options={TX_TYPES.map((t) => ({ value: t, label: TX_STYLES[t].label }))} />
      {pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="flex-1">{pending.length} movimientos sin categorizar coinciden con tus reglas.</span>
          <Button size="sm" onClick={() => void applyPending()}>
            Aplicar
          </Button>
        </div>
      )}
      <form onSubmit={add} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
        <Field label="El concepto contiene">
          <input className={cx('field', taken && 'border-rose-500')} value={pattern} maxLength={120} onChange={(e) => setPattern(e.target.value)} placeholder="p. ej. Ryanair" />
        </Field>
        <Field label="Categoría">
          <select className="field" value={chosen} onChange={(e) => setCategory(e.target.value)}>
            {names.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" variant="primary" disabled={p.length < 2 || taken}>
          <Plus className="size-4" /> Añadir
        </Button>
      </form>
      {list.length === 0 ? (
        <Empty>Aún no hay reglas de {TX_STYLES[type].label.toLowerCase()}.</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.map((r) => (
            <li key={r.id} className="flex min-h-12 items-center gap-3 px-3">
              <span className="min-w-0 flex-1 truncate text-sm">«{r.pattern}»</span>
              <span className="num text-[11px] text-faint" title="Movimientos que coinciden">
                {uses(r)}
              </span>
              <select className="field h-9 w-40 shrink-0" aria-label={`Categoría de ${r.pattern}`} value={r.category} onChange={(e) => void update('category_rules', r.id, { category: e.target.value })}>
                {[...new Set([r.category, ...names])].map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void remove('category_rules', r.id)} aria-label={`Eliminar la regla ${r.pattern}`} className="grid size-9 place-items-center rounded-lg text-faint hover:text-rose-600">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- categories
function CategoriesManager() {
  const { data, create, createMany, update, remove } = useData()
  const toast = useToast()
  const [type, setType] = useState<TxType>('expense')
  const [name, setName] = useState('')
  const [color, setColor] = useState<CategoryColor>('slate')

  const list = data.categories.filter((c) => c.type === type).sort((a, b) => a.name.localeCompare(b.name))
  const usage = (n: string) => data.transactions.filter((t) => t.type === type && t.category === n).length
  const n = normaliseCategory(name)
  const taken = list.some((c) => c.name === n) || n === UNCATEGORIZED

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!n || taken) return
    if (await create('categories', { name: n, type, color, budget: null })) {
      toast('success', `Categoría «${categoryLabel(n)}» añadida`)
      setName('')
    }
  }

  async function addDefaults() {
    const existing = new Set(data.categories.map((c) => `${c.type}:${c.name}`))
    await createMany(
      'categories',
      defaultCategories().filter((c) => !existing.has(`${c.type}:${c.name}`)),
    )
  }

  return (
    <div className="space-y-4">
      <Segmented value={type} onChange={setType} options={TX_TYPES.map((t) => ({ value: t, label: TX_STYLES[t].label }))} />

      {list.length === 0 ? (
        <Empty>
          Aún no hay categorías de {TX_STYLES[type].label.toLowerCase()}.
          <Button size="sm" onClick={addDefaults}>
            Añadir categorías sugeridas
          </Button>
        </Empty>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {list.map((c) => (
            <li key={c.id} className="group flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
              <select
                className={cx('size-4 shrink-0 cursor-pointer appearance-none rounded text-transparent', COLOR_BG[c.color])}
                value={c.color}
                onChange={(e) => update('categories', c.id, { color: e.target.value as CategoryColor })}
                aria-label="Color"
                title="Cambiar color"
              >
                {CATEGORY_COLORS.map((col) => (
                  <option key={col} value={col} className="text-fg">
                    {col}
                  </option>
                ))}
              </select>
              <span className="min-w-0 flex-1 truncate text-sm">{categoryLabel(c.name)}</span>
              {type === 'expense' && c.name !== 'savings_withdrawal' && <BudgetInput category={c} />}
              <span className="font-mono text-[10px] text-faint">{usage(c.name)}</span>
              <button
                onClick={() => remove('categories', c.id)}
                className="text-faint opacity-0 group-hover:opacity-100 hover:text-rose-500 focus:opacity-100 max-md:opacity-100"
                aria-label={`Eliminar ${c.name}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-3 rounded-lg border border-dashed border-line p-3">
        <div className="eyebrow">Nueva categoría de {TX_STYLES[type].label.toLowerCase()}</div>
        <input className={cx('field', taken && 'border-rose-500')} placeholder="p. ej. Gimnasio, Libros, Viajes" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <ColorPicker value={color} onChange={setColor} />
        <Button type="submit" variant="primary" disabled={!n || taken}>
          <Plus className="size-4" /> Añadir categoría
        </Button>
      </form>
      <p className="text-xs text-muted">Eliminar una categoría no modifica los movimientos anteriores: conservan su categoría. El límite es mensual y avisa al 80 % y al 100 %.</p>
    </div>
  )
}
