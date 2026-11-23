import { useMemo, useState } from 'react'
import { AlertCircle, CalendarCheck, ChevronLeft, ChevronRight, ClipboardCopy, Clock, Download, Plus } from 'lucide-react'
import { PageHeader } from '../components/Shell'
import { LogHoursModal, type LogDraft } from '../components/LogHoursModal'
import { Button, Card, Empty, Stat, cx } from '../components/ui'
import { addMonths, isSameDay, monthKey, startOfDay, startOfMonth } from '../lib/dates'
import { downloadCsv } from '../lib/finance'
import { LOCALE, capitalize, fmtDate, fmtMonth } from '../lib/format'
import type { WorkLog } from '../lib/types'
import { NO_KEY, fmtHours, hoursByDay, inLogMonth, monthDays, readDailyTarget, timesheet, worklogCsv, writeDailyTarget } from '../lib/worklog'
import { useData } from '../state/data'
import { useOffDays } from '../lib/useHolidays'
import { useToast } from '../state/toast'

/** 7.5 → "7,5" (rounded to 2 decimals, avoids float noise like 7.000000001). */
const num = (n: number) => n.toLocaleString(LOCALE, { maximumFractionDigits: 2, useGrouping: false })

/**
 * Work diary: what you did each day, for how long and on which Jira issue,
 * so filling in Jira at the end of the month is copy-and-paste.
 */
