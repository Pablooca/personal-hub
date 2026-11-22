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
export interface Repository {
  readonly kind: 'supabase' | 'local'
  loadAll(): Promise<Dataset>
  insert<K extends TableName>(table: K, row: Tables[K]): Promise<Tables[K]>
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Promise<Tables[K]>
  remove(table: TableName, id: string): Promise<void>
  /** Live changes from other devices/tabs. Returns an unsubscribe function. */
  subscribe?(onChange: (e: ChangeEvent) => void): () => void
}

const TABLES: TableName[] = ['events', 'projects', 'project_tasks', 'transactions']

const ORDER: Record<TableName, { column: string; ascending: boolean }> = {
  events: { column: 'start_at', ascending: true },
  projects: { column: 'updated_at', ascending: false },
  project_tasks: { column: 'created_at', ascending: true },
  transactions: { column: 'date', ascending: false },
}

/** Postgres `numeric` arrives as a string — normalise it. */
function normalise<K extends TableName>(table: K, row: Tables[K]): Tables[K] {
  if (table === 'transactions') {
    const tx = row as Tables['transactions']
    return { ...tx, amount: Number(tx.amount) } as Tables[K]
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
      const out = {} as Dataset
      results.forEach((res, i) => {
        if (res.error) throw res.error
        const table = TABLES[i]
        ;(out as Record<TableName, unknown[]>)[table] = (res.data ?? []).map((r) =>
          normalise(table, r as Tables[typeof table]),
        )
      })
      return out
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
const DEMO_KEY = 'ph-demo-dataset-v1'

function readDemo(): Dataset {
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (raw) return JSON.parse(raw) as Dataset
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
      return structuredClone(db)
    },

    async insert(table, row) {
      ;(db[table] as Tables[typeof table][]).push(row)
      commit()
      return row
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
      commit()
    },
  }
}
