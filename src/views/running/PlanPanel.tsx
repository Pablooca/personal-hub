import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, Circle, CopyPlus, Download, FileUp, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import { Button, Card, Empty, Field, Modal, cx } from '../../components/ui'
import { fromDateKey, toDateKey } from '../../lib/dates'
import { downloadText } from '../../lib/download'
import { capitalize, fmtDate } from '../../lib/format'
import { RUN_TYPE_LABELS, RUN_TYPE_SHORT, daysBetween, fmtKm, fmtPace, matchRuns, parseKm, parsePace, parsePlan, planToCsv, runPace, shiftDay, weekOf, type PlanDraft } from '../../lib/running'
import { RUN_TYPES, type RaceGoal, type Run, type RunPlanSession, type RunType } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'
import { TYPE_DOT } from './Runs'

export function PlanPanel({ goal, onComplete }: { goal: RaceGoal; onComplete: (s: RunPlanSession, run: Run | null) => void }) {
  const { data } = useData()
  const today = toDateKey(new Date())
  const [week, setWeek] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const plan = useMemo(() => data.run_plan.filter((p) => p.goal_id === goal.id).sort((a, b) => a.date.localeCompare(b.date)), [data.run_plan, goal.id])
  const matched = useMemo(() => matchRuns(plan, data.runs), [plan, data.runs])
  const weeks = useMemo(() => {
    const m = new Map<string, RunPlanSession[]>()
    for (const p of plan) m.set(weekOf(p.date), [...(m.get(weekOf(p.date)) ?? []), p])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [plan])
  const thisWeek = weekOf(today)
  const [showPast, setShowPast] = useState(false)
  const past = weeks.filter(([w]) => w < thisWeek)
  const visible = showPast ? weeks : weeks.filter(([w]) => w >= thisWeek)

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setWeek(thisWeek > weekOf(goal.date) ? weekOf(goal.date) : thisWeek)}>
          <Plus className="size-4" /> Planificar semana
        </Button>
        <Button onClick={() => setImporting(true)}>
          <FileUp className="size-4" /> Importar CSV/JSON
        </Button>
        {plan.length > 0 && (
          <Button onClick={() => downloadText('planning.csv', planToCsv(plan), 'text/csv')}>
            <Download className="size-4" /> <span className="hidden sm:inline">Exportar CSV</span>
            <span className="sm:hidden">CSV</span>
          </Button>
        )}
      </div>

      {!plan.length ? (
        <Empty>El planning está vacío. Planifica semana a semana o impórtalo desde un archivo.</Empty>
      ) : (
        <div className="space-y-3">
          {past.length > 0 && (
            <button type="button" className="min-h-9 text-sm font-medium text-accent hover:underline" onClick={() => setShowPast((x) => !x)}>
              {showPast ? 'Ocultar semanas pasadas' : `Ver ${past.length} ${past.length === 1 ? 'semana pasada' : 'semanas pasadas'}`}
            </button>
          )}
          {visible.map(([w, list]) => {
            const km = list.reduce((a, p) => a + p.distance_km, 0)
            const left = Math.round(daysBetween(w, weekOf(goal.date)) / 7)
            return (
              <Card
                key={w}
                bodyClass="p-0"
                className={cx(w === thisWeek && 'border-accent/50')}
                title={
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    Semana del {fmtDate(fromDateKey(w), { day: 'numeric', month: 'short' })}
                    <span className="text-xs font-normal text-muted">
                      {w === thisWeek ? 'esta semana · ' : ''}
                      {left > 0 ? `faltan ${left}` : left === 0 ? 'semana de la carrera' : ''} · {fmtKm(km)} km
                    </span>
                  </span>
                }
                action={
                  <Button size="icon" variant="ghost" aria-label="Editar semana" title="Editar semana" onClick={() => setWeek(w)}>
                    <Pencil className="size-4" />
                  </Button>
                }
              >
                <ul className="divide-y divide-line">
                  {list.map((p) => {
                    const run = matched.get(p.id) ?? null
                    const missed = !run && p.date < today
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => onComplete(p, run)} className="flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2" title={run ? 'Ver el entrenamiento' : 'Marcar como completada'}>
                          {run ? <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-label="Completada" /> : missed ? <XCircle className="size-5 shrink-0 text-rose-500" aria-label="No hecha" /> : <Circle className="size-5 shrink-0 text-line-strong" aria-label="Pendiente" />}
                          <span className="num w-14 shrink-0 text-xs text-muted">{capitalize(fmtDate(fromDateKey(p.date), { weekday: 'short', day: 'numeric' }))}</span>
                          <span className={cx('size-2 shrink-0 rounded-full', TYPE_DOT[p.type])} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="text-sm font-medium">{RUN_TYPE_SHORT[p.type]}</span>
                            {p.description && <span className="block truncate text-xs text-muted">{p.description}</span>}
                          </span>
                          <span className="num text-right text-sm">
                            {run ? (
                              <>
                                <span className="font-semibold">{fmtKm(run.distance_km)}</span>
                                <span className="text-muted">/{fmtKm(p.distance_km)} km</span>
                                <span className="block text-xs text-muted">{fmtPace(run.work_pace_s ?? runPace(run))}/km</span>
                              </>
                            ) : (
                              <>
                                {fmtKm(p.distance_km)} km
                                {p.pace_s && <span className="block text-xs text-muted">{fmtPace(p.pace_s)}/km</span>}
                              </>
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )
          })}
        </div>
      )}

      {week && <WeekModal key={week} goal={goal} week={week} plan={plan} onWeek={setWeek} onClose={() => setWeek(null)} />}
      {importing && <ImportModal goal={goal} existing={plan} onClose={() => setImporting(false)} />}
    </>
  )
}

// --------------------------------------------------------- quick week editor
interface Row {
  id: string | null
  day: number
  type: RunType
  km: string
  pace: string
  description: string
}
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function WeekModal({ goal, week, plan, onWeek, onClose }: { goal: RaceGoal; week: string; plan: RunPlanSession[]; onWeek: (w: string) => void; onClose: () => void }) {
  const { createMany, update, removeMany } = useData()
  const toast = useToast()
  const current = plan.filter((p) => weekOf(p.date) === week)
  const toRow = (p: RunPlanSession, keepId: boolean): Row => ({
    id: keepId ? p.id : null,
    day: daysBetween(weekOf(p.date), p.date),
    type: p.type,
    km: String(p.distance_km).replace('.', ','),
    pace: p.pace_s ? fmtPace(p.pace_s) : '',
    description: p.description,
  })
  const [rows, setRows] = useState<Row[]>(() => current.map((p) => toRow(p, true)))
  const [repeat, setRepeat] = useState(0)
  const previous = plan.filter((p) => weekOf(p.date) === shiftDay(week, -7))
  const maxRepeat = Math.max(0, Math.round(daysBetween(week, weekOf(goal.date)) / 7))

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const valid = (r: Row) => {
    const km = parseKm(r.km)
    return km !== null && km <= 200 && (!r.pace.trim() || parsePace(r.pace) !== null)
  }
  const ok = rows.every(valid)
  const total = rows.reduce((a, r) => a + (parseKm(r.km) ?? 0), 0)
  const nextFree = () => {
    const used = new Set(rows.map((r) => r.day))
    return [1, 3, 6, 5, 0, 2, 4].find((d) => !used.has(d)) ?? 6
  }

  async function save() {
    if (!ok) return
    const toData = (r: Row, w: string) => ({ goal_id: goal.id, date: shiftDay(w, r.day), type: r.type, distance_km: Math.round(parseKm(r.km)! * 100) / 100, pace_s: r.pace.trim() ? parsePace(r.pace) : null, description: r.description.trim() })
    onClose()
    const keep = new Set(rows.map((r) => r.id).filter(Boolean))
    await removeMany('run_plan', current.filter((p) => !keep.has(p.id)).map((p) => p.id))
    for (const r of rows) {
      const old = r.id && current.find((p) => p.id === r.id)
      if (!old) continue
      const d = toData(r, week)
      if (old.date !== d.date || old.type !== d.type || old.distance_km !== d.distance_km || old.pace_s !== d.pace_s || old.description !== d.description) await update('run_plan', old.id, d)
    }
    const fresh = rows.filter((r) => !r.id).map((r) => toData(r, week))
    // Repeating only fills weeks that are still empty.
    for (let n = 1; n <= repeat; n++) {
      const w = shiftDay(week, n * 7)
      if (plan.some((p) => weekOf(p.date) === w)) continue
      for (const r of rows) if (shiftDay(w, r.day) < goal.date) fresh.push(toData(r, w))
    }
    if (fresh.length) await createMany('run_plan', fresh)
    toast('success', 'Planning guardado')
  }

  return (
    <Modal
      open
      full
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-surface-2" aria-label="Semana anterior" onClick={() => onWeek(shiftDay(week, -7))}>
            ‹
          </button>
          Semana del {fmtDate(fromDateKey(week), { day: 'numeric', month: 'short', year: 'numeric' })}
          <button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-surface-2" aria-label="Semana siguiente" onClick={() => onWeek(shiftDay(week, 7))}>
            ›
          </button>
        </span>
      }
      footer={
        <>
          <span className="mr-auto text-sm text-muted">
            <span className="num font-semibold text-fg">{fmtKm(total)}</span> km
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!ok} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-4xl space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-3 sm:grid-cols-[130px_170px_90px_90px_minmax(0,1fr)_40px]">
            <select className="field" aria-label="Día" value={r.day} onChange={(e) => set(i, { day: Number(e.target.value) })}>
              {DAYS.map((d, n) => (
                <option key={d} value={n}>
                  {d} {fmtDate(fromDateKey(shiftDay(week, n)), { day: 'numeric' })}
                </option>
              ))}
            </select>
            <select className="field" aria-label="Tipo" value={r.type} onChange={(e) => set(i, { type: e.target.value as RunType })}>
              {RUN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RUN_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <input className={cx('field num', r.km.trim() !== '' && !parseKm(r.km) && 'border-rose-500')} inputMode="decimal" aria-label="Kilómetros" placeholder="km" value={r.km} onChange={(e) => set(i, { km: e.target.value })} />
            <input className={cx('field num', r.pace.trim() !== '' && !parsePace(r.pace) && 'border-rose-500')} aria-label="Ritmo objetivo" placeholder="min/km" value={r.pace} onChange={(e) => set(i, { pace: e.target.value })} />
            <input className="field" aria-label="Descripción" placeholder="Descripción (opcional)" value={r.description} maxLength={1000} onChange={(e) => set(i, { description: e.target.value })} />
            <button type="button" aria-label="Quitar sesión" className="grid h-9 place-items-center rounded-lg text-faint hover:bg-rose-500/10 hover:text-rose-600" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setRows((r) => [...r, { id: null, day: nextFree(), type: 'easy', km: '', pace: '', description: '' }])}>
            <Plus className="size-4" /> Añadir sesión
          </Button>
          {rows.length === 0 && previous.length > 0 && (
            <Button onClick={() => setRows(previous.map((p) => toRow(p, false)))}>
              <CopyPlus className="size-4" /> Copiar la semana anterior
            </Button>
          )}
        </div>
        {maxRepeat > 0 && rows.length > 0 && (
          <Field label="Repetir en las semanas siguientes (solo las vacías)" className="max-w-xs">
            <select className="field" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
              <option value={0}>No repetir</option>
              {Array.from({ length: maxRepeat }, (_, n) => n + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'semana más' : 'semanas más'}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  )
}

// -------------------------------------------------------------------- import
const SAMPLE = 'fecha;tipo;distancia_km;ritmo;descripcion\n2026-12-01;Rodaje;8;5:40;Suave\n2026-12-03;Series;10;4:10;6 x 1000 m\n2026-12-06;Larga;16;5:20;'

function ImportModal({ goal, existing, onClose }: { goal: RaceGoal; existing: RunPlanSession[]; onClose: () => void }) {
  const { createMany } = useData()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const parsed = useMemo(() => (text.trim() ? parsePlan(text) : { sessions: [], errors: [] }), [text])
  const key = (p: Pick<PlanDraft, 'date' | 'type'>) => `${p.date}|${p.type}`
  const have = new Set(existing.map(key))
  const fresh = parsed.sessions.filter((s) => !have.has(key(s)))
  const repeated = parsed.sessions.length - fresh.length

  async function load(file: File | undefined) {
    if (!file) return
    if (file.size > 2_000_000) return toast('error', 'El archivo es demasiado grande.')
    setText(await file.text())
  }
  async function save() {
    onClose()
    const ok = await createMany('run_plan', fresh.map((s) => ({ ...s, goal_id: goal.id })))
    if (ok) toast('success', `${fresh.length} sesiones importadas`)
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Importar planning"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!fresh.length} onClick={() => void save()}>
            Importar {fresh.length || ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept=".csv,.json,.txt,text/csv,application/json" className="hidden" aria-label="Archivo del planning" onChange={(e) => void load(e.target.files?.[0])} />
          <Button onClick={() => input.current?.click()}>
            <FileUp className="size-4" /> Elegir archivo
          </Button>
          <Button variant="ghost" onClick={() => downloadText('plantilla-planning.csv', SAMPLE, 'text/csv')}>
            <Download className="size-4" /> Plantilla CSV
          </Button>
        </div>
        <Field label="…o pega aquí el contenido">
          <textarea className="field min-h-36 font-mono text-xs" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} />
        </Field>
        <p className="text-xs text-muted">Columnas: fecha, tipo (rodaje, series, tempo, larga, test), distancia en km, ritmo (min/km) y descripción. También admite JSON con los mismos campos.</p>
        {parsed.errors.length > 0 && (
          <ul className="space-y-1 text-sm text-rose-700 dark:text-rose-400">
            {parsed.errors.slice(0, 6).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {parsed.errors.length > 6 && <li>… y {parsed.errors.length - 6} más.</li>}
          </ul>
        )}
        {parsed.sessions.length > 0 && (
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
            <strong>{fresh.length}</strong> sesiones nuevas ({fmtKm(fresh.reduce((a, s) => a + s.distance_km, 0))} km)
            {repeated > 0 && <span className="text-muted"> · {repeated} ya estaban y se omiten</span>}
          </div>
        )}
      </div>
    </Modal>
  )
}
