import { useMemo, useState } from 'react'
import { Footprints, Heart, Trash2, Zap } from 'lucide-react'
import { Badge, Button, Card, Empty, Field, Modal, cx } from '../../components/ui'
import { fromDateKey, toDateKey } from '../../lib/dates'
import { fmtDate } from '../../lib/format'
import { RUN_TYPE_LABELS, RUN_TYPE_SHORT, daysBetween, fmtDuration, fmtKm, fmtPace, matchRuns, parseDuration, parseKm, parsePace, runPace } from '../../lib/running'
import { RUN_TYPES, type RaceGoal, type Run, type RunPlanSession, type RunType } from '../../lib/types'
import { useData } from '../../state/data'

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
  const [date, setDate] = useState(run?.date ?? (s && s.date <= today ? s.date : today))
  const [type, setType] = useState<RunType>(run?.type ?? s?.type ?? 'easy')
  const [km, setKm] = useState(run ? String(run.distance_km).replace('.', ',') : s ? String(s.distance_km).replace('.', ',') : '')
  const [mode, setMode] = useState<'time' | 'pace'>('time')
  const [time, setTime] = useState(run ? fmtDuration(run.duration_s) : '')
  const [pace, setPace] = useState(run ? fmtPace(runPace(run)) : '')
  const [work, setWork] = useState(run?.work_pace_s ? fmtPace(run.work_pace_s) : '')
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

  const kmN = parseKm(km)
  const paceN = parsePace(pace)
  const secs = mode === 'time' ? parseDuration(time) : kmN && paceN ? Math.round(kmN * paceN) : null
  const avg = kmN && secs ? secs / kmN : null
  const hrN = hr.trim() ? Math.round(Number(hr)) : null
  const hrOk = hrN === null || (hrN >= 40 && hrN <= 240)
  const workN = work.trim() ? parsePace(work) : null
  const sane = avg === null || (avg >= 100 && avg <= 1500)
  const ok = Boolean(date && kmN && kmN <= 200 && secs && sane && hrOk && (!work.trim() || workN))
  const quality = type === 'interval' || type === 'tempo'

  async function save() {
    if (!ok) return
    const row = { plan_id: planId || null, date, type, distance_km: Math.round(kmN! * 100) / 100, duration_s: secs!, work_pace_s: quality ? workN : null, avg_hr: hrN, rpe, is_test: isTest, notes }
    onClose()
    if (run) await update('runs', run.id, row)
    else await create('runs', row)
  }

  return (
    <Modal
      open
      wide
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
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fecha">
            <input type="date" className="field num" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Tipo de sesión">
            <select className="field" value={type} onChange={(e) => setType(e.target.value as RunType)}>
              {RUN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RUN_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Distancia real (km)">
            <input className="field num" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="10" />
          </Field>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label mb-0" htmlFor="run-time">
                {mode === 'time' ? 'Tiempo total' : 'Ritmo medio (min/km)'}
              </label>
              <button
                type="button"
                className="text-[11px] font-medium text-accent hover:underline"
                onClick={() => {
                  if (mode === 'time' && avg) setPace(fmtPace(avg))
                  if (mode === 'pace' && secs) setTime(fmtDuration(secs))
                  setMode(mode === 'time' ? 'pace' : 'time')
                }}
              >
                {mode === 'time' ? 'Usar ritmo' : 'Usar tiempo'}
              </button>
            </div>
            {mode === 'time' ? (
              <input id="run-time" className="field num" value={time} onChange={(e) => setTime(e.target.value)} placeholder="52:30" />
            ) : (
              <input id="run-time" className="field num" value={pace} onChange={(e) => setPace(e.target.value)} placeholder="5:15" />
            )}
          </div>
        </div>
        <p className={cx('text-sm', sane ? 'text-muted' : 'text-rose-700 dark:text-rose-400')} aria-live="polite">
          {avg && secs ? (
            sane ? (
              <>
                <span className="num font-semibold text-fg">{fmtDuration(secs)}</span> · <span className="num font-semibold text-fg">{fmtPace(avg)} min/km</span>
              </>
            ) : (
              'Ese ritmo no parece correcto: revisa la distancia y el tiempo.'
            )
          ) : (
            'Tiempo como h:mm:ss o mm:ss.'
          )}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {quality && (
            <Field label={type === 'interval' ? 'Ritmo de las series (min/km)' : 'Ritmo del bloque (min/km)'}>
              <input className={cx('field num', work.trim() && !workN && 'border-rose-500')} value={work} onChange={(e) => setWork(e.target.value)} placeholder="Opcional: 4:10" />
            </Field>
          )}
          <Field label="FC media (opcional)">
            <input className={cx('field num', !hrOk && 'border-rose-500')} inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} placeholder="150" />
          </Field>
          <Field label="Sesión del planning" className={quality ? 'sm:col-span-2' : ''}>
            <select className="field" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Ninguna (o la de ese mismo día)</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {fmtDate(fromDateKey(p.date), { weekday: 'short', day: 'numeric', month: 'short' })} · {RUN_TYPE_SHORT[p.type]} {fmtKm(p.distance_km)} km
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div>
          <span className="label">Sensaciones · RPE {rpe ?? '—'}</span>
          <div role="radiogroup" aria-label="Esfuerzo percibido (RPE)" className="grid grid-cols-5 gap-1 sm:grid-cols-10">
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
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
