import type { SupabaseClient } from '@supabase/supabase-js'
import type { Dataset, TableName, Tables } from '../lib/types'
import { TABLES, cascadeRemove, completeDataset, emptyDataset } from './dataset.ts'
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
  /** True when the data comes from the local cache because the network is down. */
  offline?: boolean
}

export interface Repository {
  readonly kind: 'supabase' | 'local'
  loadAll(): Promise<LoadResult>
  insert<K extends TableName>(table: K, row: Tables[K]): Promise<Tables[K]>
  insertMany<K extends TableName>(table: K, rows: Tables[K][]): Promise<Tables[K][]>
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Promise<Tables[K]>
  remove(table: TableName, id: string): Promise<void>
  removeMany(table: TableName, ids: string[]): Promise<void>
  /** Same patch to every row where `column = value` (e.g. a whole event series). */
  updateWhere<K extends TableName>(table: K, column: keyof Tables[K] & string, value: string, patch: Partial<Tables[K]>): Promise<void>
  /** Insert, or overwrite rows that already have the same id (JSON import). */
  upsertMany<K extends TableName>(table: K, rows: Tables[K][]): Promise<void>
  /** Make one account the primary one (and un-flag the previous). */
  setPrimaryAccount(id: string): Promise<void>
  /** Study PDFs (private storage). Returns the storage path. Unsupported in Demo Mode. */
  uploadStudyFile(subjectId: string, fileId: string, file: File): Promise<string>
  /** Short-lived signed URL to open a PDF. */
  studyFileUrl(path: string): Promise<string>
  removeStudyFiles(paths: string[]): Promise<void>
  /** Live changes from other devices/tabs. Returns an unsubscribe function. */
  subscribe?(onChange: (e: ChangeEvent) => void): () => void
  /** Last known data kept in this device (instant start / offline). */
  cached?(): Dataset | null
  /** Called with every state change so the local copy stays fresh. */
  remember?(data: Dataset): void
  /** Send writes made while offline. */
  flush?(): Promise<void>
  /** Fires with the number of writes waiting for a connection (and the reason when the server refuses one). */
  watchPending?(cb: (n: number, refused?: string) => void): () => void
}

/** Rows per request. */
const PAGE = 1000

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
  study_programs: { column: 'created_at', ascending: true },
  study_subjects: { column: 'created_at', ascending: true },
  study_assessments: { column: 'created_at', ascending: true },
  study_files: { column: 'created_at', ascending: false },
  tcg_decks: { column: 'created_at', ascending: true },
  vgc_teams: { column: 'created_at', ascending: true },
  tournaments: { column: 'date', ascending: false },
  tournament_rounds: { column: 'number', ascending: true },
  shoes: { column: 'created_at', ascending: true },
  race_goals: { column: 'date', ascending: true },
  run_plan: { column: 'date', ascending: true },
  runs: { column: 'date', ascending: false },
  run_workouts: { column: 'created_at', ascending: true },
  category_rules: { column: 'created_at', ascending: true },
  bills: { column: 'created_at', ascending: true },
}

