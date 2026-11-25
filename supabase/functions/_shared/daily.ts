/**
 * Summaries and alerts, run from the minute tick. Local times, each one can be
 * changed with a Supabase secret ("HH:MM", or "off" to disable it):
 *   MORNING_AT 07:30 · HOURS_AT 17:45 (HOURS_DAYS "1,2,3,4", 0 = Sunday)
 *   WORKOUT_AT 21:00 · WEEKLY_AT 20:00 (Sunday) · BILLS_AT 10:00 · BUDGET_ALERTS on/off
 *   HOLIDAY_REGION AN (no hours reminder on its holidays, nor on "Vacaciones" days)
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { addDay, billMessage, budgetAlert, chargesOn, dayMessage, hoursReminder, isDue, localMidnight, localNow, parseAt, runReminder, weekMessage } from './brief.ts'
import { isHoliday, isOfficialAnywhere, type HolidayScope } from './holidays.ts'
import { claim, loadBills, loadDay, loadMonth, loadPlan, loadWeek, release } from './load.ts'

export async function runDaily(db: SupabaseClient, owner: string, tz: string, env: (k: string) => string | undefined, send: (text: string) => Promise<boolean>, nowMs: number): Promise<number> {
  const now = localNow(nowMs, tz)
  let sent = 0
  /** Once per key. A failed send frees the key, so the next minute tries again. */
  const once = async (key: string, build: () => Promise<string | null> | string | null) => {
    if (!(await claim(db, key))) return
    try {
      const text = await build()
      if (!text) return
      if (!(await send(text))) throw new Error('telegram did not accept the message')
      sent++
    } catch (e) {
      await release(db, key)
      console.error('daily:', key, e)
    }
  }

  if (isDue(parseAt(env('MORNING_AT'), '07:30'), now)) await once(`morning:${now.date}`, async () => dayMessage(await loadDay(db, owner, now.date, tz), '☀️ Buenos días ·', tz))

  const days = (env('HOURS_DAYS') || '1,2,3,4').split(',').map(Number)
  if (days.includes(now.weekday) && isDue(parseAt(env('HOURS_AT'), '17:45'), now))
    await once(`hours:${now.date}`, async () => {
      const region = (env('HOLIDAY_REGION') || 'AN') as HolidayScope
      if (isHoliday(now.date, region)) return null
      const from = new Date(localMidnight(now.date, tz)).toISOString()
      const to = new Date(localMidnight(addDay(now.date, 1), tz)).toISOString()
      const [logs, off] = await Promise.all([
        db.from('work_logs').select('id', { count: 'exact', head: true }).eq('user_id', owner).eq('date', now.date),
        db.from('events').select('category').eq('user_id', owner).in('category', ['vacation', 'holiday']).lt('start_at', to).gt('end_at', from),
      ])
      if (logs.error) throw logs.error
      if (off.error) throw off.error
      if (logs.count) return null
      if ((off.data ?? []).some((e) => e.category === 'vacation' || !isOfficialAnywhere(now.date))) return null
      return hoursReminder()
    })

  if (isDue(parseAt(env('WORKOUT_AT'), '21:00'), now)) {
    const tomorrow = addDay(now.date, 1)
    for (const s of await loadPlan(db, owner, tomorrow, tomorrow)) await once(`run:${s.id}:${tomorrow}`, () => runReminder(s, 'Mañana'))
  }

  if (now.weekday === 0 && isDue(parseAt(env('WEEKLY_AT'), '20:00'), now)) await once(`week:${now.date}`, async () => weekMessage(await loadWeek(db, owner, now.date, tz)))

  if (isDue(parseAt(env('BILLS_AT'), '10:00'), now))
    for (const b of await loadBills(db, owner)) {
      const day = addDay(now.date, b.notify_days)
      if (chargesOn(b, day)) await once(`bill:${b.id}:${day}`, () => billMessage(b, b.notify_days))
    }

  if (!/^off$/i.test(env('BUDGET_ALERTS') ?? '') && now.minutes >= 480 && now.minutes < 1380 && now.minutes % 5 === 0) {
    const ym = now.date.slice(0, 7)
    for (const b of (await loadMonth(db, owner, now.date)).budgets) {
      const alert = budgetAlert(b.name, b.spent, b.limit)
      if (!alert) continue
      await once(`budget:${b.name}:${ym}:${alert.level}`, () => alert.text)
      // Straight past 100 %: the 80 % notice is no longer needed.
      if (alert.level === 100) await claim(db, `budget:${b.name}:${ym}:80`)
    }
  }
  return sent
}
