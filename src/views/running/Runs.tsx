import { useMemo, useState } from 'react'
import { Footprints, Heart, Pencil, Trash2, Zap } from 'lucide-react'
import { Badge, Button, Card, Empty, Field, Modal, cx } from '../../components/ui'
import { fromDateKey, toDateKey } from '../../lib/dates'
import { fmtDate } from '../../lib/format'
import { RUN_TYPE_LABELS, RUN_TYPE_SHORT, daysBetween, fmtDuration, fmtKm, fmtPace, goalPace, matchRuns, parseDuration, parseKm, parsePace, runPace } from '../../lib/running'
import { core, defaultBlocks, easyPace, ensureSections, estimate, formatBlock, missingSections, padRunBlocks, toRunBlocks, workPace } from '../../lib/workout'
import { RUN_TYPES, type RaceGoal, type Run, type RunBlock, type RunPlanSession, type RunType, type WorkoutBlock } from '../../lib/types'
import { useData } from '../../state/data'
import { BlocksEditor, Recorder, Templates } from './Blocks'

export interface RunSeed {
  session: RunPlanSession
}

export const TYPE_DOT: Record<RunType, string> = { easy: 'bg-emerald-500', interval: 'bg-rose-500', tempo: 'bg-amber-500', long: 'bg-sky-500', race: 'bg-violet-500' }

