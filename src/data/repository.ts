import type { SupabaseClient } from '@supabase/supabase-js'
import type { Dataset, TableName, Tables } from '../lib/types'
import { buildDemoDataset } from './demoSeed'

export type ChangeEvent =
  | { table: TableName; kind: 'upsert'; row: Tables[TableName] }
  | { table: TableName; kind: 'delete'; id: string }

/**
 * Storage abstraction. The UI never talks to Supabase or localStorage directly:
 * it receives one of these, so Demo Mode and the real database share every code path.
 */
/** Result of a full load. `missing` lists tables the database doesn't have yet. */
export interface LoadResult {
  data: Dataset
  missing: TableName[]
}

export interface Repository {
  readonly kind: 'supabase' | 'local'
  loadAll(): Promise<LoadResult>
  insert<K extends TableName>(table: K, row: Tables[K]): Promise<Tables[K]>
  insertMany<K extends TableName>(table: K, rows: Tables[K][]): Promise<Tables[K][]>
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Promise<Tables[K]>
  remove(table: TableName, id: string): Promise<void>
  /** Make one account the primary one (and un-flag the previous). */
  setPrimaryAccount(id: string): Promise<void>
  /** Live changes from other devices/tabs. Returns an unsubscribe function. */
  subscribe?(onChange: (e: ChangeEvent) => void): () => void
}

const TABLES: TableName[] = ['events', 'projects', 'project_tasks', 'transactions', 'categories', 'accounts', 'work_logs']

/** A dataset with every table present (empty). Always merge loaded data over this. */
export const emptyDataset = (): Dataset => ({
  events: [],
  projects: [],
  project_tasks: [],
  transactions: [],
  categories: [],
  accounts: [],
  work_logs: [],
})

/** Fill in any table missing from an older/partial dataset (e.g. demo data saved by a previous version). */
export function completeDataset(partial: Partial<Dataset> | null | undefined): Dataset {
  const out = emptyDataset()
  if (!partial) return out
  for (const t of TABLES) {
    const rows = (partial as Record<string, unknown>)[t]
    if (Array.isArray(rows)) (out as Record<TableName, unknown[]>)[t] = rows
  }
  return out
}

/** PostgREST "relation not found" — the table hasn't been created (schema.sql not re-run). */
const isMissingTable = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST205' || e.code === '42P01' || /schema cache|does not exist/i.test(e.message ?? '')

const ORDER: Record<TableName, { column: string; ascending: boolean }> = {
  events: { column: 'start_at', ascending: true },
  projects: { column: 'updated_at', ascending: false },
  project_tasks: { column: 'created_at', ascending: true },
  transactions: { column: 'date', ascending: false },
  categories: { column: 'name', ascending: true },
  accounts: { column: 'created_at', ascending: true },
  work_logs: { column: 'date', ascending: false },
}

/** Postgres `numeric` arrives as a string — normalise it. */
function normalise<K extends TableName>(table: K, row: Tables[K]): Tables[K] {
  if (table === 'transactions') {
    const tx = row as Tables['transactions']
    return { ...tx, amount: Number(tx.amount) } as Tables[K]
  }
  if (table === 'work_logs') {
    const wl = row as Tables['work_logs']
    return { ...wl, hours: Number(wl.hours) } as Tables[K]
  }
  return row
}

