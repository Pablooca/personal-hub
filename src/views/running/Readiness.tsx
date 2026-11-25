import { useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed, OctagonAlert, XCircle } from 'lucide-react'
import { Card, Empty, cx } from '../../components/ui'
import { fromDateKey } from '../../lib/dates'
import { fmtDate } from '../../lib/format'
import { LIGHT_LABELS, RUN_TYPE_SHORT, fmtDuration, fmtGap, fmtKm, fmtPace, goalPace, type Light, type Readiness as R, type WeekVolume } from '../../lib/running'
import type { RaceGoal } from '../../lib/types'

const LIGHT: Record<Light, { icon: typeof CheckCircle2; cls: string; dot: string; text: string }> = {
  green: { icon: CheckCircle2, cls: 'border-emerald-500/40 bg-emerald-500/10', dot: 'bg-emerald-500', text: 'text-emerald-800 dark:text-emerald-300' },
  amber: { icon: AlertTriangle, cls: 'border-amber-500/40 bg-amber-500/10', dot: 'bg-amber-500', text: 'text-amber-800 dark:text-amber-300' },
  red: { icon: OctagonAlert, cls: 'border-rose-500/40 bg-rose-500/10', dot: 'bg-rose-500', text: 'text-rose-800 dark:text-rose-300' },
  none: { icon: CircleDashed, cls: 'border-line bg-surface-2', dot: 'bg-line-strong', text: 'text-muted' },
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)} %`)

function verdict(goal: RaceGoal, r: R): string {
  if (r.daysLeft < 0) return 'La carrera ya ha pasado: esto es cómo llegaste.'
  if (r.light === 'none') return 'Carga el planning y registra entrenamientos para saber cómo vas.'
  const p = r.projection
  const pace = p
    ? p.gap <= 0
      ? `Tu proyección (${fmtDuration(p.time)}) ya está por debajo del objetivo: te sobran ${fmtGap(p.gap)} por km.`
      : `Tu proyección es ${fmtDuration(p.time)}: te faltan ${fmtGap(Math.max(1, p.gap))} por km para rodar a ${fmtPace(goalPace(goal))}.`
    : 'Aún no hay un esfuerzo continuo reciente para proyectar tu marca.'
  const adh = r.adherence.pct !== null ? ` Llevas el ${pct(r.adherence.pct)} de las sesiones y el ${pct(r.adherence.kmPct)} de los kilómetros.` : ''
  return pace + adh
}

export function Readiness({ goal, r }: { goal: RaceGoal; r: R }) {
  const L = LIGHT[r.light]
  const Icon = L.icon
  return (
    <div className="space-y-4">
      <section className={cx('flex flex-wrap items-center gap-4 rounded-xl border p-5', L.cls)} aria-live="polite">
        <div className="flex gap-1.5 rounded-full border border-line bg-surface p-1.5" aria-hidden>
          {(['red', 'amber', 'green'] as const).map((l) => (
            <span key={l} className={cx('size-5 rounded-full', r.light === l ? LIGHT[l].dot : 'bg-line')} />
          ))}
        </div>
        <div className="min-w-0 flex-1 basis-60">
          <div className="font-mono text-[11px] tracking-widest uppercase">¿Voy bien preparado?</div>
          <div className={cx('flex items-center gap-2 text-lg font-semibold sm:text-xl', L.text)}>
            <Icon className="size-5 shrink-0" /> {LIGHT_LABELS[r.light]}
          </div>
          <p className="mt-1 text-sm">{verdict(goal, r)}</p>
        </div>
        {r.score !== null && (
          <div className="text-right">
            <div className="num text-3xl font-semibold">
              {r.score}
              <span className="text-base text-muted">/100</span>
            </div>
            <div className="text-xs text-muted">preparación</div>
          </div>
        )}
      </section>

      {r.alerts.length > 0 && (
        <ul className="space-y-2">
          {r.alerts.map((a) => (
            <li key={a.text} className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              {a.level === 'bad' ? <OctagonAlert className="mt-0.5 size-4 shrink-0 text-rose-500" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />}
              {a.text}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Adherencia y volumen">
          <Meter label="Sesiones" value={r.adherence.pct} detail={`${r.adherence.done} de ${r.adherence.due}`} />
          <Meter label="Kilómetros" value={r.adherence.kmPct} detail={`${fmtKm(r.adherence.doneKm)} de ${fmtKm(r.adherence.plannedKm)} km`} />
          <dl className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
            <Line label="Media de las últimas 4 semanas" value={`${fmtKm(r.volume.recentWeekly)} km/sem`} />
            <Line label="Queda por hacer" value={`${fmtKm(r.volume.remainingKm)} km · ${r.volume.remainingSessions} ses.`} />
            <Line label="Planificado por semana" value={r.volume.weeklyRemaining ? `${fmtKm(r.volume.weeklyRemaining)} km/sem` : '—'} />
            <Line label="Proyección a tu ritmo actual" value={r.volume.projectedWeekly !== null ? `${fmtKm(r.volume.projectedWeekly)} km/sem` : '—'} />
          </dl>
        </Card>

        <Card title="Ritmo y proyección de marca">
          {r.projection ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="num text-3xl font-semibold">{fmtDuration(r.projection.time)}</span>
                <span className="text-sm text-muted">proyectado hoy</span>
              </div>
              <p className={cx('mt-1 text-sm font-medium', r.projection.gap <= 0 ? 'text-emerald-800 dark:text-emerald-300' : r.projection.gapPct > 0.05 ? 'text-rose-800 dark:text-rose-300' : 'text-amber-800 dark:text-amber-300')}>
                {Math.abs(r.projection.gap) < 0.5
                  ? 'Clavado en tu ritmo objetivo.'
                  : r.projection.gap < 0
                    ? `Vas ${fmtGap(r.projection.gap)} por km más rápido que el objetivo.`
                    : `Tienes que bajar ${fmtGap(r.projection.gap)} por km para llegar al objetivo.`}
              </p>
              <dl className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
                <Line label="Ritmo proyectado" value={`${fmtPace(r.projection.pace)} /km`} />
                <Line label="Ritmo objetivo" value={`${fmtPace(goalPace(goal))} /km`} />
                <Line label="Objetivo" value={fmtDuration(goal.target_s)} />
                {goal.previous_best_s && <Line label="Frente a tu marca" value={`${r.projection.time < goal.previous_best_s ? '−' : '+'}${fmtDuration(Math.abs(r.projection.time - goal.previous_best_s))}`} />}
              </dl>
              <p className="mt-3 text-xs text-muted">
                Riegel sobre {fmtKm(r.projection.run.distance_km)} km en {fmtDuration(r.projection.run.duration_s)} ({r.projection.run.is_test ? 'test' : RUN_TYPE_SHORT[r.projection.run.type].toLowerCase()} del{' '}
                {fmtDate(fromDateKey(r.projection.run.date))}). Las series no cuentan: su media incluye las recuperaciones.
              </p>
            </>
          ) : (
            <Empty>Registra un test o un entrenamiento continuo de al menos 3 km.</Empty>
          )}
        </Card>

        <Card title="Sesiones clave y fatiga">
          <Meter label="Cumplidas (distancia y ritmo)" value={r.key.pct} detail={`${r.key.list.filter((k) => k.ok).length} de ${r.key.list.length}`} />
          <dl className="mt-3 space-y-2 text-sm">
            <Line label="Tiradas largas" value={`${r.key.long.done} de ${r.key.long.due}`} />
            <Line label="Calidad (umbral y series)" value={`${r.key.quality.done} de ${r.key.quality.due}`} />
            <Line label="RPE medio (7 días)" value={r.fatigue.avg7 === null ? '—' : r.fatigue.avg7.toLocaleString('es-ES', { maximumFractionDigits: 1 })} />
            <Line label="Sesiones duras seguidas (RPE ≥ 8)" value={String(r.fatigue.streak)} />
          </dl>
          {r.key.list.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
              {r.key.list
                .slice(-5)
                .reverse()
                .map((k) => (
                  <li key={k.session.id} className="flex items-center gap-2 text-sm">
                    {k.ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Cumplida" /> : k.run ? <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-label="Con desviación" /> : <XCircle className="size-4 shrink-0 text-rose-500" aria-label="No hecha" />}
                    <span className="min-w-0 flex-1 truncate">
                      {fmtDate(fromDateKey(k.session.date))} · {RUN_TYPE_SHORT[k.session.type]} {fmtKm(k.session.distance_km)} km
                    </span>
                    <span className="num text-xs text-muted">
                      {k.reps && k.run ? `${k.reps.done}/${k.reps.max > k.reps.min ? `${k.reps.min}–${k.reps.max}` : k.reps.min} · ` : ''}
                      {!k.run ? 'no hecha' : k.paceDeviation === null ? `${Math.round(k.distancePct ?? 0)} %` : `${k.paceDeviation > 0 ? '+' : '−'}${fmtGap(k.paceDeviation * k.session.pace_s!)}/km`}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      {r.volume.weeks.length > 0 && <VolumeChart weeks={r.volume.weeks} />}

      <p className="text-xs text-muted">
        La nota combina proyección de marca (40 %), adherencia (35 %) y sesiones clave (25 %), con 10 puntos menos si hay fatiga alta. Verde desde 80 y ámbar desde 60; nunca es verde con la proyección a más de un 3 % del objetivo. Es una guía, no sustituye a
        tu entrenador.
      </p>
    </div>
  )
}

const Line = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-muted">{label}</dt>
    <dd className="num text-right font-medium whitespace-nowrap">{value}</dd>
  </div>
)

function Meter({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="num">
          <span className="text-xs text-muted">{detail}</span> <span className="ml-1 font-semibold">{pct(value)}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, value ?? 0)}%` }} />
      </div>
    </div>
  )
}

