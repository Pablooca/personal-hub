import { test } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
})
const { applyOp, createHybridRepository, isNetworkError } = await import('./hybrid.ts')
const { emptyDataset } = await import('./dataset.ts')

const offline = () => Promise.reject(new TypeError('Failed to fetch'))
function fakeRemote() {
  const state = { online: true, refuse: false, log: [] as string[] }
  const go = (what: string) => async () => {
    if (!state.online) return offline()
    if (state.refuse) throw { code: '23514', message: 'violates check constraint' }
    state.log.push(what)
  }
  const remote = {
    kind: 'supabase',
    loadAll: async () => (state.online ? { data: emptyDataset(), missing: [] } : offline()),
    insert: async (t: string, row: { id: string }) => (await go(`insert ${t} ${row.id}`)(), row),
    insertMany: async (t: string, rows: { id: string }[]) => (await go(`insert ${t} ${rows.map((r) => r.id)}`)(), rows),
    upsertMany: async (t: string, rows: { id: string }[]) => go(`upsert ${t} ${rows.map((r) => r.id)}`)(),
    update: async (t: string, id: string, p: object) => (await go(`update ${t} ${id}`)(), { id, ...p }),
    remove: async (t: string, id: string) => go(`remove ${t} ${id}`)(),
    removeMany: async (t: string, ids: string[]) => go(`remove ${t} ${ids}`)(),
    updateWhere: async (t: string) => go(`updateWhere ${t}`)(),
  }
  return { state, remote: remote as never }
}
const row = (id: string) => ({ id, name: id }) as never

test('writes made offline are queued and sent in order when the connection returns', async () => {
  store.clear()
  const { state, remote } = fakeRemote()
  const repo = createHybridRepository(remote, 'u')
  state.online = false
  await repo.insert('tournaments', row('a'))
  await repo.update('tournaments', 'a', { name: 'b' } as never)
  await repo.remove('tournaments', 'z')
  assert.equal(JSON.parse(store.get('ph-outbox-u')!).length, 3)
  state.online = true
  await repo.insert('tournaments', row('c')) // a new write flushes the queue first
  assert.deepEqual(state.log, ['insert tournaments a', 'update tournaments a', 'remove tournaments z', 'insert tournaments c'])
  assert.equal(store.has('ph-outbox-u'), false)
})

test('a write the server refuses is reported and does not block the queue', async () => {
  store.clear()
  const { state, remote } = fakeRemote()
  const repo = createHybridRepository(remote, 'u')
  state.online = false
  await repo.insert('tournaments', row('a'))
  state.online = true
  state.refuse = true
  await repo.flush!()
  assert.equal(store.has('ph-outbox-u'), false)
  await assert.rejects(() => repo.insert('tournaments', row('b')), (e: { code?: string }) => e.code === '23514')
})

test('offline load returns the local copy with pending edits applied', async () => {
  store.clear()
  const { state, remote } = fakeRemote()
  store.set('ph-cache-u', JSON.stringify({ tournaments: [{ id: 'a', name: 'old' }] }))
  state.online = false
  const repo = createHybridRepository(remote, 'u')
  await repo.update('tournaments', 'a', { name: 'new' } as never)
  const res = await repo.loadAll()
  assert.equal(res.offline, true)
  assert.equal(res.data.tournaments[0].name, 'new')
})

test('applyOp mirrors the cascades of the database', () => {
  const d = { ...emptyDataset(), tournaments: [{ id: 't', deck_id: 'd' }], tournament_rounds: [{ id: 'r', tournament_id: 't' }], tcg_decks: [{ id: 'd' }] } as never
  assert.equal(applyOp(d, { kind: 'remove', table: 'tournaments', ids: ['t'] }).tournament_rounds.length, 0)
  assert.equal(applyOp(d, { kind: 'remove', table: 'tcg_decks', ids: ['d'] }).tournaments[0].deck_id, null)
})

test('network errors are told apart from server errors', () => {
  assert.ok(isNetworkError(new TypeError('Load failed')))
  assert.ok(!isNetworkError({ code: '42501', message: 'new row violates row-level security policy' }))
})