/** Postgres `numeric` arrives as a string — normalise it. */
function normalise<K extends TableName>(table: K, row: Tables[K]): Tables[K] {
  if (table === 'transactions') {
    const tx = row as Tables['transactions']
    return { ...tx, amount: Number(tx.amount) } as Tables[K]
  }
  if (table === 'categories') {
    const c = row as Tables['categories']
    return { ...c, budget: c.budget === null || c.budget === undefined ? null : Number(c.budget) } as Tables[K]
  }
  if (table === 'shoes') {
    const x = row as Tables['shoes']
    return { ...x, start_km: Number(x.start_km), limit_km: Number(x.limit_km) } as Tables[K]
  }
  if (table === 'bills') {
    const b = row as Tables['bills']
    return { ...b, amount: Number(b.amount) } as Tables[K]
  }
  if (table === 'work_logs') {
    const wl = row as Tables['work_logs']
    return { ...wl, hours: Number(wl.hours) } as Tables[K]
  }
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  if (table === 'study_programs') {
    const p = row as Tables['study_programs']
    return { ...p, total_credits: num(p.total_credits) } as Tables[K]
  }
  if (table === 'study_subjects') {
    const s = row as Tables['study_subjects']
    return { ...s, credits: Number(s.credits), final_grade: num(s.final_grade), target_grade: Number(s.target_grade) } as Tables[K]
  }
  if (table === 'study_assessments') {
    const a = row as Tables['study_assessments']
    return { ...a, weight: Number(a.weight), grade: num(a.grade) } as Tables[K]
  }
  if (table === 'study_files') {
    const f = row as Tables['study_files']
    return { ...f, size_bytes: Number(f.size_bytes) } as Tables[K]
  }
  if (table === 'race_goals' || table === 'run_plan' || table === 'runs') {
    const r = row as Tables['runs']
    // `blocks` is missing in copies saved before structured sessions existed.
    return { ...r, distance_km: Number(r.distance_km), ...(table === 'race_goals' ? {} : { blocks: Array.isArray(r.blocks) ? r.blocks : [] }) } as unknown as Tables[K]
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
      // PostgREST caps every answer (1 000 rows by default): keep asking until a page comes back short.
      const fetchAll = async (t: TableName) => {
        const rows: unknown[] = []
        for (;;) {
          const res = await client
            .from(t)
            .select('*')
            .order(ORDER[t].column, { ascending: ORDER[t].ascending })
            .order('id', { ascending: true })
            .range(rows.length, rows.length + PAGE - 1)
          if (res.error) return { data: null, error: res.error }
          const page = res.data ?? []
          rows.push(...page)
          if (page.length < PAGE) return { data: rows, error: null }
        }
      }
      const results = await Promise.all(TABLES.map(fetchAll))
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

    async removeMany(table, ids) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await client.from(table).delete().in('id', ids.slice(i, i + 200))
        if (error) throw error
      }
    },

    async updateWhere(table, column, value, patch) {
      const { id: _id, user_id: _uid, ...rest } = patch as Record<string, unknown>
      const { error } = await client.from(table).update(strip(rest)).eq(column as string, value)
      if (error) throw error
    },

    async upsertMany(table, rows) {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => ({ ...strip(r), user_id: userId }))
        const { error } = await client.from(table).upsert(chunk, { onConflict: 'id' })
        if (error) throw error
      }
    },

    async setPrimaryAccount(id) {
      const { error } = await client.rpc('set_primary_account', { account_id: id })
      if (error) throw error
    },

    async uploadStudyFile(subjectId, fileId, file) {
      const path = `${userId}/${subjectId}/${fileId}.pdf`
      const { error } = await client.storage.from(STUDY_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false })
      if (error) throw error
      return path
    },

    async studyFileUrl(path) {
      const { data, error } = await client.storage.from(STUDY_BUCKET).createSignedUrl(path, 600)
      if (error) throw error
      return data.signedUrl
    },

    async removeStudyFiles(paths) {
      if (!paths.length) return
      const { error } = await client.storage.from(STUDY_BUCKET).remove(paths)
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
const DEMO_KEY = 'ph-demo-dataset-v19'
export const STUDY_BUCKET = 'study-files'

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
      db = cascadeRemove(db, table, new Set([id]))
      commit()
    },

    async removeMany(table, ids) {
      db = cascadeRemove(db, table, new Set(ids))
      commit()
    },

    async updateWhere(table, column, value, patch) {
      ;(db as unknown as Record<TableName, Record<string, unknown>[]>)[table] = (db[table] as unknown as Record<string, unknown>[]).map((r) =>
        r[column] === value ? { ...r, ...patch } : r,
      )
      commit()
    },

    async upsertMany(table, rows) {
      const byId = new Map((db[table] as { id: string }[]).map((r) => [r.id, r]))
      for (const r of rows) byId.set(r.id, r)
      ;(db as unknown as Record<TableName, unknown[]>)[table] = [...byId.values()]
      commit()
    },

    async setPrimaryAccount(id) {
      db.accounts = db.accounts.map((a) => ({ ...a, is_primary: a.id === id }))
      commit()
    },

    async uploadStudyFile() {
      throw new Error('En el modo demo no se pueden subir archivos. Inicia sesión para guardar tus apuntes.')
    },

    async studyFileUrl() {
      throw new Error('Los PDF de ejemplo del modo demo no tienen contenido.')
    },

    async removeStudyFiles() {
      /* nothing stored in Demo Mode */
    },
  }
}
