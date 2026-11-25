/** Reads what the messages need. Every query is limited to the owner. */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { addDay, chargesOn, localMidnight, type BillRow, type DayData, type PlanRow, type WeekData } from './brief.ts'
import { escapeHtml } from './telegram.ts'

// deno-lint-ignore no-explicit-any
async function rows<T>(q: PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as T[]
}
/** Moves between own accounts and opening balances are not spending. */
const INTERNAL = ['savings_withdrawal', 'opening_balance']
const round = (n: number) => Math.round(n * 100) / 100
const sum = (list: { amount: number }[]) => round(list.reduce((a, t) => a + Number(t.amount), 0))

export interface Tx {
  type: string
  category: string
  amount: number
  date: string
}
export const loadTxs = async (db: SupabaseClient, owner: string, from: string, to: string) =>
  (await rows<Tx>(db.from('transactions').select('type, category, amount, date').eq('user_id', owner).gte('date', from).lte('date', to).limit(1000))).filter((t) => !INTERNAL.includes(t.category))

export const loadPlan = (db: SupabaseClient, owner: string, from: string, to: string) =>
  rows<PlanRow>(db.from('run_plan').select('id, date, type, distance_km, description, blocks').eq('user_id', owner).gte('date', from).lte('date', to).order('date'))

export const loadBills = (db: SupabaseClient, owner: string) => rows<BillRow>(db.from('bills').select('id, name, amount, period, anchor_date, notify_days').eq('user_id', owner).eq('active', true))

type Assessment = DayData['assessments'][number]
async function loadAssessments(db: SupabaseClient, owner: string, from: number, to: number): Promise<Assessment[]> {
  const list = await rows<Omit<Assessment, 'subject'> & { subject: { name?: string } | { name?: string }[] | null }>(
    db.from('study_assessments').select('name, kind, due_at, subject:study_subjects(name)').eq('user_id', owner).eq('is_done', false).is('grade', null).gte('due_at', new Date(from).toISOString()).lt('due_at', new Date(to).toISOString()).order('due_at'),
  )
  return list.map((a) => ({ ...a, subject: (Array.isArray(a.subject) ? a.subject[0] : a.subject)?.name ?? 'Estudios' }))
}

export async function loadDay(db: SupabaseClient, owner: string, date: string, tz: string): Promise<DayData> {
  const from = localMidnight(date, tz)
  const to = localMidnight(addDay(date, 1), tz)
  const iso = (t: number) => new Date(t).toISOString()
  const [events, runs, tasks, assessments, tournaments, races, bills, review] = await Promise.all([
    rows<DayData['events'][number]>(db.from('events').select('title, start_at, end_at, all_day').eq('user_id', owner).lt('start_at', iso(to)).gt('end_at', iso(from)).order('all_day', { ascending: false }).order('start_at')),
    loadPlan(db, owner, date, date),
    rows<DayData['tasks'][number]>(db.from('project_tasks').select('title, due_date, priority').eq('user_id', owner).eq('is_done', false).lte('due_date', date).order('due_date', { ascending: false })),
    loadAssessments(db, owner, from, localMidnight(addDay(date, 4), tz)),
    rows<DayData['tournaments'][number]>(db.from('tournaments').select('name, game').eq('user_id', owner).eq('date', date)),
    rows<DayData['races'][number]>(db.from('race_goals').select('name, distance_km').eq('user_id', owner).eq('date', date)),
    loadBills(db, owner),
    db.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', owner).eq('category', 'uncategorized'),
  ])
  return { date, events, runs, tasks, assessments, tournaments, races, bills: bills.filter((b) => chargesOn(b, date)), review: review.count ?? 0 }
}

