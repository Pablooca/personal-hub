import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BACKUP_TABLES, buildBackup, parseBackup, planImport } from './backup.ts'
import type { Dataset } from './types.ts'

const empty = () => Object.fromEntries(BACKUP_TABLES.map((t) => [t, []])) as unknown as Dataset
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('export → import round trip keeps every row and never exports user_id', () => {
  const d = empty()
  d.tcg_decks = [{ id: id(1), user_id: 'secret', name: 'Mazo', format: 'TEF-DLR', icons: ['latias'], list_text: '', notes: '', created_at: '2026-01-01' }]
  const text = JSON.stringify(buildBackup(d))
  assert.ok(!text.includes('secret'))
  const plan = planImport(empty(), parseBackup(text).data, 'missing')
  assert.deepEqual(plan.counts, [{ table: 'tcg_decks', add: 1, update: 0, skip: 0 }])
  assert.equal((plan.rows.tcg_decks![0] as { name: string }).name, 'Mazo')
})

test('rejects files that are not backups', () => {
  for (const bad of ['nope', '[]', '{"app":"otra","version":1,"data":{}}', '{"app":"personal-hub","version":99,"data":{}}', '{"app":"personal-hub","version":1,"data":{}}'])
    assert.throws(() => parseBackup(bad))
})

test('malformed rows and unknown columns are dropped', () => {
  const p = parseBackup(JSON.stringify({ app: 'personal-hub', version: 1, data: { events: [{ id: 'x' }, null, { id: id(1), title: 'ok', hack: 1, user_id: 'u' }, { id: id(1), title: 'dup' }] } }))
  assert.equal(p.skipped, 3)
  assert.deepEqual(p.data.events, [{ id: id(1), title: 'ok' }])
})

test('modes, natural keys and the single primary account', () => {
  const d = empty()
  d.accounts = [{ id: id(1), name: 'Banco', kind: 'checking', color: 'sky', is_primary: true, created_at: '' }]
  const rows = [
    { id: id(1), name: 'Banco', is_primary: true },
    { id: id(2), name: 'Banco', is_primary: false },
    { id: id(3), name: 'Otro', is_primary: true },
  ]
  const missing = planImport(d, { accounts: rows }, 'missing')
  assert.deepEqual(missing.counts[0], { table: 'accounts', add: 1, update: 0, skip: 2 })
  assert.equal(missing.rows.accounts![0].is_primary, false)
  assert.deepEqual(planImport(d, { accounts: rows }, 'overwrite').counts[0], { table: 'accounts', add: 1, update: 1, skip: 1 })
})
