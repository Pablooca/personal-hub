/**
 * JSON backup: export every table to a file and read it back safely.
 * Pure functions (no DOM, no network) so they can be unit-tested.
 */
import type { Dataset, TableName } from './types'

export const BACKUP_APP = 'personal-hub'
export const BACKUP_VERSION = 1

/** Every column written to / accepted from a backup. `user_id` is never exported. */
export const TABLE_FIELDS: { [K in TableName]: readonly string[] } = {
  events: ['id', 'title', 'description', 'start_at', 'end_at', 'category', 'is_completed', 'all_day', 'series_id', 'created_at'],
  projects: ['id', 'title', 'area', 'status', 'progress', 'priority', 'description', 'start_date', 'deadline', 'repo_url', 'notes', 'created_at', 'updated_at'],
  project_tasks: ['id', 'project_id', 'category', 'title', 'status', 'is_done', 'jira_key', 'description', 'priority', 'start_date', 'due_date', 'recurrence', 'created_at'],
  transactions: ['id', 'date', 'type', 'category', 'concept', 'amount', 'account', 'created_at'],
  categories: ['id', 'name', 'type', 'color', 'budget', 'created_at'],
  accounts: ['id', 'name', 'kind', 'color', 'is_primary', 'created_at'],
  work_logs: ['id', 'date', 'hours', 'description', 'jira_key', 'task_id', 'created_at'],
  study_programs: ['id', 'name', 'institution', 'academic_year', 'total_credits', 'created_at'],
  study_subjects: ['id', 'program_id', 'name', 'code', 'credits', 'semester', 'professor', 'color', 'status', 'final_grade', 'target_grade', 'created_at'],
  study_assessments: ['id', 'subject_id', 'name', 'weight', 'grade', 'kind', 'due_at', 'is_done', 'created_at'],
  study_files: ['id', 'subject_id', 'name', 'topic', 'storage_path', 'size_bytes', 'created_at'],
  study_topics: ['id', 'subject_id', 'position', 'name', 'highlighted', 'studied', 'reviews', 'last_studied', 'final_pass', 'confidence', 'notes', 'created_at'],
  study_plans: ['id', 'program_id', 'name', 'start_date', 'end_date', 'exam_date', 'phases', 'notes', 'created_at'],
  study_plan_items: ['id', 'plan_id', 'subject_id', 'kind', 'date', 'end_date', 'title', 'notes', 'is_done', 'created_at'],
  tcg_decks: ['id', 'name', 'format', 'icons', 'list_text', 'notes', 'is_built', 'created_at'],
  deck_versions: ['id', 'deck_id', 'from_date', 'list_text', 'note', 'created_at'],
  matchup_notes: ['id', 'deck_id', 'archetype', 'name', 'icons', 'notes', 'created_at'],
  owned_cards: [
    'id', 'tcgdex_id', 'set_code', 'set_name', 'number', 'name', 'name_en', 'category', 'signature', 'rarity', 'image', 'language', 'condition', 'finish', 'first_edition', 'signed', 'altered',
    'grade_company', 'grade', 'quantity', 'location', 'for_sale', 'paid', 'acquired_at', 'cm_product', 'ref_low', 'ref_trend', 'ref_date', 'own_price', 'own_price_date', 'standard', 'standard_date', 'subtype', 'notes', 'created_at',
  ],
  collection_snapshots: ['id', 'date', 'total', 'cards', 'created_at'],
  vgc_teams: ['id', 'name', 'regulation', 'paste', 'notes', 'created_at'],
  tournaments: [
    'id', 'game', 'name', 'date', 'mode', 'location', 'category', 'format', 'players', 'swiss_rounds', 'swiss_format', 'has_top_cut',
    'top_cut_type', 'top_cut_size', 'top_cut_format', 'made_top_cut', 'deck_id', 'team_id', 'status', 'placement_bracket', 'placement', 'cp', 'notes', 'created_at',
  ],
  tournament_rounds: [
    'id', 'tournament_id', 'phase', 'number', 'result', 'games', 'won_dice', 'went_first', 'opponent_name', 'opponent_archetype',
    'opponent_icons', 'opponent_deck_name', 'opponent_pokemon', 'opponent_record', 'my_pokemon', 'notes', 'created_at',
  ],
  pokemon_matches: [
    'id', 'game', 'date', 'format', 'result', 'games', 'won_dice', 'went_first', 'deck_id', 'team_id', 'venue', 'opponent_name', 'opponent_archetype', 'opponent_icons', 'opponent_deck_name',
    'opponent_pokemon', 'my_pokemon', 'teams', 'replays', 'notes', 'created_at',
  ],
  shoes: ['id', 'name', 'start_km', 'limit_km', 'retired', 'is_default', 'created_at'],
  race_goals: ['id', 'name', 'date', 'distance_km', 'previous_best_s', 'target_s', 'notes', 'created_at'],
  run_plan: ['id', 'goal_id', 'date', 'type', 'distance_km', 'pace_s', 'description', 'blocks', 'created_at'],
  runs: ['id', 'plan_id', 'date', 'type', 'distance_km', 'duration_s', 'work_pace_s', 'avg_hr', 'rpe', 'is_test', 'notes', 'blocks', 'shoe_id', 'created_at'],
  run_workouts: ['id', 'name', 'type', 'blocks', 'created_at'],
  category_rules: ['id', 'pattern', 'type', 'category', 'created_at'],
  bills: ['id', 'name', 'amount', 'category', 'account', 'period', 'anchor_date', 'notify_days', 'active', 'created_at'],
}

