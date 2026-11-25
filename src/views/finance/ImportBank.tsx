import { useMemo, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { Badge, Button, Field, Modal, cx } from '../../components/ui'
import { markDuplicates, parseCsv, parseStatement, type BankRow } from '../../lib/bank'
import { matchRule } from '../../lib/budget'
import { UNCATEGORIZED, categoryLabel } from '../../lib/categories'
import { fromDateKey } from '../../lib/dates'
import { fmtDate, fmtMoney } from '../../lib/format'
import { readXls } from '../../lib/xls'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'
import { usePrimaryAccountName } from './TxForms'

/** Santander (.xls) or any CSV with date, concept and amount. The file never leaves the browser. */
export function ImportBankModal({ onClose }: { onClose: () => void }) {
  const { data, createMany } = useData()
  const toast = useToast()
  const primary = usePrimaryAccountName()
  const input = useRef<HTMLInputElement>(null)
  const [account, setAccount] = useState(primary)
  const [file, setFile] = useState<{ name: string; rows: BankRow[]; skipped: number } | null>(null)
  const [choice, setChoice] = useState<Record<number, boolean>>({})
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => (file ? markDuplicates(file.rows, data.transactions, account) : []), [file, data.transactions, account])
  const picked = rows.map((r, i) => choice[i] ?? r.state === 'new')
  const count = picked.filter(Boolean).length
  const states = { new: rows.filter((r) => r.state === 'new').length, maybe: rows.filter((r) => r.state === 'maybe').length, duplicate: rows.filter((r) => r.state === 'duplicate').length }

  const typeOf = (r: BankRow) => (r.amount < 0 ? ('expense' as const) : ('income' as const))
  const categoryOf = (r: BankRow) => matchRule(data.category_rules, r.concept, typeOf(r))?.category ?? UNCATEGORIZED

  async function pick(f: File | undefined) {
    if (!f) return
    try {
      if (f.size > 8_000_000) throw new Error('El archivo es demasiado grande.')
      const cells = /\.(csv|txt)$/i.test(f.name) ? parseCsv(await f.text()) : readXls(await f.arrayBuffer())
      const s = parseStatement(cells)
      if (!s.rows.length) throw new Error('No hay movimientos en el archivo.')
      setFile({ name: f.name, ...s })
      setChoice({})
    } catch (e) {
      toast('error', /\.xlsx$/i.test(f.name) ? 'Guarda el archivo como .xls o .csv.' : e instanceof Error ? e.message : 'No se ha podido leer el archivo.')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  async function save() {
    setBusy(true)
    const list = rows
      .filter((_, i) => picked[i])
      .map((r) => ({ date: r.date, type: typeOf(r), category: categoryOf(r), concept: r.concept, amount: Math.abs(r.amount), account }))
    const ok = await createMany('transactions', list)
    setBusy(false)
    if (!ok) return
    toast('success', `${list.length} movimientos importados`)
    onClose()
  }

  return (
    <Modal
      open
      full
      onClose={onClose}
      title="Importar movimientos del banco"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!count || busy} onClick={() => void save()}>
            {busy ? 'Importando…' : `Importar ${count || ''}`}
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Cuenta" className="min-w-52 flex-1">
            <select className="field" value={account} onChange={(e) => setAccount(e.target.value)}>
              {[...new Set([account, ...data.accounts.map((a) => a.name)])].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <input ref={input} type="file" accept=".xls,.csv,.txt" className="hidden" aria-label="Archivo del banco" onChange={(e) => void pick(e.target.files?.[0])} />
          <Button variant={file ? 'secondary' : 'primary'} onClick={() => input.current?.click()}>
            <FileUp className="size-4" /> {file ? 'Elegir otro' : 'Elegir archivo'}
          </Button>
        </div>
        <p className="text-xs text-muted">Descarga los movimientos en Excel (.xls) desde la web del Santander. Se lee en tu dispositivo y los números de tarjeta y cuenta se eliminan.</p>

        {file && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">{states.new} nuevos</Badge>
              {states.maybe > 0 && <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">{states.maybe} posibles duplicados</Badge>}
              <Badge className="border-line-strong text-muted">{states.duplicate} ya registrados</Badge>
              {file.skipped > 0 && <Badge className="border-line-strong text-muted">{file.skipped} filas sin datos</Badge>}
            </div>
            {states.maybe > 0 && <p className="text-xs text-muted">Los posibles duplicados coinciden en importe con otro movimiento de esos días (por ejemplo, uno de Apple Pay). Vienen sin marcar.</p>}
            <ul className="divide-y divide-line rounded-lg border border-line">
              {rows.map((r, i) =>
                r.state === 'duplicate' ? null : (
                  <li key={i}>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-1.5">
                      <input type="checkbox" className="size-4 shrink-0 accent-[var(--accent)]" checked={picked[i]} onChange={(e) => setChoice((c) => ({ ...c, [i]: e.target.checked }))} />
                      <span className="num w-16 shrink-0 text-xs text-muted">{fmtDate(fromDateKey(r.date), { day: 'numeric', month: 'short' })}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{r.concept || 'Sin concepto'}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {categoryLabel(categoryOf(r))}
                          {r.match && ` · parecido a «${r.match.concept}» del ${fmtDate(fromDateKey(r.match.date), { day: 'numeric', month: 'short' })}`}
                        </span>
                      </span>
                      <span className={cx('num shrink-0 text-sm font-medium', r.amount > 0 && 'text-emerald-700 dark:text-emerald-400')}>{fmtMoney(r.amount)}</span>
                    </label>
                  </li>
                ),
              )}
              {states.new + states.maybe === 0 && <li className="p-4 text-sm text-muted">No hay nada nuevo: todo está ya registrado.</li>}
            </ul>
          </>
        )}
      </div>
    </Modal>
  )
}
