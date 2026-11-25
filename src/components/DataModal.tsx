import { useRef, useState } from 'react'
import { CloudOff, Download, FileUp, HardDrive, RefreshCw } from 'lucide-react'
import { BACKUP_SCOPES, TABLE_LABELS, buildBackup, parseBackup, planImport, type ImportMode, type ParsedBackup } from '../lib/backup'
import { downloadText } from '../lib/download'
import { toDateKey } from '../lib/dates'
import { useData } from '../state/data'
import { useToast } from '../state/toast'
import { Button, Field, Modal } from './ui'

/** Export / import JSON and sync status. */
export function DataModal({ onClose }: { onClose: () => void }) {
  const { data, source, pending, offline, reload, importBackup } = useData()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [scope, setScope] = useState('all')
  const [file, setFile] = useState<{ name: string; backup: ParsedBackup } | null>(null)
  const [mode, setMode] = useState<ImportMode>('missing')
  const [busy, setBusy] = useState(false)

  const tables = BACKUP_SCOPES.find((s) => s.id === scope)!.tables
  const rows = tables.reduce((a, t) => a + data[t].length, 0)
  const plan = file ? planImport(data, file.backup.data, mode) : null
  const writes = plan?.counts.reduce((a, c) => a + c.add + c.update, 0) ?? 0

  function exportJson() {
    downloadText(`personal-hub-${scope === 'all' ? '' : `${scope}-`}${toDateKey(new Date())}.json`, JSON.stringify(buildBackup(data, tables), null, 2))
    toast('success', `Copia descargada (${rows} registros)`)
  }
  async function pick(f: File | undefined) {
    if (!f) return
    try {
      if (f.size > 30_000_000) throw new Error('El archivo es demasiado grande.')
      setFile({ name: f.name, backup: parseBackup(await f.text()) })
    } catch (e) {
      setFile(null)
      toast('error', e instanceof Error ? e.message : 'No se ha podido leer el archivo.')
    } finally {
      if (input.current) input.current.value = ''
    }
  }
  async function doImport() {
    if (!file) return
    setBusy(true)
    const ok = await importBackup(file.backup.data, mode)
    setBusy(false)
    if (ok) {
      toast('success', `${writes} registros importados`)
      onClose()
    }
  }

  return (
    <Modal open wide onClose={onClose} title="Datos y copia de seguridad">
      <div className="space-y-6">
        <section className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {offline || pending ? <CloudOff className="size-4 text-amber-500" /> : <HardDrive className="size-4 text-accent" />}
            {source === 'local' ? 'Modo demo: todo se guarda en este navegador' : offline ? 'Sin conexión: ves la copia de este dispositivo' : pending ? 'Cambios pendientes de enviar' : 'Sincronizado con Supabase'}
          </div>
          {source === 'supabase' && (
            <p className="mt-1 text-muted">
              Este dispositivo guarda una copia local para abrir al instante y anotar sin cobertura; se borra al cerrar sesión.
              {pending > 0 && ` Hay ${pending} ${pending === 1 ? 'cambio' : 'cambios'} en espera: se enviarán solos al recuperar la conexión.`}
            </p>
          )}
          {source === 'supabase' && (
            <Button size="sm" className="mt-2" onClick={() => void reload()}>
              <RefreshCw className="size-3.5" /> Sincronizar ahora
            </Button>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Exportar</h3>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Contenido" className="min-w-40 flex-1">
              <select className="field" value={scope} onChange={(e) => setScope(e.target.value)}>
                {BACKUP_SCOPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Button variant="primary" onClick={exportJson} disabled={!rows}>
              <Download className="size-4" /> Exportar JSON
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">{rows} registros. El archivo contiene tus datos personales sin cifrar: guárdalo en un sitio seguro. Los PDF de apuntes no se incluyen.</p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Importar</h3>
          <input ref={input} type="file" accept=".json,application/json" className="hidden" aria-label="Archivo de copia" onChange={(e) => void pick(e.target.files?.[0])} />
          <Button onClick={() => input.current?.click()}>
            <FileUp className="size-4" /> Importar JSON
          </Button>
          {file && plan && (
            <div className="mt-3 space-y-3 rounded-lg border border-line p-3">
              <div className="text-sm break-all">
                <strong>{file.name}</strong>
                {file.backup.exportedAt && <span className="text-muted"> · {new Date(file.backup.exportedAt).toLocaleString('es-ES')}</span>}
              </div>
              <Field label="Si un registro ya existe">
                <select className="field" value={mode} onChange={(e) => setMode(e.target.value as ImportMode)}>
                  <option value="missing">Conservar el actual (solo añadir lo que falta)</option>
                  <option value="overwrite">Sobrescribir con el de la copia</option>
                </select>
              </Field>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {plan.counts.map((c) => (
                  <li key={c.table} className="flex justify-between gap-2">
                    <span>{TABLE_LABELS[c.table]}</span>
                    <span className="num text-muted">
                      +{c.add}
                      {c.update > 0 && ` · ${c.update} act.`}
                      {c.skip > 0 && ` · ${c.skip} omit.`}
                    </span>
                  </li>
                ))}
              </ul>
              {file.backup.skipped > 0 && <p className="text-xs text-amber-800 dark:text-amber-300">{file.backup.skipped} registros no son válidos y se ignoran.</p>}
              <p className="text-xs text-muted">Importar nunca borra datos.</p>
              <Button variant="primary" disabled={!writes || busy} onClick={() => void doImport()}>
                {busy ? 'Importando…' : writes ? `Importar ${writes} registros` : 'No hay nada nuevo'}
              </Button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
