import type { Dataset, TableName } from '../lib/types'

export const TABLES: TableName[] = [
  'events', 'projects', 'project_tasks', 'transactions', 'categories', 'accounts', 'work_logs',
  'study_programs', 'study_subjects', 'study_assessments', 'study_files',
  'tcg_decks', 'vgc_teams', 'tournaments', 'tournament_rounds',
  'shoes', 'race_goals', 'run_plan', 'runs', 'run_workouts',
  'category_rules', 'bills',
]

/** A dataset with every table present (empty). Always merge loaded data over this. */
export const emptyDataset = (): Dataset => ({
  events: [],
  projects: [],
  project_tasks: [],
  transactions: [],
  categories: [],
  accounts: [],
  work_logs: [],
  study_programs: [],
  study_subjects: [],
  study_assessments: [],
  study_files: [],
  tcg_decks: [],
  vgc_teams: [],
  tournaments: [],
  tournament_rounds: [],
  shoes: [],
  race_goals: [],
  run_plan: [],
  runs: [],
  run_workouts: [],
  category_rules: [],
  bills: [],
})

/** Fill in any table missing from an older/partial dataset (e.g. demo data saved by a previous version). */
export function completeDataset(partial: Partial<Dataset> | null | undefined): Dataset {
  const out = emptyDataset()
  if (!partial) return out
  for (const t of TABLES) {
    const rows = (partial as Record<string, unknown>)[t]
    if (!Array.isArray(rows)) continue
    // Copies saved before structured sessions existed have no `blocks`.
    const needsBlocks = (t === 'run_plan' || t === 'runs') && rows.some((r) => !Array.isArray((r as { blocks?: unknown }).blocks))
    ;(out as Record<TableName, unknown[]>)[t] = needsBlocks ? rows.map((r) => ({ ...(r as object), blocks: (r as { blocks?: unknown[] }).blocks ?? [] })) : rows
  }
  return out
}

/**
 * Child rows that disappear with their parent (mirrors the ON DELETE CASCADE
 * foreign keys), so local state and Demo Mode behave like Postgres.
 */
export function cascadeRemove(d: Dataset, table: TableName, ids: Set<string>): Dataset {
  const next = { ...d, [table]: (d[table] as { id: string }[]).filter((r) => !ids.has(r.id)) } as Dataset
  if (table === 'projects') next.project_tasks = next.project_tasks.filter((t) => !t.project_id || !ids.has(t.project_id))
  if (table === 'project_tasks') next.work_logs = next.work_logs.map((w) => (w.task_id && ids.has(w.task_id) ? { ...w, task_id: null } : w))
  if (table === 'study_programs') {
    const subjects = new Set(next.study_subjects.filter((s) => ids.has(s.program_id)).map((s) => s.id))
    return subjects.size ? cascadeRemove(next, 'study_subjects', subjects) : next
  }
  if (table === 'study_subjects') {
    next.study_assessments = next.study_assessments.filter((a) => !ids.has(a.subject_id))
    next.study_files = next.study_files.filter((f) => !ids.has(f.subject_id))
  }
  if (table === 'race_goals') {
    const sessions = new Set(next.run_plan.filter((p) => ids.has(p.goal_id)).map((p) => p.id))
    return sessions.size ? cascadeRemove(next, 'run_plan', sessions) : next
  }
  if (table === 'shoes') next.runs = next.runs.map((r) => (r.shoe_id && ids.has(r.shoe_id) ? { ...r, shoe_id: null } : r))
  if (table === 'run_plan') next.runs = next.runs.map((r) => (r.plan_id && ids.has(r.plan_id) ? { ...r, plan_id: null } : r))
  if (table === 'tournaments') next.tournament_rounds = next.tournament_rounds.filter((r) => !ids.has(r.tournament_id))
  if (table === 'tcg_decks') next.tournaments = next.tournaments.map((t) => (t.deck_id && ids.has(t.deck_id) ? { ...t, deck_id: null } : t))
  if (table === 'vgc_teams') next.tournaments = next.tournaments.map((t) => (t.team_id && ids.has(t.team_id) ? { ...t, team_id: null } : t))
  return next
}
