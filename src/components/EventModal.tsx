import { useMemo, useState } from 'react'
import { CalendarRange, Repeat, Trash2 } from 'lucide-react'
import { addDays, combineDateTime, fromDateKey, toDateKey, toTimeValue } from '../lib/dates'
import { fmtDate, uid } from '../lib/format'
import { holidayLabel, regionForCategory, REGION_OPTIONS } from '../lib/holidays'
import { useHolidayRules, useHolidays, useOffDays } from '../lib/useHolidays'
import { CATEGORY_STYLES } from '../lib/theme'
import { EVENT_CATEGORIES, type CalendarEvent, type EventCategory, type NewRow } from '../lib/types'
import { useData } from '../state/data'
import { useToast } from '../state/toast'
import { Button, Check, Field, Modal, cx } from './ui'

export type EventDraft = Partial<CalendarEvent> & { dateKey?: string }

/** Monday-first weekday chips; values are JS getDay() numbers. */
const WEEKDAYS: { label: string; day: number }[] = [
  { label: 'L', day: 1 },
  { label: 'M', day: 2 },
  { label: 'X', day: 3 },
  { label: 'J', day: 4 },
  { label: 'V', day: 5 },
  { label: 'S', day: 6 },
  { label: 'D', day: 0 },
]
const MAX_OCCURRENCES = 400

export function EventModal({ draft, onClose }: { draft: EventDraft | null; onClose: () => void }) {
  if (!draft) return null
  return <EventForm key={draft.id ?? `${draft.dateKey ?? ''}-${draft.start_at ?? ''}`} draft={draft} onClose={onClose} />
}