// ---------------------------------------------------------------------------
// Supabase (PostgreSQL + RLS)
// ---------------------------------------------------------------------------
export function createSupabaseRepository(client: SupabaseClient, userId: string): Repository {
  const strip = <T extends object>(row: T) => {
    // Let Postgres own these timestamps.
    const { updated_at: _u, ...rest } = row as T & { updated_at?: string }
    return rest
  }

  return {
    kind: 'supabase',

    async loadAll() {
      const results = await Promise.all(
        TABLES.map((t) =>
          client
            .from(t)
            .select('*')
            .order(ORDER[t].column, { ascending: ORDER[t].ascending })
            .limit(5000),
        ),
      )
      const out = emptyDataset()
      const missing: TableName[] = []
      results.forEach((res, i) => {
        const table = TABLES[i]
        if (res.error) {
          // One table not created yet must not take the whole app down.
          if (isMissingTable(res.error)) {
            missing.push(table)
            return
          }
          throw res.error
        }
        ;(out as Record<TableName, unknown[]>)[table] = (res.data ?? []).map((r) =>
          normalise(table, r as Tables[typeof table]),
        )
      })
      if (missing.length === TABLES.length) throw new Error('No se encuentra ninguna tabla. Ejecuta supabase/schema.sql en el SQL Editor.')
      return { data: out, missing }
    },

    async insert(table, row) {
      const { data, error } = await client
        .from(table)
        .insert({ ...strip(row), user_id: userId })
        .select()
        .single()
      if (error) throw error
      return normalise(table, data)
    },

    async insertMany(table, rows) {
      const out: Tables[typeof table][] = []
      // PostgREST handles large payloads fine, but chunking keeps requests small.
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => ({ ...strip(r), user_id: userId }))
        const { data, error } = await client.from(table).insert(chunk).select()
        if (error) throw error
        out.push(...(data ?? []).map((r) => normalise(table, r as Tables[typeof table])))
      }
      return out
    },

    async update(table, id, patch) {
      const { id: _id, user_id: _uid, ...rest } = patch as Record<string, unknown>
      const { data, error } = await client.from(table).update(strip(rest)).eq('id', id).select().single()
      if (error) throw error
      return normalise(table, data)
    },

    async remove(table, id) {
      const { error } = await client.from(table).delete().eq('id', id)
      if (error) throw error
    },

    async setPrimaryAccount(id) {
      const { error } = await client.rpc('set_primary_account', { account_id: id })
      if (error) throw error
    },

    subscribe(onChange) {
      const channel = client.channel(`hub-${userId}`)
      for (const table of TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string }).id
            if (id) onChange({ table, kind: 'delete', id })
          } else {
            onChange({ table, kind: 'upsert', row: normalise(table, payload.new as Tables[typeof table]) })
          }
        })
      }
      channel.subscribe()
      return () => {
        void client.removeChannel(channel)
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Local (Demo Mode) — synthetic data persisted in localStorage, zero network.
// ---------------------------------------------------------------------------
const DEMO_KEY = 'ph-demo-dataset-v5'

function readDemo(): Dataset {
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (raw) return completeDataset(JSON.parse(raw) as Partial<Dataset>)
  } catch {
    /* corrupted or unavailable storage → reseed */
  }
  const seeded = buildDemoDataset()
  writeDemo(seeded)
  return seeded
}

function writeDemo(data: Dataset) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(data))
  } catch {
    /* storage full / private mode: demo still works in memory */
  }
}

export function resetDemoData() {
  try {
    localStorage.removeItem(DEMO_KEY)
  } catch {
    /* ignore */
  }
}

export function createLocalRepository(): Repository {
  let db = readDemo()
  const commit = () => writeDemo(db)

  return {
    kind: 'local',

    async loadAll() {
      db = readDemo()
      return { data: structuredClone(db), missing: [] }
    },

    async insert(table, row) {
      ;(db[table] as Tables[typeof table][]).push(row)
      commit()
      return row
    },

    async insertMany(table, rows) {
      ;(db[table] as Tables[typeof table][]).push(...rows)
      commit()
      return rows
    },

    async update(table, id, patch) {
      const rows = db[table] as Tables[typeof table][]
      const idx = rows.findIndex((r) => r.id === id)
      if (idx === -1) throw new Error('Row not found')
      const next = { ...rows[idx], ...patch } as Tables[typeof table]
      if (table === 'projects') (next as Tables['projects']).updated_at = new Date().toISOString()
      rows[idx] = next
      commit()
      return next
    },

    async remove(table, id) {
      ;(db as Record<TableName, { id: string }[]>)[table] = db[table].filter((r) => r.id !== id)
      if (table === 'projects') db.project_tasks = db.project_tasks.filter((t) => t.project_id !== id)
      if (table === 'project_tasks') db.work_logs = db.work_logs.map((w) => (w.task_id === id ? { ...w, task_id: null } : w))
      commit()
    },

    async setPrimaryAccount(id) {
      db.accounts = db.accounts.map((a) => ({ ...a, is_primary: a.id === id }))
      commit()
    },
  }
}
