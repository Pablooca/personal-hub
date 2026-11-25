import type { Dataset, TableName, Tables } from '../lib/types'
import { cascadeRemove, completeDataset } from './dataset.ts'
import type { Repository } from './repository'

/**
 * Hybrid persistence: Supabase is the source of truth, localStorage keeps
 *   1. a copy of the data  → the app opens instantly and is readable offline
 *   2. an outbox           → writes made without a connection, sent in order later
 * Both are keyed by user and the copy is wiped on sign-out.
 */
type Op =
  | { kind: 'insert'; table: TableName; rows: { id: string }[] }
  | { kind: 'upsert'; table: TableName; rows: { id: string }[] }
  | { kind: 'update'; table: TableName; id: string; patch: Record<string, unknown> }
  | { kind: 'remove'; table: TableName; ids: string[] }
  | { kind: 'updateWhere'; table: TableName; column: string; value: string; patch: Record<string, unknown> }

const cacheKey = (userId: string) => `ph-cache-${userId}`
const outboxKey = (userId: string) => `ph-outbox-${userId}`

const message = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e))

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|timed? ?out|ERR_INTERNET/i.test(message(e))
}

/** Already applied on a previous attempt whose answer got lost. */
const isDuplicate = (e: unknown) => (e as { code?: string } | null)?.code === '23505' && /_pkey/.test(message(e))

export function applyOp(d: Dataset, op: Op): Dataset {
  const rows = d[op.table] as unknown as Record<string, unknown>[]
  switch (op.kind) {
    case 'insert':
    case 'upsert': {
      const byId = new Map(rows.map((r) => [r.id, r]))
      for (const r of op.rows) byId.set(r.id, { ...byId.get(r.id), ...r })
      return { ...d, [op.table]: [...byId.values()] }
    }
    case 'update':
      return { ...d, [op.table]: rows.map((r) => (r.id === op.id ? { ...r, ...op.patch } : r)) }
    case 'updateWhere':
      return { ...d, [op.table]: rows.map((r) => (r[op.column] === op.value ? { ...r, ...op.patch } : r)) }
    case 'remove':
      return cascadeRemove(d, op.table, new Set(op.ids))
  }
}

export function clearLocalCopy(userId: string) {
  try {
    localStorage.removeItem(cacheKey(userId))
  } catch {
    /* ignore */
  }
}

export function createHybridRepository(remote: Repository, userId: string): Repository {
  let memory: Dataset | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  const watchers = new Set<(n: number, refused?: string) => void>()

  const readOutbox = (): Op[] => {
    try {
      const raw = JSON.parse(localStorage.getItem(outboxKey(userId)) ?? '[]') as unknown
      return Array.isArray(raw) ? (raw as Op[]) : []
    } catch {
      return []
    }
  }
  // Fallback when localStorage is unavailable: at least keep the queue in memory.
  let volatile: Op[] | null = null
  const outbox = () => volatile ?? readOutbox()
  const writeOutbox = (ops: Op[], refused?: string) => {
    try {
      if (ops.length) localStorage.setItem(outboxKey(userId), JSON.stringify(ops))
      else localStorage.removeItem(outboxKey(userId))
      volatile = null
    } catch {
      volatile = ops
    }
    watchers.forEach((w) => w(ops.length, refused))
  }

  const persist = () => {
    if (closed || !memory) return
    try {
      localStorage.setItem(cacheKey(userId), JSON.stringify(memory))
    } catch {
      // Quota exceeded: better no copy than a half-written one.
      clearLocalCopy(userId)
    }
  }

  const send = async (op: Op) => {
    switch (op.kind) {
      case 'insert':
        try {
          await remote.insertMany(op.table, op.rows as Tables[TableName][])
        } catch (e) {
          if (isDuplicate(e)) await remote.upsertMany(op.table, op.rows as Tables[TableName][])
          else throw e
        }
        return
      case 'upsert':
        return remote.upsertMany(op.table, op.rows as Tables[TableName][])
      case 'update':
        await remote.update(op.table, op.id, op.patch as Partial<Tables[TableName]>)
        return
      case 'remove':
        return remote.removeMany(op.table, op.ids)
      case 'updateWhere':
        return remote.updateWhere(op.table, op.column as never, op.value, op.patch as never)
    }
  }

  let flushing: Promise<void> | null = null
  const flush = (): Promise<void> => {
    flushing ??= (async () => {
      try {
        for (;;) {
          const [op] = outbox()
          if (!op) break
          let refused: string | undefined
          try {
            await send(op)
          } catch (e) {
            if (isNetworkError(e)) break
            refused = message(e) // the server said no: retrying would never work
          }
          writeOutbox(outbox().slice(1), refused)
        }
      } finally {
        flushing = null
      }
    })()
    return flushing
  }

  /** Try now; queue when there is no connection. `fallback` is the optimistic answer. */
  const run = async <T>(op: Op, now: () => Promise<T>, fallback: () => T): Promise<T> => {
    if (outbox().length) await flush()
    if (outbox().length === 0) {
      try {
        return await now()
      } catch (e) {
        if (!isNetworkError(e)) throw e
      }
    }
    writeOutbox([...outbox(), op])
    return fallback()
  }

  return {
    ...remote,

    cached() {
      try {
        const raw = localStorage.getItem(cacheKey(userId))
        if (!raw) return null
        return outbox().reduce(applyOp, completeDataset(JSON.parse(raw) as Partial<Dataset>))
      } catch {
        return null
      }
    },

    remember(data) {
      memory = data
      clearTimeout(timer)
      timer = setTimeout(persist, 600)
    },

    flush,

    watchPending(cb) {
      closed = false
      watchers.add(cb)
      cb(outbox().length)
      const save = () => document.visibilityState === 'hidden' && persist()
      document.addEventListener('visibilitychange', save)
      return () => {
        watchers.delete(cb)
        document.removeEventListener('visibilitychange', save)
        clearTimeout(timer)
        closed = true
      }
    },

    async loadAll() {
      if (outbox().length) await flush()
      try {
        if (outbox().length) throw new Error('Failed to fetch')
        return await remote.loadAll()
      } catch (e) {
        const copy = memory ?? this.cached!()
        if (copy && isNetworkError(e)) return { data: copy, missing: [], offline: true }
        throw e
      }
    },

    insert: (table, row) => run({ kind: 'insert', table, rows: [row] }, () => remote.insert(table, row), () => row),
    insertMany: (table, rows) => run({ kind: 'insert', table, rows }, () => remote.insertMany(table, rows), () => rows),
    upsertMany: (table, rows) => run({ kind: 'upsert', table, rows }, () => remote.upsertMany(table, rows), () => undefined),
    update: (table, id, patch) =>
      run(
        { kind: 'update', table, id, patch: patch as Record<string, unknown> },
        () => remote.update(table, id, patch),
        () => ({ ...(memory?.[table] as { id: string }[] | undefined)?.find((r) => r.id === id), ...patch }) as Tables[typeof table],
      ),
    remove: (table, id) => run({ kind: 'remove', table, ids: [id] }, () => remote.remove(table, id), () => undefined),
    removeMany: (table, ids) => run({ kind: 'remove', table, ids }, () => remote.removeMany(table, ids), () => undefined),
    updateWhere: (table, column, value, patch) =>
      run(
        { kind: 'updateWhere', table, column, value, patch: patch as Record<string, unknown> },
        () => remote.updateWhere(table, column, value, patch),
        () => undefined,
      ),
  }
}