function EventForm({ draft, onClose }: { draft: EventDraft; onClose: () => void }) {
  const { data, create, createMany, update, remove, removeMany, updateWhere } = useData()
  const toast = useToast()
  const editing = Boolean(draft.id)
  const s0 = draft.start_at ? new Date(draft.start_at) : null
  const e0 = draft.end_at ? new Date(draft.end_at) : null
  const initialDate = s0 ? toDateKey(s0) : (draft.dateKey ?? toDateKey(new Date()))

  const [title, setTitle] = useState(draft.title ?? '')
  const [description, setDescription] = useState(draft.description ?? '')
  const [date, setDate] = useState(initialDate)
  const [start, setStart] = useState(s0 ? toTimeValue(s0) : '09:00')
  const [end, setEnd] = useState(e0 ? toTimeValue(e0) : '10:00')
  const [allDay, setAllDay] = useState(draft.all_day ?? false)
  const [category, setCategory] = useState<EventCategory>(draft.category ?? 'personal')
  const [done, setDone] = useState(draft.is_completed ?? false)

  // ---- repeat (only when creating)
  const [repeat, setRepeat] = useState(false)
  const [days, setDays] = useState<number[]>(() => [fromDateKey(initialDate).getDay()])
  const [until, setUntil] = useState(() => toDateKey(addDays(fromDateKey(initialDate), 27)))
  const [skipHolidays, setSkipHolidays] = useState(true)
  const [markHolidays, setMarkHolidays] = useState(true)

  // ---- series (only when editing an event that belongs to one)
  const series = useMemo(
    () => (draft.series_id ? data.events.filter((e) => e.series_id === draft.series_id).sort((a, b) => a.start_at.localeCompare(b.start_at)) : []),
    [data.events, draft.series_id],
  )
  const [applyToSeries, setApplyToSeries] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<null | 'one' | 'series' | 'future'>(null)

  // Holidays that apply depend on the category: work → national + Andalucía,
  // master → national + C. Valenciana, rest → configurable (see calendar settings).
  const [rules] = useHolidayRules()
  const region = regionForCategory(rules, category)
  const regionLabel = REGION_OPTIONS.find((o) => o.value === region)?.label ?? ''
  const holidays = useHolidays(fromDateKey(date), region)
  const holidaysUntil = useHolidays(fromDateKey(until), region)
  // Vacation days / local holidays also block work and other events, but not master classes.
  const includeEventDays = category !== 'master'
  const offFrom = useOffDays(fromDateKey(date), region, includeEventDays)
  const offUntil = useOffDays(fromDateKey(until), region, includeEventDays)

  const isVacationish = category === 'vacation' || category === 'holiday'
  const timesInvalid = !allDay && end < start

  /** Dates the repeat would produce, split into those to create and holidays to skip. */
  const plan = useMemo(() => {
    if (editing || !repeat) return null
    const from = fromDateKey(date)
    const to = fromDateKey(until)
    const create: string[] = []
    const skipped: { date: string; name: string; official: boolean }[] = []
    if (to < from || days.length === 0) return { create, skipped, tooMany: false }
    for (let d = from; d <= to && create.length + skipped.length <= MAX_OCCURRENCES; d = addDays(d, 1)) {
      if (!days.includes(d.getDay())) continue
      const key = toDateKey(d)
      const hs = holidays.get(key) ?? holidaysUntil.get(key)
      const off = offFrom.get(key) ?? offUntil.get(key)
      if (skipHolidays && hs) skipped.push({ date: key, name: holidayLabel(hs), official: true })
      else if (skipHolidays && off) skipped.push({ date: key, name: off, official: false })
      else create.push(key)
    }
    return { create, skipped, tooMany: create.length + skipped.length > MAX_OCCURRENCES }
  }, [editing, repeat, date, until, days, skipHolidays, holidays, holidaysUntil, offFrom, offUntil])

  const invalid =
    !title.trim() || timesInvalid || (plan !== null && (plan.create.length === 0 || plan.tooMany))

  const rowFor = (dateKey: string, overrides: Partial<NewRow<'events'>> = {}): NewRow<'events'> => ({
    title: title.trim(),
    description,
    start_at: allDay ? combineDateTime(dateKey, '00:00') : combineDateTime(dateKey, start),
    end_at: allDay ? combineDateTime(dateKey, '23:59') : combineDateTime(dateKey, end),
    category,
    is_completed: done,
    all_day: allDay,
    series_id: null,
    ...overrides,
  })

  async function save() {
    if (invalid) return
    onClose()

    // ------------------------------------------------ edit
    if (editing && draft.id) {
      const row = rowFor(date)
      await update('events', draft.id, { ...row, series_id: draft.series_id ?? null })
      if (applyToSeries && draft.series_id) {
        // Same title/description/category for the whole series; each keeps its own date and time.
        await updateWhere('events', 'series_id', draft.series_id, { title: row.title, description, category })
        toast('success', `Serie actualizada (${series.length} eventos)`)
      }
      return
    }

    // ------------------------------------------------ single
    if (!plan) {
      if (await create('events', rowFor(date))) toast('success', 'Evento creado')
      return
    }

    // ------------------------------------------------ repeat → series
    const seriesId = uid()
    const rows = plan.create.map((d) => rowFor(d, { series_id: seriesId }))
    // Mark skipped holidays with an all-day "Festivo" event (once per day).
    const existingHoliday = new Set(data.events.filter((e) => e.category === 'holiday').map((e) => toDateKey(new Date(e.start_at))))
    const holidayRows =
      skipHolidays && markHolidays
        ? plan.skipped
            .filter((h) => h.official && !existingHoliday.has(h.date))
            .map((h) =>
              rowFor(h.date, {
                title: `Festivo: ${h.name}`,
                description: '',
                category: 'holiday',
                all_day: true,
                is_completed: false,
                start_at: combineDateTime(h.date, '00:00'),
                end_at: combineDateTime(h.date, '23:59'),
                series_id: null,
              }),
            )
        : []
    const saved = await createMany('events', [...rows, ...holidayRows])
    if (saved) {
      const extra = plan.skipped.length ? ` · ${plan.skipped.length} festivo${plan.skipped.length === 1 ? '' : 's'} omitido${plan.skipped.length === 1 ? '' : 's'}` : ''
      toast('success', `${rows.length} eventos creados${extra}`)
    }
  }

  async function del(scope: 'one' | 'series' | 'future') {
    if (!draft.id) return
    onClose()
    if (scope === 'one') {
      await remove('events', draft.id)
      toast('success', 'Evento eliminado')
      return
    }
    const ids = (scope === 'series' ? series : series.filter((e) => e.start_at >= (draft.start_at ?? ''))).map((e) => e.id)
    await removeMany('events', ids)
    toast('success', `${ids.length} eventos eliminados`)
  }

  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))
  const dayHolidays = holidays.get(date)

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Editar evento' : 'Nuevo evento'}
      footer={
        confirmDelete ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="mr-auto text-xs text-muted">
              {confirmDelete === 'one' ? '¿Eliminar este evento?' : confirmDelete === 'series' ? `¿Eliminar los ${series.length} eventos de la serie?` : '¿Eliminar este y los siguientes de la serie?'}
            </span>
            <Button variant="danger" onClick={() => del(confirmDelete)}>
              Eliminar
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <>
            {editing && (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete('one')}>
                <Trash2 className="size-4" /> <span className="hidden sm:inline">Eliminar</span>
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save} disabled={invalid}>
              {editing ? 'Guardar' : plan ? `Crear ${plan.create.length} eventos` : 'Crear'}
            </Button>
          </>
        )
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Título">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="¿Qué tienes?" maxLength={200} />
        </Field>

        <div>
          <span className="label">Categoría</span>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => {
                  setCategory(c)
                  if (c === 'vacation' || c === 'holiday') setAllDay(true)
                }}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition',
                  category === c ? CATEGORY_STYLES[c].chip : 'border-line text-muted hover:text-fg',
                )}
              >
                <span className={cx('size-2 rounded-full', CATEGORY_STYLES[c].dot)} />
                {CATEGORY_STYLES[c].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={repeat ? 'Desde' : 'Fecha'} className="col-span-2 sm:col-span-1">
            <input type="date" className="field num" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          {!allDay && (
            <>
              <Field label="Inicio">
                <input type="time" className="field num" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Fin">
                <input type="time" className="field num" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </>
          )}
        </div>
        {timesInvalid && <p className="-mt-2 text-xs text-rose-500">La hora de fin debe ser posterior a la de inicio.</p>}
        {dayHolidays && !repeat && (
          <p className="-mt-2 text-xs text-orange-600 dark:text-orange-400">Ese día es festivo: {holidayLabel(dayHolidays)}</p>
        )}

        <label className="flex items-center gap-2.5 text-sm">
          <Check checked={allDay} onChange={setAllDay} label="Todo el día" />
          Todo el día
        </label>

        {/* ---------------------------------------------------- repeat */}
        {!editing && (
          <div className={cx('rounded-lg border p-3', repeat ? 'border-accent/50 bg-accent/[0.03]' : 'border-line')}>
            <label className="flex items-center gap-2.5 text-sm font-medium">
              <Check checked={repeat} onChange={setRepeat} label="Repetir" />
              <Repeat className="size-4 text-muted" /> Repetir varios días
            </label>
            {repeat && (
              <div className="mt-3 space-y-3">
                <div>
                  <span className="label">Días de la semana</span>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((w) => (
                      <button
                        type="button"
                        key={w.day}
                        onClick={() => toggleDay(w.day)}
                        className={cx(
                          'grid size-8 place-items-center rounded-md border text-xs font-semibold transition',
                          days.includes(w.day) ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted hover:text-fg',
                        )}
                        aria-pressed={days.includes(w.day)}
                      >
                        {w.label}
                      </button>
                    ))}
                    <button type="button" className="ml-1 text-[11px] text-accent hover:underline" onClick={() => setDays([1, 2, 3, 4, 5])}>
                      L–V
                    </button>
                    <button type="button" className="text-[11px] text-accent hover:underline" onClick={() => setDays([1, 2, 3, 4])}>
                      L–J
                    </button>
                  </div>
                </div>
                <Field label="Hasta (incluido)">
                  <input type="date" className="field num" value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
                </Field>
                <label className="flex items-center gap-2.5 text-sm">
                  <Check checked={skipHolidays} onChange={setSkipHolidays} label="Saltar festivos" />
                  Saltar festivos{includeEventDays ? ' y días de vacaciones' : ''}
                </label>
                <p className="-mt-1.5 pl-7 text-[11px] text-muted">Para {CATEGORY_STYLES[category].label}: {regionLabel.toLowerCase()}</p>
                {skipHolidays && (
                  <label className="flex items-center gap-2.5 pl-7 text-sm text-muted">
                    <Check checked={markHolidays} onChange={setMarkHolidays} label="Crear evento Festivo" />
                    Añadir un evento «Festivo» en los días omitidos
                  </label>
                )}

                {plan && (
                  <div className="rounded-md bg-surface-2 px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5 font-medium">
                      <CalendarRange className="size-3.5 text-accent" />
                      {plan.tooMany
                        ? `Demasiados días (máx. ${MAX_OCCURRENCES}). Acorta el rango.`
                        : `Se crearán ${plan.create.length} evento${plan.create.length === 1 ? '' : 's'}`}
                    </div>
                    {plan.skipped.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-orange-700 dark:text-orange-300">
                        {plan.skipped.map((h) => (
                          <li key={h.date}>
                            <span className="num">{fmtDate(fromDateKey(h.date), { weekday: 'short', day: '2-digit', month: 'short' })}</span> · {h.name} — omitido
                          </li>
                        ))}
                      </ul>
                    )}
                    {isVacationish && skipHolidays && (
                      <p className="mt-1.5 text-muted">Días de {CATEGORY_STYLES[category].label.toLowerCase()} que gastas: {plan.create.length}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------- series */}
        {editing && series.length > 1 && (
          <div className="rounded-lg border border-line p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Repeat className="size-4 text-muted" /> Parte de una serie de {series.length} eventos
            </div>
            <label className="mt-2 flex items-center gap-2.5">
              <Check checked={applyToSeries} onChange={setApplyToSeries} label="Aplicar a la serie" />
              Aplicar título, descripción y categoría a toda la serie
            </label>
            <p className="mt-1 text-xs text-muted">Los cambios de fecha y hora solo afectan a este evento.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="danger" onClick={() => setConfirmDelete('future')}>
                Eliminar este y siguientes
              </Button>
              <Button type="button" size="sm" variant="danger" onClick={() => setConfirmDelete('series')}>
                Eliminar toda la serie
              </Button>
            </div>
          </div>
        )}

        <Field label="Descripción">
          <textarea className="field" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notas, orden del día, enlaces…" />
        </Field>

        {!isVacationish && (
          <label className="flex items-center gap-2.5 text-sm">
            <Check checked={done} onChange={setDone} label="Completado" />
            Marcar como completado
          </label>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
