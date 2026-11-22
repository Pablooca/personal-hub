import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Repository } from '../data/repository'
import { uid } from '../lib/format'
import type { Dataset, NewRow, TableName, Tables } from '../lib/types'
import { useToast } from './toast'

interface DataApi {
  data: Dataset
  loading: boolean
  error: string | null
  source: Repository['kind']
  create<K extends TableName>(table: K, row: NewRow<K>): Promise<Tables[K] | null>
  createMany<K extends TableName>(table: K, rows: NewRow<K>[]): Promise<Tables[K][] | null>
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Promise<void>
  remove(table: TableName, id: string): Promise<void>
  setPrimaryAccount(id: string): Promise<void>
  reload(): Promise<void>
}

const EMPTY: Dataset = { events: [], projects: [], project_tasks: [], transactions: [], categories: [], accounts: [], work_logs: [] }
const Ctx = createContext<DataApi | null>(null)

const errMsg = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Error inesperado')

/**
 * Single source of truth for the four tables. Writes are optimistic: the UI
 * updates instantly and rolls back if the repository (Supabase / local) fails.
 */
export function DataProvider({ repo, children }: { repo: Repository; children: ReactNode }) {
  const [data, setData] = useState<Dataset>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const dataRef = useRef(data)
  dataRef.current = data

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await repo.loadAll())
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [repo])

  useEffect(() => {
    void reload()
  }, [reload])

  // Realtime merge (other tabs / devices).
  useEffect(() => {
    if (!repo.subscribe) return
    return repo.subscribe((e) => {
      setData((d) => {
        const rows = d[e.table] as { id: string }[]
        if (e.kind === 'delete') {
          const next = { ...d, [e.table]: rows.filter((r) => r.id !== e.id) }
          if (e.table === 'projects') next.project_tasks = next.project_tasks.filter((t) => t.project_id !== e.id)
          return next
        }
        const exists = rows.some((r) => r.id === e.row.id)
        return {
          ...d,
          [e.table]: exists ? rows.map((r) => (r.id === e.row.id ? e.row : r)) : [...rows, e.row],
        }
      })
    })
  }, [repo])

  const create = useCallback<DataApi['create']>(
    async (table, row) => {
      const ts = new Date().toISOString()
      const full = { created_at: ts, ...(table === 'projects' ? { updated_at: ts } : {}), ...row, id: row.id ?? uid() } as unknown as Tables[typeof table]
      setData((d) => ({ ...d, [table]: [...d[table], full] }))
      try {
        const saved = await repo.insert(table, full)
        setData((d) => ({ ...d, [table]: (d[table] as { id: string }[]).map((r) => (r.id === full.id ? saved : r)) }))
        return saved
      } catch (e) {
        setData((d) => ({ ...d, [table]: (d[table] as { id: string }[]).filter((r) => r.id !== full.id) }))
        toast('error', `No se ha podido guardar: ${errMsg(e)}`)
        return null
      }
    },
    [repo, toast],
  )

  const createMany = useCallback<DataApi['createMany']>(
    async (table, rows) => {
      if (rows.length === 0) return []
      const ts = new Date().toISOString()
      const full = rows.map((row) => ({ created_at: ts, ...(table === 'projects' ? { updated_at: ts } : {}), ...row, id: row.id ?? uid() })) as unknown as Tables[typeof table][]
      const ids = new Set(full.map((r) => r.id))
      setData((d) => ({ ...d, [table]: [...d[table], ...full] }))
      try {
        const saved = await repo.insertMany(table, full)
        const byId = new Map(saved.map((r) => [r.id, r]))
        setData((d) => ({ ...d, [table]: (d[table] as { id: string }[]).map((r) => byId.get(r.id) ?? r) }))
        return saved
      } catch (e) {
        setData((d) => ({ ...d, [table]: (d[table] as { id: string }[]).filter((r) => !ids.has(r.id)) }))
        toast('error', `No se ha podido guardar: ${errMsg(e)}`)
        return null
      }
    },
    [repo, toast],
  )

  const update = useCallback<DataApi['update']>(
    async (table, id, patch) => {
      const prev = (dataRef.current[table] as { id: string }[]).find((r) => r.id === id)
      if (!prev) return
      const optimistic = { ...prev, ...patch, ...(table === 'projects' ? { updated_at: new Date().toISOString() } : {}) }
      const swap = (row: object) =>
        setData((d) => ({ ...d, [table]: (d[table] as { id: string }[]).map((r) => (r.id === id ? row : r)) }))
      swap(optimistic)
      try {
        swap(await repo.update(table, id, patch))
      } catch (e) {
        swap(prev)
        toast('error', `No se ha podido actualizar: ${errMsg(e)}`)
      }
    },
    [repo, toast],
  )

  const remove = useCallback<DataApi['remove']>(
    async (table, id) => {
      const snapshot = dataRef.current
      setData((d) => {
        const next = { ...d, [table]: (d[table] as { id: string }[]).filter((r) => r.id !== id) }
        if (table === 'projects') next.project_tasks = d.project_tasks.filter((t) => t.project_id !== id)
        if (table === 'project_tasks') next.work_logs = d.work_logs.map((w) => (w.task_id === id ? { ...w, task_id: null } : w))
        return next
      })
      try {
        await repo.remove(table, id)
      } catch (e) {
        setData(snapshot)
        toast('error', `No se ha podido eliminar: ${errMsg(e)}`)
      }
    },
    [repo, toast],
  )

  const setPrimaryAccount = useCallback<DataApi['setPrimaryAccount']>(
    async (id) => {
      const snapshot = dataRef.current.accounts
      setData((d) => ({ ...d, accounts: d.accounts.map((a) => ({ ...a, is_primary: a.id === id })) }))
      try {
        await repo.setPrimaryAccount(id)
      } catch (e) {
        setData((d) => ({ ...d, accounts: snapshot }))
        toast('error', `No se ha podido cambiar la cuenta principal: ${errMsg(e)}`)
      }
    },
    [repo, toast],
  )

  const value = useMemo<DataApi>(
    () => ({ data, loading, error, source: repo.kind, create, createMany, update, remove, setPrimaryAccount, reload }),
    [data, loading, error, repo.kind, create, createMany, update, remove, setPrimaryAccount, reload],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData must be used inside <DataProvider>')
  return v
}
