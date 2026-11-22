import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, CalendarClock, CheckSquare, FolderKanban, PiggyBank, Plus, Receipt, TrendingDown, TrendingUp } from 'lucide-react'
import { PageHeader, type ViewId } from '../components/Shell'
import { EventModal, type EventDraft } from '../components/EventModal'
import { Badge, Button, Card, Check, Empty, ProgressBar, Segmented, Stat, cx } from '../components/ui'
import { addDays, combineDateTime, daysUntil, fromDateKey, isSameDay, monthKey, startOfDay, toDateKey, toTimeValue } from '../lib/dates'
import { inMonth, summarise } from '../lib/finance'
import { fmtDate, fmtMoney, fmtMonth, fmtPct, fmtTime, fmtWeekday } from '../lib/format'
import { AREA_STYLES, CATEGORY_STYLES, STATUS_STYLES, TX_CATEGORY_SUGGESTIONS } from '../lib/theme'
import type { CalendarEvent } from '../lib/types'
import { useData } from '../state/data'
import { useToast } from '../state/toast'

export function Overview({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
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
  const doneToday = today.filter((e) => e.is_completed).length

  const hour = now.getHours()
  const greeting = hour < 6 ? 'Late night' : hour < 13 ? 'Good morning' : hour < 20 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <PageHeader eyebrow={fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} title={greeting} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today" value={`${doneToday}/${today.length}`} hint="events completed" icon={<CheckSquare className="size-4" />} />
        <Stat label="Active projects" value={active.length} hint={`${data.projects.filter((p) => p.status === 'completed').length} completed`} icon={<FolderKanban className="size-4" />} />
        <Stat
          label="Net · month"
          value={fmtMoney(month.net)}
          tone={month.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
          hint={fmtMonth(now)}
          icon={<Receipt className="size-4" />}
        />
        <Stat label="Savings rate" value={fmtPct(month.savingsRate)} hint="(income − expenses) / income" icon={<PiggyBank className="size-4" />} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------ agenda */}
        <Card
          className="lg:col-span-2"
          title="Agenda"
          action={
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setDraft({ dateKey: todayKey })}>
                <Plus className="size-3.5" /> Event
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onNavigate('calendar')}>
                Calendar <ArrowRight className="size-3.5" />
              </Button>
            </div>
          }
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="eyebrow mb-2">Today</div>
              {today.length === 0 ? (
                <Empty icon={<CalendarClock className="size-5" />}>Nothing scheduled today.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {today.map((e) => (
                    <AgendaRow key={e.id} e={e} onToggle={(v) => update('events', e.id, { is_completed: v })} onOpen={() => setDraft(e)} />
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="eyebrow mb-2">Next 7 days</div>
              {upcoming.length === 0 ? (
                <Empty>No upcoming events.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {upcoming.map((e) => (
                    <AgendaRow key={e.id} e={e} showDay onToggle={(v) => update('events', e.id, { is_completed: v })} onOpen={() => setDraft(e)} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>

        {/* ------------------------------------------------ quick capture */}
        <QuickCapture />

        {/* ------------------------------------------------ projects */}
        <Card
          className="lg:col-span-2"
          title="Active projects"
          action={
            <Button size="sm" variant="ghost" onClick={() => onNavigate('projects')}>
              Tracker <ArrowRight className="size-3.5" />
            </Button>
          }
        >
          {active.length === 0 ? (
            <Empty icon={<FolderKanban className="size-5" />}>No active projects.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {active.slice(0, 6).map((p) => {
                const tasks = data.project_tasks.filter((t) => t.project_id === p.id)
                const due = p.deadline ? daysUntil(p.deadline) : null
                return (
                  <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cx('size-1.5 rounded-full', STATUS_STYLES[p.status].dot)} />
                        <span className="truncate text-sm font-medium">{p.title}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 pl-3.5 text-xs text-muted">
                        <Badge className={AREA_STYLES[p.area]}>{p.area}</Badge>
                        <span className="num">
                          {tasks.filter((t) => t.is_done).length}/{tasks.length} tasks
                        </span>
                        {due !== null && (
                          <span className={cx('num', due < 0 ? 'text-rose-500' : due <= 7 ? 'text-amber-600 dark:text-amber-400' : '')}>
                            {due < 0 ? `${-due}d overdue` : due === 0 ? 'due today' : `${due}d left`}
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

        {/* ------------------------------------------------ month finance */}
        <Card
          title={`Finance · ${fmtDate(now, { month: 'long' })}`}
          action={
            <Button size="sm" variant="ghost" onClick={() => onNavigate('finance')}>
              Ledger <ArrowRight className="size-3.5" />
            </Button>
          }
        >
          <dl className="space-y-3 text-sm">
            <Row icon={<TrendingUp className="size-4 text-emerald-500" />} label="Income" value={fmtMoney(month.income)} />
            <Row icon={<TrendingDown className="size-4 text-rose-500" />} label="Expenses" value={fmtMoney(month.expense)} />
            <Row icon={<PiggyBank className="size-4 text-sky-500" />} label="Invested" value={fmtMoney(month.investment)} />
          </dl>
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex items-baseline justify-between text-xs text-muted">
              <span>Savings rate</span>
              <span className="num text-base font-semibold text-fg">{fmtPct(month.savingsRate)}</span>
            </div>
            <ProgressBar className="mt-2" value={Math.max(0, month.savingsRate)} tone="emerald" />
            {month.income > 0 && (
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-line">
                <div className="bg-rose-500" style={{ width: `${Math.min(100, (month.expense / month.income) * 100)}%` }} title="Expenses" />
                <div className="bg-sky-500" style={{ width: `${Math.min(100, (month.investment / month.income) * 100)}%` }} title="Invested" />
              </div>
            )}
          </div>
        </Card>
      </div>

      <EventModal draft={draft} onClose={() => setDraft(null)} />
    </>
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
      <Check checked={e.is_completed} onChange={onToggle} label={`Complete ${e.title}`} />
      <div className="min-w-0 flex-1">
        <div className={cx('truncate text-sm', e.is_completed && 'text-faint line-through')}>{e.title}</div>
        <div className="num text-[11px] text-muted">
          {showDay && `${fmtWeekday(s)} ${fmtDate(s, { day: '2-digit' })} · `}
          {fmtTime(e.start_at)}–{fmtTime(e.end_at)}
        </div>
      </div>
    </li>
  )
}

function QuickCapture() {
  const { create } = useData()
  const toast = useToast()
  const [mode, setMode] = useState<'task' | 'expense'>('task')
  const [title, setTitle] = useState('')
  const [time, setTime] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1, 0, 0, 0)
    return toTimeValue(d)
  })
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('groceries')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const todayKey = toDateKey(new Date())
    if (mode === 'task') {
      if (!title.trim()) return
      const start = combineDateTime(todayKey, time)
      const end = new Date(new Date(start).getTime() + 30 * 60_000).toISOString()
      const ok = await create('events', {
        title: title.trim(),
        description: '',
        start_at: start,
        end_at: end,
        category: 'personal',
        is_completed: false,
      })
      if (ok) toast('success', 'Task added to today')
    } else {
      const value = Number(amount.replace(',', '.'))
      if (!Number.isFinite(value) || value <= 0) return
      const ok = await create('transactions', {
        date: todayKey,
        type: 'expense',
        category: category.trim() || 'other',
        concept: title.trim(),
        amount: Math.round(value * 100) / 100,
        account: 'checking',
      })
      if (ok) toast('success', `Expense of ${fmtMoney(value)} logged`)
      setAmount('')
    }
    setTitle('')
  }

  return (
    <Card title="Quick capture" action={<Segmented value={mode} onChange={setMode} options={[{ value: 'task', label: 'Task' }, { value: 'expense', label: 'Expense' }]} />}>
      <form onSubmit={submit} className="space-y-3">
        <input
          className="field"
          placeholder={mode === 'task' ? 'e.g. Email supervisor' : 'Concept (e.g. Coffee beans)'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
        {mode === 'task' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Today at</span>
            <input type="time" className="field num w-36" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input className="field num" inputMode="decimal" placeholder="0.00 €" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
              {TX_CATEGORY_SUGGESTIONS.expense.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={mode === 'task' ? !title.trim() : !amount}>
          <Plus className="size-4" />
          {mode === 'task' ? 'Add task' : 'Log expense'}
        </Button>
        <p className="text-center font-mono text-[10px] text-faint">
          {mode === 'task' ? 'Creates a 30-min event in today’s agenda' : `Logged on ${fmtDate(fromDateKey(toDateKey(new Date())))}`}
        </p>
      </form>
    </Card>
  )
}
