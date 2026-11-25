import { useMemo } from 'react'
import { useData } from '../state/data'
import { agendaItems, type AgendaItem } from './agenda'
import { matchRuns } from './running'

/** Derived agenda items of the whole app, and the same by day. */
export function useAgenda(): { items: AgendaItem[]; byDay: Map<string, AgendaItem[]> } {
  const { data } = useData()
  const { run_plan, runs } = data
  const matched = useMemo(() => matchRuns(run_plan, runs), [run_plan, runs])
  const items = useMemo(() => agendaItems(data, { matched }), [data, matched])
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaItem[]>()
    for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i])
    return m
  }, [items])
  return { items, byDay }
}
