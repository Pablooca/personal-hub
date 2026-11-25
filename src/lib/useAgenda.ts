import { useMemo } from 'react'
import { useData } from '../state/data'
import { agendaItems, type AgendaItem } from './agenda'
import { chargeDates } from './budget'
import { matchRuns } from './running'

/** Derived agenda items of the whole app, and the same by day. */
export function useAgenda(): { items: AgendaItem[]; byDay: Map<string, AgendaItem[]> } {
  const { data } = useData()
  const { run_plan, runs } = data
  const matched = useMemo(() => matchRuns(run_plan, runs), [run_plan, runs])
  const bills = useMemo(() => {
    const now = Date.now()
    const from = new Date(now - 31 * 86_400_000).toISOString().slice(0, 10)
    const to = new Date(now + 92 * 86_400_000).toISOString().slice(0, 10)
    return data.bills.filter((b) => b.active).flatMap((b) => chargeDates(b, from, to).map((date) => ({ id: b.id, name: b.name, amount: b.amount, date })))
  }, [data.bills])
  const items = useMemo(() => agendaItems(data, { matched, bills }), [data, matched, bills])
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaItem[]>()
    for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i])
    return m
  }, [items])
  return { items, byDay }
}