/** The week that contains `date` (Monday to Sunday). */
export async function loadWeek(db: SupabaseClient, owner: string, date: string, tz: string): Promise<WeekData> {
  const from = addDay(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7))
  const to = addDay(from, 6)
  const nextTo = addDay(from, 13)
  const [txs, plan, runs, logs, tournaments, upcoming, races, tasks, assessments] = await Promise.all([
    loadTxs(db, owner, addDay(from, -7), to),
    loadPlan(db, owner, from, nextTo),
    rows<{ date: string; distance_km: number; plan_id: string | null }>(db.from('runs').select('date, distance_km, plan_id').eq('user_id', owner).gte('date', from).lte('date', to)),
    rows<{ hours: number }>(db.from('work_logs').select('hours').eq('user_id', owner).gte('date', from).lte('date', to)),
    rows<{ id: string }>(db.from('tournaments').select('id').eq('user_id', owner).gte('date', from).lte('date', to)),
    rows<{ name: string; date: string }>(db.from('tournaments').select('name, date').eq('user_id', owner).gt('date', to).lte('date', nextTo).order('date')),
    rows<{ name: string; date: string }>(db.from('race_goals').select('name, date').eq('user_id', owner).gt('date', to).lte('date', nextTo)),
    db.from('project_tasks').select('id', { count: 'exact', head: true }).eq('user_id', owner).eq('is_done', false),
    loadAssessments(db, owner, localMidnight(addDay(to, 1), tz), localMidnight(addDay(nextTo, 1), tz)),
  ])
  const rounds = tournaments.length ? await rows<{ result: string }>(db.from('tournament_rounds').select('result').eq('user_id', owner).in('tournament_id', tournaments.map((t) => t.id))) : []
  const expenses = txs.filter((t) => t.type === 'expense')
  const now = expenses.filter((t) => t.date >= from)
  const byCategory = new Map<string, number>()
  for (const t of now) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + Number(t.amount))
  const planned = plan.filter((p) => p.date <= to)
  const next = plan.filter((p) => p.date > to)
  const day = (k: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${k}T00:00:00Z`))
  const count = (r: string) => rounds.filter((x) => x.result === r).length
  return {
    from,
    to,
    expense: sum(now),
    previousExpense: sum(expenses.filter((t) => t.date < from)),
    top: [...byCategory].map(([category, total]) => ({ category, total: round(total) })).sort((a, b) => b.total - a.total).slice(0, 3),
    kmDone: round(runs.reduce((a, r) => a + Number(r.distance_km), 0)),
    kmPlanned: round(planned.reduce((a, r) => a + Number(r.distance_km), 0)),
    sessionsDone: planned.filter((p) => runs.some((r) => r.plan_id === p.id || (!r.plan_id && r.date === p.date))).length,
    sessionsPlanned: planned.length,
    hours: round(logs.reduce((a, l) => a + Number(l.hours), 0)),
    rounds: { w: count('win'), l: count('loss'), t: count('tie') },
    nextWeek: [
      ...races.map((r) => ({ d: r.date, t: `🏁 ${escapeHtml(r.name)}` })),
      ...upcoming.map((t) => ({ d: t.date, t: `🏆 ${escapeHtml(t.name)}` })),
      ...assessments.map((a) => ({ d: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(a.due_at)), t: `🎓 ${escapeHtml(a.name)} (${escapeHtml(a.subject)})` })),
    ]
      .sort((a, b) => a.d.localeCompare(b.d))
      .map((x) => `${day(x.d)}: ${x.t}`)
      .concat(next.length ? [`👟 ${next.length} sesiones · ${next.reduce((a, p) => a + Number(p.distance_km), 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`] : []),
    openTasks: tasks.count ?? 0,
  }
}

export interface Budget {
  name: string
  limit: number
  spent: number
}
export async function loadMonth(db: SupabaseClient, owner: string, date: string): Promise<{ income: number; expense: number; budgets: Budget[] }> {
  const ym = date.slice(0, 7)
  const last = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const [txs, cats] = await Promise.all([
    loadTxs(db, owner, `${ym}-01`, last),
    rows<{ name: string; budget: number }>(db.from('categories').select('name, budget').eq('user_id', owner).eq('type', 'expense').gt('budget', 0)),
  ])
  const expenses = txs.filter((t) => t.type === 'expense')
  return {
    income: sum(txs.filter((t) => t.type === 'income')),
    expense: sum(expenses),
    budgets: cats.map((c) => ({ name: c.name, limit: Number(c.budget), spent: sum(expenses.filter((t) => t.category === c.name)) })).sort((a, b) => b.spent / b.limit - a.spent / a.limit),
  }
}

/** True the first time a key is seen. */
export async function claim(db: SupabaseClient, key: string): Promise<boolean> {
  const { data, error } = await db.from('message_log').upsert({ key }, { onConflict: 'key', ignoreDuplicates: true }).select('key')
  if (error) throw error
  return !!data?.length
}
export const release = async (db: SupabaseClient, key: string) => void (await db.from('message_log').delete().eq('key', key))