export function RunsPanel({ goal, onOpen }: { goal: RaceGoal | null; onOpen: (r: Run) => void }) {
  const { data } = useData()
  const [limit, setLimit] = useState(30)
  const runs = useMemo(() => [...data.runs].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)), [data.runs])
  const sessionByRun = useMemo(() => {
    const out = new Map<string, RunPlanSession>()
    const plan = goal ? data.run_plan.filter((p) => p.goal_id === goal.id) : data.run_plan
    const byId = new Map(plan.map((p) => [p.id, p]))
    for (const [id, r] of matchRuns(plan, data.runs)) out.set(r.id, byId.get(id)!)
    return out
  }, [data.run_plan, data.runs, goal])

  if (!runs.length) return <Empty icon={<Footprints className="size-6 text-faint" />}>Aún no has registrado entrenamientos.</Empty>
  return (
    <Card title={`Entrenamientos (${runs.length})`} bodyClass="p-0">
      <ul className="divide-y divide-line">
        {runs.slice(0, limit).map((r) => {
          const s = sessionByRun.get(r.id)
          return (
            <li key={r.id}>
              <button type="button" onClick={() => onOpen(r)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2">
                <span className={cx('size-2.5 shrink-0 rounded-full', TYPE_DOT[r.type])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-semibold">{RUN_TYPE_SHORT[r.type]}</span>
                    <span className="text-muted">{fmtDate(fromDateKey(r.date), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    {r.is_test && <Badge className="border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-300">Test</Badge>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-muted">
                    {r.avg_hr && (
                      <span className="inline-flex items-center gap-1">
                        <Heart className="size-3" /> {r.avg_hr}
                      </span>
                    )}
                    {r.rpe && <span className={cx(r.rpe >= 8 && 'font-semibold text-amber-800 dark:text-amber-300')}>RPE {r.rpe}</span>}
                    {r.work_pace_s && (
                      <span className="inline-flex items-center gap-1">
                        <Zap className="size-3" /> {fmtPace(r.work_pace_s)}
                      </span>
                    )}
                    {r.blocks.length > 0 && (r.type === 'interval' || r.type === 'tempo') && <span>{core(r.blocks).map((b) => formatBlock({ ...b, reps_max: null, reps: b.splits.filter(Boolean).length || b.reps })).join(' + ')}</span>}
                    {s && <span>Plan: {fmtKm(s.distance_km)} km{s.pace_s ? ` a ${fmtPace(s.pace_s)}` : ''}</span>}
                  </span>
                </span>
                <span className="text-right">
                  <span className="num block text-sm font-semibold">{fmtKm(r.distance_km)} km</span>
                  <span className="num block text-xs text-muted">
                    {fmtDuration(r.duration_s)} · {fmtPace(runPace(r))}/km
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {runs.length > limit && (
        <button type="button" className="min-h-11 w-full border-t border-line text-sm font-medium text-accent hover:underline" onClick={() => setLimit((l) => l + 50)}>
          Ver más
        </button>
      )}
    </Card>
  )
}

export function RunModal({ run, seed, goal, onClose }: { run: Run | null; seed?: RunSeed; goal: RaceGoal | null; onClose: () => void }) {
  const { data, create, update, remove } = useData()
  const s = seed?.session
  const today = toDateKey(new Date())
  const easy = useMemo(() => easyPace(data.runs, goal ? goalPace(goal) : null), [data.runs, goal])
  /** Structure a new run starts with: planned one, last template of its type, or the default. */
  const structureFor = (t: RunType): WorkoutBlock[] => {
    if (s && s.type === t && s.blocks.length) return s.blocks
    const template = data.run_workouts.findLast((w) => w.type === t)
    return template ? ensureSections(template.blocks) : defaultBlocks(t, s?.distance_km ?? run?.distance_km ?? 6, s?.type === t ? s.pace_s : null, easy)
  }

  const [date, setDate] = useState(run?.date ?? (s && s.date <= today ? s.date : today))
  const [type, setType] = useState<RunType>(run?.type ?? s?.type ?? 'easy')
  const [blocks, setBlocks] = useState<RunBlock[]>(() => (run?.blocks.length ? padRunBlocks(run.blocks) : toRunBlocks(structureFor(run?.type ?? s?.type ?? 'easy'))))
  const [edited, setEdited] = useState<WorkoutBlock[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [version, setVersion] = useState(0)
  const [touched, setTouched] = useState(Boolean(run?.blocks.length))
  const [km, setKm] = useState(run ? String(run.distance_km).replace('.', ',') : s && s.type !== 'interval' ? String(s.distance_km).replace('.', ',') : '')
  const [mode, setMode] = useState<'time' | 'pace'>('time')
  const [time, setTime] = useState(run ? fmtDuration(run.duration_s) : '')
  const [pace, setPace] = useState(run ? fmtPace(runPace(run)) : '')
  const [hr, setHr] = useState(run?.avg_hr?.toString() ?? '')
  const [rpe, setRpe] = useState<number | null>(run?.rpe ?? null)
  const [isTest, setIsTest] = useState(run?.is_test ?? s?.type === 'race')
  const [planId, setPlanId] = useState(run?.plan_id ?? s?.id ?? '')
  const [notes, setNotes] = useState(run?.notes ?? '')

  const taken = useMemo(() => new Set(data.runs.filter((r) => r.id !== run?.id && r.plan_id).map((r) => r.plan_id)), [data.runs, run?.id])
  const candidates = useMemo(
    () =>
      data.run_plan
        .filter((p) => p.id === planId || (!taken.has(p.id) && (!goal || p.goal_id === goal.id) && Math.abs(daysBetween(p.date, date)) <= 7))
        .sort((a, b) => Math.abs(daysBetween(a.date, date)) - Math.abs(daysBetween(b.date, date)) || a.date.localeCompare(b.date)),
    [data.run_plan, taken, goal, date, planId],
  )

  function load(list: WorkoutBlock[]) {
    setBlocks(toRunBlocks(list))
    setVersion((v) => v + 1)
    setEdited(null)
    setEditing(false)
  }
  function changeType(t: RunType) {
    setType(t)
    if (!touched) load(structureFor(t))
  }
  function choosePlan(id: string) {
    setPlanId(id)
    const p = data.run_plan.find((x) => x.id === id)
    if (!p || touched) return
    setType(p.type)
    load(p.blocks.length ? p.blocks : defaultBlocks(p.type, p.distance_km, p.pace_s, easy))
  }
  function applyEdit() {
    if (!edited) return
    // Keep the times already written for blocks that did not move.
    const fresh = toRunBlocks(edited)
    setBlocks(fresh.map((b, i) => (b.splits.length && blocks[i]?.kind === b.kind && blocks[i].unit === b.unit ? { ...b, splits: b.splits.map((_, j) => blocks[i].splits[j] ?? null) } : b)))
    setVersion((v) => v + 1)
    setTouched(true)
    setEdited(null)
    setEditing(false)
  }

  const est = estimate(blocks, easy)
  const work = workPace(blocks)
  // Totals of a rep session can be worked out from its blocks; the rest feed the projection and must be real.
  const canEstimate = type === 'interval' && work !== null
  const kmTyped = parseKm(km)
  const kmN = kmTyped ?? (canEstimate && !km.trim() ? est.km : null)
  const paceN = parsePace(pace)
  const typed = mode === 'time' ? parseDuration(time) : kmN && paceN ? Math.round(kmN * paceN) : null
  const secs = typed ?? (canEstimate && mode === 'time' && !time.trim() ? est.seconds : null)
  const avg = kmN && secs ? secs / kmN : null
  const hrN = hr.trim() ? Math.round(Number(hr)) : null
  const hrOk = hrN === null || (hrN >= 40 && hrN <= 240)
  const sane = avg === null || (avg >= 100 && avg <= 1500)
  const ok = Boolean(date && kmN && kmN <= 200 && secs && sane && hrOk && !editing && missingSections(blocks).length === 0)
  const estimated = (kmN !== null && kmTyped === null) || (secs !== null && typed === null)

  async function save() {
    if (!ok) return
    const row = { plan_id: planId || null, date, type, distance_km: Math.round(kmN! * 100) / 100, duration_s: secs!, work_pace_s: work, avg_hr: hrN, rpe, is_test: isTest, notes, blocks: blocks.map((b) => ({ ...b, splits: trim(b.splits) })) }
    onClose()
    if (run) await update('runs', run.id, row)
    else await create('runs', row)
  }

  return (
    <Modal
      open
      full
      onClose={onClose}
      title={run ? 'Editar entrenamiento' : s ? 'Completar sesión' : 'Registrar entrenamiento'}
      footer={
        <>
          {run && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                onClose()
                void remove('runs', run.id)
              }}
            >
              <Trash2 className="size-4" /> <span className="max-sm:sr-only">Eliminar</span>
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!ok} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {/* ---------------------------------------------------- structure */}
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fecha">
              <input type="date" className="field num" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Tipo de sesión">
              <select className="field" value={type} onChange={(e) => changeType(e.target.value as RunType)}>
                {RUN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RUN_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            {candidates.length > 0 && (
              <Field label="Sesión del planning" className="sm:col-span-2">
                <select className="field" value={planId} onChange={(e) => choosePlan(e.target.value)}>
                  <option value="">Ninguna (o la de ese mismo día)</option>
                  {candidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {fmtDate(fromDateKey(p.date), { weekday: 'short', day: 'numeric', month: 'short' })} · {RUN_TYPE_SHORT[p.type]} {fmtKm(p.distance_km)} km
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Templates
            key={`t${version}`}
            type={type}
            current={editing ? edited : blocks.map(plain)}
            onApply={(list, t) => {
              setType(t)
              setTouched(true)
              load(list)
            }}
          />
          {editing ? (
            <>
              <BlocksEditor key={`e${version}`} initial={blocks.map(plain)} easy={easy} onChange={setEdited} />
              <div className="flex gap-2">
                <Button type="button" variant="primary" disabled={!edited} onClick={applyEdit}>
                  Aplicar cambios
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false)
                    setEdited(null)
                  }}
                >
                  Descartar
                </Button>
              </div>
            </>
          ) : (
            <>
              <Recorder
                key={`r${version}`}
                blocks={blocks}
                onChange={(b) => {
                  setTouched(true)
                  setBlocks(b)
                }}
              />
              <Button type="button" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" /> Cambiar la estructura
              </Button>
            </>
          )}
        </div>

        {/* ------------------------------------------------------- totals */}
        <div className="min-w-0 space-y-4 lg:border-l lg:border-line lg:pl-6">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Distancia total (km)">
              <input className={cx('field num', km.trim() && !kmTyped && 'border-rose-500')} inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder={`≈ ${fmtKm(est.km)}`} />
            </Field>
            <div>
              <label className="label" htmlFor="run-time">
                {mode === 'time' ? 'Tiempo total' : 'Ritmo medio'}
              </label>
              {mode === 'time' ? (
                <input id="run-time" className="field num" value={time} onChange={(e) => setTime(e.target.value)} placeholder={`≈ ${fmtDuration(est.seconds)}`} />
              ) : (
                <input id="run-time" className="field num" value={pace} onChange={(e) => setPace(e.target.value)} placeholder="5:15" />
              )}
            </div>
          </div>
          <div className="-mt-2 flex items-start justify-between gap-3 text-sm">
            <p className={cx(sane ? 'text-muted' : 'text-rose-700 dark:text-rose-400')} aria-live="polite">
              {!sane ? (
                'Ese ritmo no parece correcto: revisa la distancia y el tiempo.'
              ) : avg && secs ? (
                <>
                  <span className="num font-semibold text-fg">{fmtDuration(secs)}</span> · <span className="num font-semibold text-fg">{fmtPace(avg)} min/km</span>
                  {estimated && ' (estimado con los bloques)'}
                </>
              ) : type === 'interval' ? (
                'Con los tiempos de las series puedes dejar los totales vacíos: se estiman.'
              ) : (
                'Anota la distancia y el tiempo totales del reloj.'
              )}
            </p>
            <button
              type="button"
              className="shrink-0 text-xs font-medium text-accent hover:underline"
              onClick={() => {
                if (mode === 'time' && avg) setPace(fmtPace(avg))
                if (mode === 'pace' && secs) setTime(fmtDuration(secs))
                setMode(mode === 'time' ? 'pace' : 'time')
              }}
            >
              {mode === 'time' ? 'Usar ritmo' : 'Usar tiempo'}
            </button>
          </div>
          <Field label="FC media (opcional)">
            <input className={cx('field num', !hrOk && 'border-rose-500')} inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} placeholder="150" />
          </Field>
          <div>
            <span className="label">Sensaciones · RPE {rpe ?? '—'}</span>
            <div role="radiogroup" aria-label="Esfuerzo percibido (RPE)" className="grid grid-cols-5 gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rpe === n}
                  aria-label={`RPE ${n}`}
                  onClick={() => setRpe(rpe === n ? null : n)}
                  className={cx('num min-h-10 rounded-lg border text-sm', rpe === n ? 'border-accent bg-accent/10 font-semibold' : 'border-line bg-surface-2 text-muted hover:text-fg')}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-faint">
              <span>Muy suave</span>
              <span>Máximo</span>
            </div>
          </div>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} /> Fue un test o una carrera (esfuerzo máximo)
          </label>
          <Field label="Notas">
            <textarea className="field min-h-16" value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/** Blocks without what was recorded. */
const plain = ({ done: _d, splits: _s, ...b }: RunBlock): WorkoutBlock => b
/** Drop trailing empty reps (the optional 6th one…). */
const trim = (list: (number | null)[]) => {
  const last = list.findLastIndex((x) => x !== null)
  return list.slice(0, last + 1)
}