/** Parents first, so foreign keys always find their row. */
export const BACKUP_TABLES = Object.keys(TABLE_FIELDS) as TableName[]

export const BACKUP_SCOPES: { id: string; label: string; tables: TableName[] }[] = [
  { id: 'all', label: 'Todo', tables: BACKUP_TABLES },
  { id: 'pokemon', label: 'Solo Pokémon', tables: ['tcg_decks', 'vgc_teams', 'deck_versions', 'matchup_notes', 'owned_cards', 'collection_snapshots', 'tournaments', 'tournament_rounds', 'pokemon_matches'] },
  { id: 'running', label: 'Solo Running', tables: ['shoes', 'race_goals', 'run_plan', 'runs', 'run_workouts'] },
]

export const TABLE_LABELS: Record<TableName, string> = {
  events: 'Eventos',
  projects: 'Proyectos',
  project_tasks: 'Tareas',
  transactions: 'Movimientos',
  categories: 'Categorías',
  accounts: 'Cuentas',
  work_logs: 'Registros de horas',
  study_programs: 'Estudios',
  study_subjects: 'Asignaturas',
  study_assessments: 'Entregas y exámenes',
  study_files: 'Apuntes (fichas)',
  study_topics: 'Temas',
  study_plans: 'Planes de estudio',
  study_plan_items: 'Objetivos y bloques del plan',
  deck_versions: 'Versiones de mazo',
  matchup_notes: 'Notas de emparejamiento',
  owned_cards: 'Cartas de la colección',
  collection_snapshots: 'Valor de la colección',
  tcg_decks: 'Mazos TCG',
  vgc_teams: 'Equipos VGC',
  tournaments: 'Torneos',
  tournament_rounds: 'Rondas',
  pokemon_matches: 'Partidas sueltas',
  shoes: 'Zapatillas',
  race_goals: 'Carreras objetivo',
  run_plan: 'Sesiones planificadas',
  runs: 'Entrenamientos',
  run_workouts: 'Plantillas de sesión',
  category_rules: 'Reglas de categoría',
  bills: 'Cobros recurrentes',
}

type Row = Record<string, unknown>

