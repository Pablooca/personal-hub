import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, CalendarClock, CheckSquare, FolderKanban, PiggyBank, Plus, Receipt, TrendingDown, TrendingUp } from 'lucide-react'
import { PageHeader, type ViewId } from '../components/Shell'
import { EventModal, type EventDraft } from '../components/EventModal'
import { Badge, Button, Card, Check, Empty, ProgressBar, Segmented, Stat, cx } from '../components/ui'
import { addDays, daysUntil, fromDateKey, isSameDay, monthKey, startOfDay, toDateKey } from '../lib/dates'
import { inMonth, summarise, yearToDate } from '../lib/finance'
import { capitalize, fmtDate, fmtMoney, fmtMonth, fmtPct, fmtTime, fmtWeekday } from '../lib/format'
import { AREA_LABELS, AREA_STYLES, CATEGORY_STYLES, SOURCE_STYLES, STATUS_STYLES } from '../lib/theme'
import { categoryLabel, categoryNames } from '../lib/categories'
import { SOURCE_LABELS, type AgendaItem } from '../lib/agenda'
import { useAgenda } from '../lib/useAgenda'
import { TaskForm } from '../components/QuickAdd'
import { useNav } from '../state/nav'
import { useTaskActions } from '../state/useTasks'
import { parseAmount, usePrimaryAccountName } from './finance/TxForms'
import { LogHoursModal, type LogDraft } from '../components/LogHoursModal'
import { fmtHours, hoursByDay, inLogMonth, monthDays, readDailyTarget } from '../lib/worklog'
import { useOffDays } from '../lib/useHolidays'
import { Clock } from 'lucide-react'
import type { CalendarEvent } from '../lib/types'
import { useData } from '../state/data'
import { useToast } from '../state/toast'

