/**
 * Guards against "Could not find the '<column>' column of '<table>'":
 * every field the app sends on insert must exist in supabase/schema.sql.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8')
const types = readFileSync(new URL('./types.ts', import.meta.url), 'utf8')

/** Columns from `create table public.<t> (...)` plus any `alter table public.<t> add column`. */
function columns(table: string): Set<string> {
  const create = schema.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`))
  assert.ok(create, `create table for ${table} not found`)
  const cols = new Set<string>()
  for (const line of create[1].split('\n')) {
    const m = line.match(/^\s+([a-z_]+)\s+(uuid|text|numeric|integer|boolean|timestamptz|date|bigint)\b/)
    if (m) cols.add(m[1])
  }
  for (const m of schema.matchAll(new RegExp(`alter table public\\.${table} add column if not exists ([a-z_]+)`, 'g'))) cols.add(m[1])
  return cols
}

function fields(iface: string): Set<string> {
  const body = types.match(new RegExp(`export interface ${iface} \\{([\\s\\S]*?)\\n\\}`))
  assert.ok(body, `interface ${iface} not found`)
  return new Set([...body[1].matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]))
}

const TABLES: Record<string, string> = {
  events: 'CalendarEvent',
  projects: 'Project',
  project_tasks: 'ProjectTask',
  transactions: 'Transaction',
  categories: 'Category',
  accounts: 'Account',
  work_logs: 'WorkLog',
  study_programs: 'StudyProgram',
  study_subjects: 'StudySubject',
  study_assessments: 'StudyAssessment',
  study_files: 'StudyFile',
}

for (const [table, iface] of Object.entries(TABLES)) {
  test(`${table}: every field the app writes exists in schema.sql`, () => {
    const cols = columns(table)
    // The data layer always adds created_at (and updated_at for projects) on insert.
    const sent = new Set([...fields(iface), 'created_at', 'user_id', ...(table === 'projects' ? ['updated_at'] : [])])
    const missing = [...sent].filter((f) => !cols.has(f))
    assert.deepEqual(missing, [], `${table} is missing columns: ${missing.join(', ')}`)
  })
}