export function HoursView() {
  const { data } = useData()
  const toast = useToast()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [draft, setDraft] = useState<LogDraft | null>(null)
  const [target, setTarget] = useState(readDailyTarget)
  const [onlyMissing, setOnlyMissing] = useState(false)

  const today = startOfDay(new Date())
  const logs = useMemo(() => inLogMonth(data.work_logs, month), [data.work_logs, month])
  const perDay = useMemo(() => hoursByDay(logs), [logs])
  const offDays = useOffDays(month)
  const days = useMemo(() => monthDays(month, offDays), [month, offDays])
  const sheet = useMemo(() => timesheet(logs), [logs])
  const logsByDay = useMemo(() => {
    const m = new Map<string, WorkLog[]>()
    for (const l of logs) m.set(l.date, [...(m.get(l.date) ?? []), l])
    return m
  }, [logs])

  const pastWorkdays = days.filter((d) => !d.rest && d.date <= today)
  const offCount = days.filter((d) => !d.weekend && d.off && d.date <= today).length
  const missing = pastWorkdays.filter((d) => !perDay.get(d.key))
  const short = pastWorkdays.filter((d) => {
    const h = perDay.get(d.key) ?? 0
    return h > 0 && h < target
  })
  const total = logs.reduce((a, l) => a + l.hours, 0)
  const expected = pastWorkdays.length * target
  const taskTitle = (id: string | null) => (id ? (data.project_tasks.find((t) => t.id === id)?.title ?? '') : '')

  // Most recent day first; future days and empty weekends hidden.
  const visibleDays = [...days]
    .reverse()
    .filter((d) => d.date <= today || perDay.get(d.key))
    .filter((d) => !d.weekend || perDay.get(d.key))
    .filter((d) => !onlyMissing || (!d.rest && (perDay.get(d.key) ?? 0) < target))

  async function copySheet() {
    const cols = days.filter((d) => !d.weekend || sheet.some((r) => r.days.has(d.key)))
    const head = ['Clave', ...cols.map((d) => d.key.slice(8)), 'Total'].join('\t')
    const rows = sheet.map((r) => [r.key, ...cols.map((d) => (r.days.get(d.key) ?? 0) || ''), r.total].map((v) => (typeof v === 'number' ? num(v) : v)).join('\t'))
    try {
      await navigator.clipboard.writeText([head, ...rows].join('\n'))
      toast('success', 'Hoja de horas copiada (pégala en una hoja de cálculo)')
    } catch {
      toast('error', 'No se ha podido copiar al portapapeles')
    }
  }

  const isCurrent = monthKey(month) === monthKey(new Date())

  return (
    <>
      <PageHeader
        eyebrow="Registro de horas"
        title={capitalize(fmtMonth(month))}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-line bg-surface">
              <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Mes anterior">
                <ChevronLeft className="size-4" />
              </Button>
              <button onClick={() => setMonth(startOfMonth(new Date()))} disabled={isCurrent} className="h-8 px-2 text-xs font-medium text-muted hover:text-fg disabled:opacity-50">
                Este mes
              </button>
              <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Mes siguiente">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button variant="primary" onClick={() => setDraft({})}>
              <Plus className="size-4" /> <span className="hidden sm:inline">Registrar horas</span>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Horas del mes" value={fmtHours(total)} hint={`de ${fmtHours(expected)} esperadas hasta hoy`} icon={<Clock className="size-4" />} />
        <Stat
          label="Días registrados"
          value={`${pastWorkdays.length - missing.length}/${pastWorkdays.length}`}
          hint={offCount ? `laborables hasta hoy · ${offCount} festivo${offCount === 1 ? '' : 's'}/vacaciones excluidos` : 'días laborables hasta hoy'}
          icon={<CalendarCheck className="size-4" />}
        />
        <button className="text-left" onClick={() => setOnlyMissing((v) => !v)} aria-pressed={onlyMissing}>
          <Stat
            label="Sin registrar"
            value={missing.length}
            tone={missing.length ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}
            hint={onlyMissing ? 'Mostrando solo pendientes · ver todo' : short.length ? `+ ${short.length} días incompletos · ver` : 'Pulsa para filtrar'}
            icon={<AlertCircle className="size-4" />}
          />
        </button>
        <div className="card p-4">
          <div className="eyebrow">Jornada</div>
          <div className="mt-2 flex items-baseline gap-2">
            <select
              className="field num h-9 w-24 text-lg font-semibold"
              value={target}
              onChange={(e) => {
                const n = Number(e.target.value)
                setTarget(n)
                writeDailyTarget(n)
              }}
              aria-label="Horas por día"
            >
              {[4, 5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((h) => (
                <option key={h} value={h}>
                  {String(h).replace('.', ',')}
                </option>
              ))}
            </select>
            <span className="text-sm text-muted">h / día</span>
          </div>
          <div className="mt-1 text-xs text-muted">objetivo diario</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------------------------------------------------- diary */}
        <Card title="Diario" bodyClass="p-0">
          {visibleDays.length === 0 ? (
            <div className="p-4">
              <Empty>{onlyMissing ? '🎉 No tienes días pendientes este mes.' : 'Nada que mostrar en este mes.'}</Empty>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {visibleDays.map((d) => {
                const entries = logsByDay.get(d.key) ?? []
                const h = perDay.get(d.key) ?? 0
                const isMissing = !d.rest && h === 0
                const isShort = !d.rest && h > 0 && h < target
                return (
                  <li key={d.key} className={cx('px-4 py-3', isMissing && 'bg-amber-500/[0.05]')}>
                    <div className="flex items-center gap-3">
                      <div className="w-24 shrink-0">
                        <div className={cx('text-sm font-medium', isSameDay(d.date, today) && 'text-accent')}>
                          {capitalize(fmtDate(d.date, { weekday: 'short', day: 'numeric' }))}
                        </div>
                        {isSameDay(d.date, today) && <div className="eyebrow text-accent">Hoy</div>}
                      </div>
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
                        <div
                          className={cx('h-full rounded-full', h >= target ? 'bg-emerald-500' : h > 0 ? 'bg-amber-500' : '')}
                          style={{ width: `${Math.min(100, (h / target) * 100)}%` }}
                        />
                      </div>
                      <span className={cx('num w-14 text-right text-sm', isMissing ? 'text-amber-600 dark:text-amber-400' : isShort ? 'text-amber-600 dark:text-amber-400' : '')}>
                        {fmtHours(h)}
                      </span>
                      <Button size="icon" variant="ghost" onClick={() => setDraft({ date: d.key })} aria-label={`Registrar horas el ${d.key}`}>
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    {d.off && h === 0 ? (
                      <div className="mt-1.5 text-xs text-orange-700 dark:text-orange-300">{d.off} · no laborable</div>
                    ) : isMissing ? (
                      <button onClick={() => setDraft({ date: d.key })} className="mt-1.5 text-xs text-amber-700 hover:underline dark:text-amber-300">
                        Sin registrar · ¿qué hiciste este día?
                      </button>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {entries.map((l) => (
                          <li
                            key={l.id}
                            onClick={() => setDraft(l)}
                            className="flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-2"
                          >
                            <span className="w-20 shrink-0 font-mono text-[11px] text-accent">{l.jira_key ?? '—'}</span>
                            <span className="min-w-0 flex-1 truncate text-muted">{l.description || taskTitle(l.task_id) || 'Sin descripción'}</span>
                            <span className="num shrink-0 text-xs">{fmtHours(l.hours)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* ---------------------------------------------------- per issue */}
        <div className="space-y-4">
          <Card
            title="Por issue de Jira"
            action={
              <Button size="sm" variant="ghost" onClick={() => downloadCsv(`horas-${monthKey(month)}.csv`, worklogCsv(logs, taskTitle))} disabled={!logs.length}>
                <Download className="size-3.5" /> CSV
              </Button>
            }
          >
            {sheet.length === 0 ? (
              <Empty>Sin registros este mes.</Empty>
            ) : (
              <ul className="space-y-2.5">
                {sheet.map((r) => (
                  <li key={r.key} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cx('font-mono text-xs', r.key === NO_KEY ? 'text-faint' : 'text-fg')}>{r.key === NO_KEY ? 'Sin clave' : r.key}</span>
                      <span className="num font-medium">{fmtHours(r.total)}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(r.total / Math.max(1, total)) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* ---------------------------------------------------- timesheet */}
      {sheet.length > 0 && (
        <Card
          className="mt-4"
          title="Hoja de horas · issue × día"
          action={
            <Button size="sm" onClick={copySheet}>
              <ClipboardCopy className="size-3.5" /> Copiar
            </Button>
          }
          bodyClass="p-0"
        >
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-surface-2">
                  <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left font-semibold text-muted">Clave</th>
                  {days.map((d) => (
                    <th key={d.key} className={cx('num min-w-9 px-1 py-2 text-center font-normal', d.rest ? 'text-faint/60' : 'text-muted', d.off && !d.weekend && 'bg-orange-500/10', !d.rest && !perDay.get(d.key) && d.date <= today && 'bg-amber-500/10')}
                      title={d.off ?? undefined}
                    >
                      <div className="text-[9px] uppercase">{fmtDate(d.date, { weekday: 'narrow' })}</div>
                      {d.date.getDate()}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold text-muted">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sheet.map((r) => (
                  <tr key={r.key}>
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-mono whitespace-nowrap">{r.key === NO_KEY ? 'Sin clave' : r.key}</td>
                    {days.map((d) => {
                      const v = r.days.get(d.key)
                      return (
                        <td key={d.key} className={cx('num px-1 py-2 text-center', d.rest && 'bg-surface-2/60', v ? 'text-fg' : 'text-faint/40')}>
                          {v ? num(v) : '·'}
                        </td>
                      )
                    })}
                    <td className="num px-3 py-2 text-right font-semibold">{num(r.total)}</td>
                  </tr>
                ))}
                <tr className="bg-surface-2 font-semibold">
                  <td className="sticky left-0 z-10 bg-surface-2 px-3 py-2">Total</td>
                  {days.map((d) => {
                    const v = perDay.get(d.key)
                    return (
                      <td key={d.key} className={cx('num px-1 py-2 text-center', !!v && v < target && !d.rest && 'text-amber-600 dark:text-amber-400')}>
                        {v ? num(v) : ''}
                      </td>
                    )
                  })}
                  <td className="num px-3 py-2 text-right">{num(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <LogHoursModal draft={draft} onClose={() => setDraft(null)} />
    </>
  )
}