export function Overview({ onNavigate, onOpenProject }: { onNavigate: (v: ViewId) => void; onOpenProject: (id: string) => void }) {
  const { data, update } = useData()
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const now = new Date()
  const todayKey = toDateKey(now)

  const today = useMemo(
    () => data.events.filter((e) => isSameDay(new Date(e.start_at), now)).sort((a, b) => a.start_at.localeCompare(b.start_at)),
    [data.events, todayKey],
  )

  const upcoming = useMemo(() => {
    const from = addDays(startOfDay(now), 1).getTime()
    const to = addDays(startOfDay(now), 8).getTime()
    return data.events
      .filter((e) => {
        const t = new Date(e.start_at).getTime()
        return t >= from && t < to
      })
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .slice(0, 6)
  }, [data.events, todayKey])

  const active = useMemo(
    () =>
      data.projects
        .filter((p) => p.status === 'in_progress' || p.status === 'review')
        .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999')),
    [data.projects],
  )

  const ym = monthKey(now)
  const month = useMemo(() => summarise(inMonth(data.transactions, ym)), [data.transactions, ym])
  const ytd = useMemo(() => summarise(yearToDate(data.transactions, ym)), [data.transactions, ym])
  const doneToday = today.filter((e) => e.is_completed).length

  const hour = now.getHours()
  const greeting = hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'

  const { items } = useAgenda()
  const { open } = useNav()
  const { setStatus } = useTaskActions()
  const tomorrowKey = toDateKey(addDays(startOfDay(now), 1))
  const weekKey = toDateKey(addDays(startOfDay(now), 7))
  const todayItems = items.filter((i) => i.date === todayKey)
  // Late tasks and deliveries never get lost; past runs and tournaments don't nag.
  const weekAgo = toDateKey(addDays(startOfDay(now), -7))
  // A missed study task stays visible for a week; after that it lives in the plan.
  const late = items.filter((i) => i.date < todayKey && !i.done && (i.source === 'task' || i.source === 'study' || (i.source === 'plan' && i.date >= weekAgo && !/^(Colchón|Descanso)/.test(i.detail))))
  const soon = items.filter((i) => i.date > todayKey && i.date <= weekKey && !i.done)
  const total = today.length + todayItems.length
  const done = doneToday + todayItems.filter((i) => i.done).length

  function toggleItem(i: AgendaItem, v: boolean) {
    if (i.target.kind === 'task') {
      const t = data.project_tasks.find((x) => x.id === i.target.id)
      if (t) void setStatus(t, v ? 'done' : 'todo')
    } else if (i.source === 'study') void update('study_assessments', i.key.slice('study-'.length), { is_done: v })
    else if (i.source === 'plan') void update('study_plan_items', i.key.slice('plan-'.length), { is_done: v })
  }
  const canToggle = (i: AgendaItem) => i.target.kind === 'task' || i.source === 'study' || i.source === 'plan'

  const nextRace = data.race_goals.filter((g) => g.date >= todayKey).sort((a, b) => a.date.localeCompare(b.date))[0]
  const nextTournament = data.tournaments.filter((t) => t.date >= todayKey && t.status !== 'finished' && t.status !== 'dropped').sort((a, b) => a.date.localeCompare(b.date))[0]
  const nextExam = items.find((i) => i.source === 'study' && i.date >= todayKey && !i.done)
  const inDays = (k: string) => {
    const n = daysUntil(k)
    return n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`
  }

  return (
    <>
      <PageHeader keep eyebrow={fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' })} title={greeting} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Hoy" value={`${done}/${total}`} hint={late.length ? `${late.length} ${late.length === 1 ? 'pendiente' : 'pendientes'} de días anteriores` : total ? 'completado' : 'nada previsto'} icon={<CheckSquare className="size-4" />} />
        <Stat label="Proyectos" value={active.length} hint={`activos · ${data.projects.filter((p) => p.status === 'completed').length} completados`} icon={<FolderKanban className="size-4" />} />
        <Stat
          label="Balance"
          value={fmtMoney(month.net)}
          tone={month.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}
          hint={capitalize(fmtMonth(now))}
          icon={<Receipt className="size-4" />}
        />
        <Stat label="Ahorro" value={fmtPct(ytd.savingsRate)} hint={`en ${now.getFullYear()} · este mes ${fmtPct(month.savingsRate)}`} icon={<PiggyBank className="size-4" />} />
      </div>

      {(nextExam || nextRace || nextTournament) && (
        <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {nextExam && <Upcoming color="bg-violet-500" label={nextExam.title} detail={`${nextExam.detail} · ${inDays(nextExam.date)}`} onClick={() => open(nextExam.target)} />}
          {nextRace && <Upcoming color="bg-rose-500" label={nextRace.name} detail={`Carrera · ${inDays(nextRace.date)}`} onClick={() => onNavigate('running')} />}
          {nextTournament && <Upcoming color="bg-yellow-500" label={nextTournament.name} detail={`${nextTournament.game.toUpperCase()} · ${inDays(nextTournament.date)}`} onClick={() => open({ kind: 'tournament', id: nextTournament.id })} />}
        </div>
      )}

      <HoursNudge onNavigate={onNavigate} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------ today */}
        <Card
          className="lg:col-span-2"
          title="Mi día"
          action={
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setDraft({ dateKey: todayKey })}>
                <Plus className="size-3.5" /> Evento
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onNavigate('calendar')}>
                Agenda <ArrowRight className="size-3.5" />
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="min-w-0">
              <div className="eyebrow mb-2">Hoy</div>
              {total + late.length === 0 ? (
                <Empty icon={<CalendarClock className="size-5" />}>Nada programado para hoy.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {today.map((e) => (
                    <AgendaRow key={e.id} e={e} onToggle={(v) => update('events', e.id, { is_completed: v })} onOpen={() => setDraft(e)} />
                  ))}
                  {todayItems.map((i) => (
                    <ItemRow key={i.key} i={i} onToggle={canToggle(i) ? (v) => toggleItem(i, v) : undefined} onOpen={() => open(i.target)} />
                  ))}
                </ul>
              )}
              {late.length > 0 && (
                <>
                  <div className="eyebrow mt-4 mb-2 text-rose-700 dark:text-rose-400">Atrasado</div>
                  <ul className="space-y-1.5">
                    {late.slice(0, 5).map((i) => (
                      <ItemRow key={i.key} i={i} showDay onToggle={canToggle(i) ? (v) => toggleItem(i, v) : undefined} onOpen={() => open(i.target)} />
                    ))}
                  </ul>
                  {late.length > 5 && <p className="mt-1.5 text-xs text-muted">y {late.length - 5} más</p>}
                </>
              )}
            </div>
            <div className="min-w-0">
              <div className="eyebrow mb-2">Próximos 7 días</div>
              {upcoming.length + soon.length === 0 ? (
                <Empty>No hay nada próximo.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {[...upcoming.map((e) => ({ at: e.start_at, day: toDateKey(new Date(e.start_at)), e, i: null })), ...soon.map((i) => ({ at: `${i.date}T${i.time ?? '23:59'}`, day: i.date, e: null, i }))]
                    .sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at))
                    .slice(0, 9)
                    .map(({ e, i }) =>
                      e ? (
                        <AgendaRow key={e.id} e={e} showDay onToggle={(v) => update('events', e.id, { is_completed: v })} onOpen={() => setDraft(e)} />
                      ) : (
                        <ItemRow key={i!.key} i={i!} showDay tomorrow={tomorrowKey} onToggle={canToggle(i!) ? (v) => toggleItem(i!, v) : undefined} onOpen={() => open(i!.target)} />
                      ),
                    )}
                </ul>
              )}
            </div>
          </div>
        </Card>

        {/* ------------------------------------------------ side column */}
        <div className="flex flex-col gap-4">
        <QuickCapture />
        <MonthFinance month={month} now={now} onNavigate={onNavigate} />
        </div>

        {/* ------------------------------------------------ projects */}
        <Card
          className="lg:col-span-3"
          title="Proyectos activos"
          action={
            <Button size="sm" variant="ghost" onClick={() => onNavigate('projects')}>
              Proyectos <ArrowRight className="size-3.5" />
            </Button>
          }
        >
          {active.length === 0 ? (
            <Empty icon={<FolderKanban className="size-5" />}>No hay proyectos activos.</Empty>
          ) : (
            <ul className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
              {active.slice(0, 6).map((p) => {
                const tasks = data.project_tasks.filter((t) => t.project_id === p.id)
                const due = p.deadline ? daysUntil(p.deadline) : null
                return (
                  <li
                    key={p.id}
                    onClick={() => onOpenProject(p.id)}
                    className="-mx-2 flex cursor-pointer flex-col gap-2 rounded-lg px-2 py-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cx('size-1.5 rounded-full', STATUS_STYLES[p.status].dot)} />
                        <span className="truncate text-sm font-medium">{p.title}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 pl-3.5 text-xs text-muted">
                        <Badge className={AREA_STYLES[p.area]}>{AREA_LABELS[p.area]}</Badge>
                        <span className="num">
                          {tasks.filter((t) => t.is_done).length}/{tasks.length} tareas
                        </span>
                        {due !== null && (
                          <span className={cx('num', due < 0 ? 'text-rose-500' : due <= 7 ? 'text-amber-700 dark:text-amber-400' : '')}>
                            {due < 0 ? `${-due} d de retraso` : due === 0 ? 'vence hoy' : `quedan ${due} d`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-3.5 sm:w-48 sm:pl-0">
                      <ProgressBar value={p.progress} />
                      <span className="num w-9 text-right text-xs text-muted">{p.progress}%</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

      </div>

      <EventModal draft={draft} onClose={() => setDraft(null)} />
    </>
  )
}

function MonthFinance({ month, now, onNavigate }: { month: ReturnType<typeof summarise>; now: Date; onNavigate: (v: ViewId) => void }) {
  return (
        <Card
          title={`Finanzas · ${capitalize(fmtDate(now, { month: 'long' }))}`}
          action={
            <Button size="sm" variant="ghost" onClick={() => onNavigate('finance')}>
              Finanzas <ArrowRight className="size-3.5" />
            </Button>
          }
        >
          <dl className="space-y-3 text-sm">
            <Row icon={<TrendingUp className="size-4 text-emerald-500" />} label="Ingresos" value={fmtMoney(month.income)} />
            <Row icon={<TrendingDown className="size-4 text-rose-500" />} label="Gastos" value={fmtMoney(month.expense)} />
            <Row icon={<PiggyBank className="size-4 text-sky-500" />} label="Ahorrado" value={fmtMoney(month.investment)} />
            {month.withdrawn > 0 && <Row icon={<PiggyBank className="size-4 text-faint" />} label="Retirado del ahorro" value={fmtMoney(month.withdrawn)} />}
          </dl>
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex items-baseline justify-between text-xs text-muted">
              <span>Tasa de ahorro (mes)</span>
              <span className="num text-base font-semibold text-fg">{fmtPct(month.savingsRate)}</span>
            </div>
            <ProgressBar className="mt-2" value={Math.max(0, month.savingsRate)} tone="emerald" />
            {month.income > 0 && (
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-line">
                <div className="bg-rose-500" style={{ width: `${Math.min(100, (month.expense / month.income) * 100)}%` }} title="Gastos" />
                <div className="bg-sky-500" style={{ width: `${Math.min(100, (month.investment / month.income) * 100)}%` }} title="Ahorrado" />
              </div>
            )}
          </div>
        </Card>
  )
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-2 text-muted">
        {icon}
        {label}
      </dt>
      <dd className="num font-medium">{value}</dd>
    </div>
  )
}

const Upcoming = ({ color, label, detail, onClick }: { color: string; label: string; detail: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="flex min-h-12 max-w-72 shrink-0 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-left transition hover:border-line-strong">
    <span className={cx('h-7 w-1 shrink-0 rounded-full', color)} aria-hidden />
    <span className="min-w-0">
      <span className="block truncate text-sm font-medium">{label}</span>
      <span className="block truncate text-xs text-muted">{detail}</span>
    </span>
  </button>
)

function ItemRow({ i, onToggle, onOpen, showDay, tomorrow }: { i: AgendaItem; onToggle?: (v: boolean) => void; onOpen: () => void; showDay?: boolean; tomorrow?: string }) {
  const d = fromDateKey(i.date)
  const day = i.date === tomorrow ? 'mañana' : `${fmtWeekday(d)} ${fmtDate(d, { day: '2-digit' })}`
  return (
    <li className={cx('flex items-center gap-3 rounded-lg border border-l-[3px] border-line bg-surface-2 px-3 transition hover:border-line-strong', SOURCE_STYLES[i.source].bar)}>
      {onToggle ? <Check checked={i.done} onChange={onToggle} label={`Completar ${i.title}`} /> : <span className={cx('grid size-[18px] shrink-0 place-items-center')} aria-hidden><span className={cx('size-2 rounded-full', SOURCE_STYLES[i.source].dot)} /></span>}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-2 text-left">
        <span className={cx('block truncate text-sm', i.done && 'text-faint line-through')}>{i.title}</span>
        <span className="num block truncate text-[11px] text-muted">{[showDay && day, i.time, i.detail || SOURCE_LABELS[i.source]].filter(Boolean).join(' · ')}</span>
      </button>
    </li>
  )
}

function AgendaRow({ e, onToggle, onOpen, showDay }: { e: CalendarEvent; onToggle: (v: boolean) => void; onOpen: () => void; showDay?: boolean }) {
  const s = new Date(e.start_at)
  return (
    <li
      onClick={onOpen}
      className={cx(
        'flex cursor-pointer items-center gap-3 rounded-lg border border-l-[3px] border-line bg-surface-2 px-3 py-2 transition hover:border-line-strong',
        CATEGORY_STYLES[e.category].bar,
      )}
    >
      <Check checked={e.is_completed} onChange={onToggle} label={`Completar ${e.title}`} />
      <div className="min-w-0 flex-1">
        <div className={cx('truncate text-sm', e.is_completed && 'text-faint line-through')}>{e.title}</div>
        <div className="num text-[11px] text-muted">
          {showDay && `${fmtWeekday(s)} ${fmtDate(s, { day: '2-digit' })} · `}
          {e.all_day ? 'Todo el día' : `${fmtTime(e.start_at)}–${fmtTime(e.end_at)}`}
        </div>
      </div>
    </li>
  )
}

function QuickCapture() {
  const { data, create } = useData()
  const toast = useToast()
  const [mode, setMode] = useState<'task' | 'expense'>('task')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const primary = usePrimaryAccountName()
  const expenseCategories = categoryNames(data, 'expense')
  const [category, setCategory] = useState(() => expenseCategories[0] ?? 'other')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = parseAmount(amount)
    if (value === null) return
    const ok = await create('transactions', { date: toDateKey(new Date()), type: 'expense', category: category.trim() || 'other', concept: title.trim(), amount: value, account: primary })
    if (ok) toast('success', `Gasto de ${fmtMoney(value)} registrado`)
    setAmount('')
    setTitle('')
  }

  return (
    <Card title="Captura rápida" action={<Segmented value={mode} onChange={setMode} options={[{ value: 'task', label: 'Tarea' }, { value: 'expense', label: 'Gasto' }]} />}>
      {mode === 'task' ? (
        <TaskForm compact />
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className="field" aria-label="Concepto" placeholder="Concepto (p. ej. Café)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <div className="grid grid-cols-2 gap-2">
            <input className="field num" aria-label="Importe" inputMode="decimal" placeholder="0,00 €" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className="field" aria-label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)}>
              {expenseCategories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="primary" className="w-full" disabled={parseAmount(amount) === null}>
            <Plus className="size-4" /> Registrar gasto
          </Button>
          <p className="text-center font-mono text-[10px] text-faint">Hoy · cuenta «{primary}»</p>
        </form>
      )}
    </Card>
  )
}

/** Reminder strip: today's logged hours and forgotten days this month. */
function HoursNudge({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const { data } = useData()
  const [draft, setDraft] = useState<LogDraft | null>(null)
  const now = new Date()
  const target = readDailyTarget()
  const perDay = hoursByDay(inLogMonth(data.work_logs, now))
  const todayKey = toDateKey(now)
  const todayH = perDay.get(todayKey) ?? 0
  const offDays = useOffDays(now)
  const days = monthDays(now, offDays)
  const missing = days.filter((d) => !d.rest && d.key < todayKey && !perDay.get(d.key)).length
  const todayInfo = days.find((d) => d.key === todayKey)
  const weekend = todayInfo?.rest ?? false
  if (weekend && missing === 0) return null

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
      <Clock className="size-4 text-accent" />
      {!weekend && (
        <span>
          Hoy llevas <span className="num font-semibold">{fmtHours(todayH)}</span>
          <span className="text-muted"> de {fmtHours(target)} registradas</span>
        </span>
      )}
      {missing > 0 && (
        <button onClick={() => onNavigate('hours')} className="text-amber-800 hover:underline dark:text-amber-300">
          {missing} {missing === 1 ? 'día' : 'días'} sin registrar este mes
        </button>
      )}
      <Button size="sm" variant="primary" className="ml-auto" onClick={() => setDraft({ date: todayKey })}>
        <Plus className="size-3.5" /> Registrar horas
      </Button>
      <LogHoursModal draft={draft} onClose={() => setDraft(null)} />
    </div>
  )
}