const pick = (row: Row, fields: readonly string[]): Row => {
  const out: Row = {}
  for (const f of fields) if (row[f] !== undefined) out[f] = row[f]
  return out
}

export interface BackupFile {
  app: typeof BACKUP_APP
  version: number
  exported_at: string
  data: Partial<Record<TableName, Row[]>>
}

export function buildBackup(data: Dataset, tables: TableName[] = BACKUP_TABLES, now = new Date()): BackupFile {
  const out: BackupFile['data'] = {}
  for (const t of tables) out[t] = (data[t] as unknown as Row[]).map((r) => pick(r, TABLE_FIELDS[t]))
  return { app: BACKUP_APP, version: BACKUP_VERSION, exported_at: now.toISOString(), data: out }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ParsedBackup {
  exportedAt: string | null
  data: Partial<Record<TableName, Row[]>>
  /** Rows dropped because they were malformed. */
  skipped: number
}

/** Validate an untrusted file. Throws a Spanish message when it is not a backup of this app. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }
  const file = raw as Partial<BackupFile> | null
  if (!file || typeof file !== 'object' || file.app !== BACKUP_APP || !file.data || typeof file.data !== 'object') {
    throw new Error('El archivo no es una copia de Personal Hub.')
  }
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    throw new Error('La copia es de una versión más nueva de la aplicación.')
  }
  const data: ParsedBackup['data'] = {}
  let skipped = 0
  for (const t of BACKUP_TABLES) {
    const rows = (file.data as Record<string, unknown>)[t]
    if (!Array.isArray(rows)) continue
    const seen = new Set<string>()
    const clean: Row[] = []
    for (const r of rows as unknown[]) {
      const row = r as Row | null
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !UUID.test(row.id) || seen.has(row.id)) {
        skipped++
        continue
      }
      seen.add(row.id)
      clean.push(pick(row, TABLE_FIELDS[t]))
    }
    data[t] = clean
  }
  if (Object.values(data).every((rows) => !rows?.length)) throw new Error('La copia no contiene ningún dato.')
  return { exportedAt: typeof file.exported_at === 'string' ? file.exported_at : null, data, skipped }
}

export type ImportMode = 'missing' | 'overwrite'

export interface ImportPlan {
  rows: Partial<Record<TableName, Row[]>>
  counts: { table: TableName; add: number; update: number; skip: number }[]
}

/** Decide what to write. Never deletes; avoids the unique constraints of categories and accounts. */
export function planImport(current: Dataset, backup: ParsedBackup['data'], mode: ImportMode): ImportPlan {
  const rows: ImportPlan['rows'] = {}
  const counts: ImportPlan['counts'] = []
  for (const t of BACKUP_TABLES) {
    const incoming = backup[t]
    if (!incoming?.length) continue
    const mine = current[t] as unknown as Row[]
    const ids = new Set(mine.map((r) => r.id))
    const natural = (r: Row) => (t === 'categories' ? `${String(r.type)}|${String(r.name)}` : t === 'accounts' ? String(r.name) : t === 'study_files' ? String(r.storage_path) : t === 'collection_snapshots' ? String(r.date) : null)
    const names = new Map(mine.map((r) => [natural(r), r.id]))
    const primary = t === 'accounts' ? mine.find((r) => r.is_primary) : undefined
    let add = 0
    let update = 0
    let skip = 0
    const out: Row[] = []
    for (const r of incoming) {
      const exists = ids.has(r.id)
      const key = natural(r)
      const clash = key !== null && names.has(key) && names.get(key) !== r.id
      if (clash || (exists && mode === 'missing')) {
        skip++
        continue
      }
      if (key !== null) names.set(key, r.id)
      if (exists) update++
      else add++
      out.push(primary && r.is_primary && primary.id !== r.id ? { ...r, is_primary: false } : r)
    }
    rows[t] = out
    counts.push({ table: t, add, update, skip })
  }
  return { rows, counts }
}