/** Planned (outline) against done (solid) km per week. */
function VolumeChart({ weeks }: { weeks: WeekVolume[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(10, ...weeks.map((w) => Math.max(w.planned, w.done)))
  const todayWeek = weeks.findLastIndex((w) => fromDateKey(w.week) <= new Date())
  const shown = hover ?? (todayWeek >= 0 ? todayWeek : 0)
  const w = weeks[shown]
  return (
    <Card
      title="Volumen semanal"
      action={
        <span className="flex items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border border-line-strong bg-line" /> Plan
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-sky-500" /> Hecho
          </span>
        </span>
      }
    >
      <p className="mb-3 text-sm">
        <span className="text-muted">Semana del {fmtDate(fromDateKey(w.week), { day: 'numeric', month: 'short' })}:</span> <span className="num font-semibold">{fmtKm(w.done)}</span> de {fmtKm(w.planned)} km
        <span className="text-muted">
          {' '}
          · {w.completed} de {w.sessions} sesiones
        </span>
      </p>
      <div className="scrollbar-thin overflow-x-auto">
        <div className="flex h-36 min-w-full items-end gap-1" style={{ width: weeks.length > 7 ? weeks.length * 40 : undefined }} onMouseLeave={() => setHover(null)}>
          {weeks.map((x, i) => (
            <button
              key={x.week}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(i)}
              aria-label={`${fmtDate(fromDateKey(x.week), { day: 'numeric', month: 'numeric' })}: ${fmtKm(x.done)} de ${fmtKm(x.planned)} kilómetros`}
              className={cx('flex h-full min-w-6 flex-1 flex-col justify-end rounded-md px-0.5', i === shown && 'bg-surface-2')}
            >
              <span className="flex h-[calc(100%-18px)] w-full items-end justify-center gap-[2px]">
                <span className="w-full max-w-4 rounded-t border border-b-0 border-line-strong bg-line" style={{ height: `${(x.planned / max) * 100}%` }} />
                <span className="w-full max-w-4 rounded-t bg-sky-500" style={{ height: `${(x.done / max) * 100}%` }} />
              </span>
              <span className={cx('mt-1 block text-center font-mono text-[10px]', i === todayWeek ? 'font-bold text-fg' : 'text-faint')}>{fmtDate(fromDateKey(x.week), { day: 'numeric', month: 'numeric' })}</span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}

