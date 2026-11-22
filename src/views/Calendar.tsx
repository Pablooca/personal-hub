import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { PageHeader } from '../components/Shell'
import { EventModal, type EventDraft } from '../components/EventModal'
import { Button, Card, Check, Empty, Segmented, cx } from '../components/ui'
import { addDays, addMonths, combineDateTime, isSameDay, monthGrid, startOfDay, toDateKey, weekDays } from '../lib/dates'
import { capitalize, fmtDate, fmtMonth, fmtTime, fmtWeekday } from '../lib/format'
import { CATEGORY_STYLES } from '../lib/theme'
import { EVENT_CATEGORIES, type CalendarEvent, type EventCategory } from '../lib/types'
import { useData } from '../state/data'
import { REGION_OPTIONS, SCOPE_LABELS, holidayLabel, type Holiday, type HolidayRegion } from '../lib/holidays'
import { useHolidayRegion, useHolidays } from '../lib/useHolidays'

const timeLabel = (e: CalendarEvent) => (e.all_day ? 'Todo el día' : `${fmtTime(e.start_at)}–${fmtTime(e.end_at)}`)

type Mode = 'month' | 'week'
const HOUR_PX = 44
const DAY_START = 6 // grid starts at 06:00
const DAY_END = 24

export function CalendarView() {
  const { data, update } = useData()
  const [mode, setMode] = useState<Mode>('month')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [selected, setSelected] = useState(() => startOfDay(new Date()))
  const [hidden, setHidden] = useState<Set<EventCategory>>(new Set())
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [region, setRegion] = useHolidayRegion()
  const holidays = useHolidays(cursor)

  const visible = useMemo(() => data.events.filter((e) => !hidden.has(e.category)), [data.events, hidden])

  // Bucket events per local day once.
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of visible) {
      const k = toDateKey(new Date(e.start_at))
      const list = m.get(k)
      if (list) list.push(e)
      else m.set(k, [e])
    }
    // All-day first, then by start time.
    for (const list of m.values()) list.sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start_at.localeCompare(b.start_at))
    return m
  }, [visible])

  const today = startOfDay(new Date())
  const step = (dir: 1 | -1) => setCursor((c) => (mode === 'month' ? addMonths(c, dir) : addDays(c, dir * 7)))
  const goToday = () => {
    setCursor(today)
    setSelected(today)
  }

  const week = weekDays(cursor)
  const title =
    mode === 'month'
      ? capitalize(fmtMonth(cursor))
      : `${fmtDate(week[0], { day: 'numeric', month: 'short' })} – ${fmtDate(week[6], { day: 'numeric', month: 'short', year: 'numeric' })}`

  const selectedEvents = byDay.get(toDateKey(selected)) ?? []
  const checkable = selectedEvents.filter((e) => e.category !== 'holiday' && e.category !== 'vacation')
  const doneCount = checkable.filter((e) => e.is_completed).length
  const selectedHolidays = holidays.get(toDateKey(selected))

  const toggleCategory = (c: EventCategory) =>
    setHidden((h) => {
      const n = new Set(h)
      if (n.has(c)) n.delete(c)
      else n.add(c)
      return n
    })

  return (
    <>
      <PageHeader
        eyebrow="Calendario y agenda"
        title={title}
        actions={
          <>
            <select
              className="field h-8 w-auto text-xs"
              value={region}
              onChange={(e) => setRegion(e.target.value as HolidayRegion)}
              aria-label="Festivos que se aplican"
              title="Festivos que se aplican"
            >
              {REGION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Festivos: {o.label}
                </option>
              ))}
            </select>
            <Segmented value={mode} onChange={setMode} options={[{ value: 'month', label: 'Mes' }, { value: 'week', label: 'Semana' }]} />
            <div className="flex items-center rounded-lg border border-line bg-surface">
              <Button variant="ghost" size="icon" onClick={() => step(-1)} aria-label="Anterior">
                <ChevronLeft className="size-4" />
              </Button>
              <button onClick={goToday} className="h-8 px-2 text-xs font-medium text-muted hover:text-fg">
                Hoy
              </button>
              <Button variant="ghost" size="icon" onClick={() => step(1)} aria-label="Siguiente">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button variant="primary" onClick={() => setDraft({ dateKey: toDateKey(selected) })}>
              <Plus className="size-4" /> <span className="hidden sm:inline">Nuevo evento</span>
            </Button>
          </>
        }
      />

      {/* category legend / filter */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {EVENT_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => toggleCategory(c)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition',
              hidden.has(c) ? 'border-line text-faint line-through' : CATEGORY_STYLES[c].chip,
            )}
            aria-pressed={!hidden.has(c)}
          >
            <span className={cx('size-2 rounded-full', hidden.has(c) ? 'bg-faint' : CATEGORY_STYLES[c].dot)} />
            {CATEGORY_STYLES[c].label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-hidden">
          {mode === 'month' ? (
            <MonthGrid
              cursor={cursor}
              selected={selected}
              today={today}
              byDay={byDay}
              holidays={holidays}
              onSelect={setSelected}
              onCreate={(d) => setDraft({ dateKey: toDateKey(d) })}
              onOpen={setDraft}
            />
          ) : (
            <WeekGrid
              days={week}
              today={today}
              byDay={byDay}
              holidays={holidays}
              onOpen={setDraft}
              onCreate={(d, hour) =>
                setDraft({
                  start_at: combineDateTime(toDateKey(d), `${String(hour).padStart(2, '0')}:00`),
                  end_at: combineDateTime(toDateKey(d), `${String(Math.min(hour + 1, 23)).padStart(2, '0')}:${hour + 1 > 23 ? '59' : '00'}`),
                })
              }
              onSelect={setSelected}
            />
          )}
        </div>

        {/* day checklist */}
        <Card
          title={
            <span className="flex items-baseline gap-2">
              {capitalize(fmtDate(selected, { weekday: 'long', day: 'numeric', month: 'short' }))}
              {isSameDay(selected, today) && <span className="eyebrow text-accent">Hoy</span>}
            </span>
          }
          action={<span className="num text-xs text-muted">{doneCount}/{checkable.length}</span>}
          className="xl:sticky xl:top-6 xl:self-start"
        >
          {selectedHolidays && (
            <div className="mb-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-800 dark:text-orange-200">
              {selectedHolidays.map((h) => (
                <div key={h.name + h.scope}>
                  <span className="font-semibold">Festivo</span> · {h.name}{' '}
                  <span className="text-xs opacity-75">
                    ({SCOPE_LABELS[h.scope]}
                    {h.estimated ? ', estimado' : ''})
                  </span>
                </div>
              ))}
            </div>
          )}
          {selectedEvents.length === 0 ? (
            <Empty>
              Día libre.
              <Button size="sm" variant="ghost" onClick={() => setDraft({ dateKey: toDateKey(selected) })}>
                <Plus className="size-3.5" /> Añadir evento
              </Button>
            </Empty>
          ) : (
            <ul className="space-y-1.5">
              {selectedEvents.map((e) => (
                <li
                  key={e.id}
                  onClick={() => setDraft(e)}
                  className={cx(
                    'flex cursor-pointer items-start gap-3 rounded-lg border border-l-[3px] border-line bg-surface-2 px-3 py-2.5 hover:border-line-strong',
                    CATEGORY_STYLES[e.category].bar,
                  )}
                >
                  <div className="pt-0.5">
                    {e.category === 'holiday' || e.category === 'vacation' ? (
                      <span className={cx('mt-1 block size-[18px] rounded-[5px]', CATEGORY_STYLES[e.category].dot)} />
                    ) : (
                      <Check checked={e.is_completed} onChange={(v) => update('events', e.id, { is_completed: v })} label={`Completar ${e.title}`} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={cx('text-sm font-medium', e.is_completed && 'text-faint line-through')}>{e.title}</div>
                    <div className="num text-[11px] text-muted">
                      {timeLabel(e)} · {CATEGORY_STYLES[e.category].label}
                      {e.series_id && ' · serie'}
                    </div>
                    {e.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{e.description}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {checkable.length > 0 && (
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${(doneCount / checkable.length) * 100}%` }} />
            </div>
          )}
        </Card>
      </div>

      <EventModal draft={draft} onClose={() => setDraft(null)} />
    </>
  )
}

// ---------------------------------------------------------------- Month grid
function MonthGrid({
  cursor,
  selected,
  today,
  byDay,
  holidays,
  onSelect,
  onCreate,
  onOpen,
}: {
  cursor: Date
  selected: Date
  today: Date
  byDay: Map<string, CalendarEvent[]>
  holidays: Map<string, Holiday[]>
  onSelect: (d: Date) => void
  onCreate: (d: Date) => void
  onOpen: (e: CalendarEvent) => void
}) {
  const days = monthGrid(cursor)
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line bg-surface-2">
        {days.slice(0, 7).map((d) => (
          <div key={d.toISOString()} className="eyebrow py-2 text-center">
            <span className="sm:hidden">{fmtWeekday(d, 'narrow')}</span>
            <span className="hidden sm:inline">{fmtWeekday(d)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const events = byDay.get(toDateKey(d)) ?? []
          const hol = holidays.get(toDateKey(d))
          const outside = d.getMonth() !== cursor.getMonth()
          const isSel = isSameDay(d, selected)
          const isToday = isSameDay(d, today)
          return (
            <div
              key={d.toISOString()}
              onClick={() => onSelect(d)}
              onDoubleClick={() => onCreate(d)}
              className={cx(
                'group relative min-h-16 cursor-pointer border-line p-1 transition sm:min-h-24 sm:p-1.5',
                i % 7 !== 6 && 'border-r',
                i < 35 && 'border-b',
                hol ? 'bg-orange-500/[0.07]' : outside ? 'bg-surface-2/60' : 'bg-surface',
                isSel ? 'ring-2 ring-accent ring-inset' : 'hover:bg-surface-2',
              )}
              title={hol ? `Festivo: ${holidayLabel(hol)}` : undefined}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cx(
                    'num grid size-6 place-items-center rounded-md text-xs',
                    isToday ? 'bg-accent font-semibold text-accent-fg' : hol ? 'font-semibold text-orange-600 dark:text-orange-400' : outside ? 'text-faint' : 'text-fg',
                  )}
                >
                  {d.getDate()}
                </span>
                {hol && <span className="hidden min-w-0 flex-1 truncate px-1 text-[10px] font-medium text-orange-700 sm:block dark:text-orange-300">{holidayLabel(hol)}</span>}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCreate(d)
                  }}
                  className="hidden size-5 place-items-center rounded text-faint opacity-0 group-hover:opacity-100 hover:bg-line hover:text-fg sm:grid"
                  aria-label="Añadir evento"
                >
                  <Plus className="size-3" />
                </button>
              </div>

              {/* mobile: dots */}
              <div className="mt-1 flex flex-wrap gap-0.5 px-0.5 sm:hidden">
                {events.slice(0, 4).map((e) => (
                  <span key={e.id} className={cx('size-1.5 rounded-full', CATEGORY_STYLES[e.category].dot, e.is_completed && 'opacity-40')} />
                ))}
              </div>

              {/* desktop: chips */}
              <div className="mt-1 hidden space-y-0.5 sm:block">
                {events.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onOpen(e)
                    }}
                    className={cx(
                      'flex w-full items-center gap-1 truncate rounded border px-1 py-px text-left text-[11px] leading-4',
                      CATEGORY_STYLES[e.category].chip,
                      e.is_completed && 'line-through opacity-50',
                    )}
                  >
                    {!e.all_day && <span className="num shrink-0 opacity-70">{fmtTime(e.start_at)}</span>}
                    <span className="truncate">{e.title}</span>
                  </button>
                ))}
                {events.length > 3 && <div className="px-1 font-mono text-[10px] text-muted">+{events.length - 3} más</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- Week grid
function WeekGrid({
  days,
  today,
  byDay,
  holidays,
  onOpen,
  onCreate,
  onSelect,
}: {
  days: Date[]
  today: Date
  byDay: Map<string, CalendarEvent[]>
  holidays: Map<string, Holiday[]>
  onOpen: (e: CalendarEvent) => void
  onCreate: (d: Date, hour: number) => void
  onSelect: (d: Date) => void
}) {
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)
  const now = new Date()
  const nowOffset = ((now.getHours() - DAY_START) * 60 + now.getMinutes()) * (HOUR_PX / 60)

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-line bg-surface-2">
          <div />
          {days.map((d) => (
            <button key={d.toISOString()} onClick={() => onSelect(d)} className={cx('border-l border-line py-2 text-center', holidays.get(toDateKey(d)) && 'bg-orange-500/[0.07]')}>
              <div className="eyebrow">{fmtWeekday(d)}</div>
              <div className={cx('num mx-auto mt-0.5 grid size-7 place-items-center rounded-md text-sm', isSameDay(d, today) && 'bg-accent font-semibold text-accent-fg')}>
                {d.getDate()}
              </div>
            </button>
          ))}
        </div>

        {/* all-day row: holidays + all-day events */}
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-line">
          <div className="px-1 py-1.5 text-right font-mono text-[9px] leading-tight text-faint uppercase">Todo el día</div>
          {days.map((d) => {
            const hol = holidays.get(toDateKey(d))
            const allDay = (byDay.get(toDateKey(d)) ?? []).filter((e) => e.all_day)
            return (
              <div key={d.toISOString()} className="min-h-7 space-y-0.5 border-l border-line p-0.5">
                {hol && !allDay.some((e) => e.category === 'holiday') && (
                  <div className="truncate rounded border border-orange-500/30 bg-orange-500/14 px-1 text-[10px] leading-4 text-orange-700 dark:text-orange-300" title={holidayLabel(hol)}>
                    {holidayLabel(hol)}
                  </div>
                )}
                {allDay.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onOpen(e)}
                    className={cx('block w-full truncate rounded border px-1 text-left text-[10px] leading-4', CATEGORY_STYLES[e.category].chip)}
                  >
                    {e.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        <div className="scrollbar-thin max-h-[640px] overflow-y-auto">
          <div className="relative grid grid-cols-[52px_repeat(7,1fr)]" style={{ height: hours.length * HOUR_PX }}>
            {/* hour labels */}
            <div className="relative">
              {hours.map((h, i) => (
                <div key={h} className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-faint" style={{ top: i * HOUR_PX }}>
                  {i === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
                </div>
              ))}
            </div>

            {days.map((d) => {
              const events = (byDay.get(toDateKey(d)) ?? []).filter((e) => !e.all_day)
              const isToday = isSameDay(d, today)
              return (
                <div key={d.toISOString()} className={cx('relative border-l border-line', isToday && 'bg-accent/[0.03]', holidays.get(toDateKey(d)) && 'bg-orange-500/[0.04]')}>
                  {hours.map((h, i) => (
                    <div
                      key={h}
                      onClick={() => onCreate(d, h)}
                      className="absolute inset-x-0 cursor-pointer border-t border-line/70 hover:bg-surface-2"
                      style={{ top: i * HOUR_PX, height: HOUR_PX }}
                    />
                  ))}
                  {layoutDay(events).map(({ e, col, cols }) => {
                    const s = new Date(e.start_at)
                    const en = new Date(e.end_at)
                    const startMin = Math.max(0, (s.getHours() - DAY_START) * 60 + s.getMinutes())
                    const endMin = Math.min((DAY_END - DAY_START) * 60, (en.getHours() - DAY_START) * 60 + en.getMinutes())
                    const top = (startMin * HOUR_PX) / 60
                    const height = Math.max(20, ((endMin - startMin) * HOUR_PX) / 60 - 2)
                    return (
                      <button
                        key={e.id}
                        onClick={() => onOpen(e)}
                        className={cx(
                          'absolute overflow-hidden rounded-md border border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight backdrop-blur-sm',
                          CATEGORY_STYLES[e.category].chip,
                          CATEGORY_STYLES[e.category].bar,
                          e.is_completed && 'opacity-50',
                        )}
                        style={{ top, height, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}
                      >
                        <div className={cx('truncate font-medium', e.is_completed && 'line-through')}>{e.title}</div>
                        {height > 30 && (
                          <div className="num truncate opacity-75">
                            {fmtTime(e.start_at)}–{fmtTime(e.end_at)}
                          </div>
                        )}
                      </button>
                    )
                  })}
                  {isToday && nowOffset > 0 && nowOffset < hours.length * HOUR_PX && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowOffset }}>
                      <span className="-ml-1 size-2 rounded-full bg-rose-500" />
                      <span className="h-px flex-1 bg-rose-500" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Simple overlap layout: events that overlap share the column width. */
function layoutDay(events: CalendarEvent[]) {
  const sorted = [...events].sort((a, b) => a.start_at.localeCompare(b.start_at))
  const out: { e: CalendarEvent; col: number; cols: number }[] = []
  let cluster: { e: CalendarEvent; col: number }[] = []
  let clusterEnd = 0
  let colEnds: number[] = []

  const flush = () => {
    const cols = Math.max(1, colEnds.length)
    cluster.forEach((c) => out.push({ ...c, cols }))
    cluster = []
    colEnds = []
  }

  for (const e of sorted) {
    const s = new Date(e.start_at).getTime()
    const en = Math.max(new Date(e.end_at).getTime(), s + 20 * 60_000)
    if (cluster.length && s >= clusterEnd) flush()
    let col = colEnds.findIndex((end) => end <= s)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(en)
    } else colEnds[col] = en
    cluster.push({ e, col })
    clusterEnd = Math.max(clusterEnd, en)
  }
  flush()
  return out
}
