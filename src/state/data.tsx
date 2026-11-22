import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { completeDataset, emptyDataset, type Repository } from '../data/repository'
import { uid } from '../lib/format'
import type { Dataset, NewRow, TableName, Tables } from '../lib/types'
import { useToast } from './toast'

interface DataApi {
  data: Dataset
  loading: boolean
  error: string | null
  /** Tables the database doesn't have yet (schema.sql needs re-running). */
  missingTables: TableName[]
  source: Repository['kind']
  create<K extends TableName>(table: K, row: NewRow<K>): Promise<Tables[K] | null>
  createMany<K extends TableName>(table: K, rows: NewRow<K>[]): Promise<Tables[K][] | null>
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Promise<void>
  remove(table: TableName, id: string): Promise<void>
  removeMany(table: TableName, ids: string[]): Promise<void>
  updateWhere<K extends TableName>(table: K, column: keyof Tables[K] & string, value: string, patch: Partial<Tables[K]>): Promise<void>
  setPrimaryAccount(id: string): Promise<void>
  reload(): Promise<void>
}

const Ctx = createContext<DataApi | null>(null)

const errMsg = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Error inesperado')

/**
 * Single source of truth for the four tables. Writes are optimistic: the UI
 * updates instantly and rolls back if the repository (Supabase / local) fails.
 */
export function DataProvider({ repo, children }: { repo: Repository; children: ReactNode }) {
  const [data, setDataRaw] = useState<Dataset>(emptyDataset)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingTables, setMissingTables] = useState<TableName[]>([])
  // Every state update goes through completeDataset so no table can ever be undefined.
  const setData = useCallback((next: Dataset | ((d: Dataset) => Dataset)) => {
    setDataRaw((d) => completeDataset(typeof next === 'function' ? next(completeDataset(d)) : next))
  }, [])
  const toast = useToast()
  // Read side is normalised too (covers state kept across hot reloads by an older version).
  const safeData = useMemo(() => completeDataset(data), [data])
  const dataRef = useRef(safeData)
  dataRef.current = safeData

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await repo.loadAll()
      setData(res.data)
      setMissingTables(res.missing)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [repo, setData])

  useEffect(() => {
    void reload()
  }, [reload])

  // Realtime merge (other tabs / devices).
  useEffect(() => {
    if (!repo.subscribe) return
    return repo.subscribe((e) => {
      setData((d) => {
        const rows = (d[e.table] ?? []) as { id: string }[]
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

  const removeMany = useCallback<DataApi['removeMany']>(
    async (table, ids) => {
      if (!ids.length) return
      const snapshot = dataRef.current
      const set = new Set(ids)
      setData((d) => ({ ...d, [table]: (d[table] as { id: string }[]).filter((r) => !set.has(r.id)) }))
      try {
        await repo.removeMany(table, ids)
      } catch (e) {
        setData(snapshot)
        toast('error', `No se ha podido eliminar: ${errMsg(e)}`)
      }
    },
    [repo, toast, setData],
  )

  const updateWhere = useCallback<DataApi['updateWhere']>(
    async (table, column, value, patch) => {
      const snapshot = dataRef.current
      setData((d) => ({
        ...d,
        [table]: (d[table] as unknown as Record<string, unknown>[]).map((r) => (r[column] === value ? { ...r, ...patch } : r)),
      }))
      try {
        await repo.updateWhere(table, column, value, patch)
      } catch (e) {
        setData(snapshot)
        toast('error', `No se ha podido actualizar: ${errMsg(e)}`)
      }
    },
    [repo, toast, setData],
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
    () => ({ data: safeData, loading, error, missingTables, source: repo.kind, create, createMany, update, remove, removeMany, updateWhere, setPrimaryAccount, reload }),
    [safeData, loading, error, missingTables, repo.kind, create, createMany, update, remove, removeMany, updateWhere, setPrimaryAccount, reload],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData must be used inside <DataProvider>')
  return v
}
