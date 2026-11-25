export const EVENT_CATEGORIES = ['work', 'master', 'research', 'training', 'personal', 'vacation', 'holiday'] as const
export type EventCategory = (typeof EVENT_CATEGORIES)[number]

export const PROJECT_AREAS = ['research', 'engineering', 'academic', 'personal'] as const
export type ProjectArea = (typeof PROJECT_AREAS)[number]

export const PROJECT_STATUSES = ['backlog', 'in_progress', 'review', 'completed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_CATEGORIES = ['work', 'personal'] as const
export type TaskCategory = (typeof TASK_CATEGORIES)[number]

export const PRIORITIES = ['low', 'medium', 'high'] as const
export type Priority = (typeof PRIORITIES)[number]

export const TX_TYPES = ['income', 'expense', 'investment'] as const
export type TxType = (typeof TX_TYPES)[number]

export interface CalendarEvent {
  id: string
  user_id?: string
  title: string
  description: string
  start_at: string // ISO timestamp
  end_at: string // ISO timestamp
  category: EventCategory
  is_completed: boolean
  all_day: boolean
  series_id: string | null
  created_at: string
}

export interface Project {
  id: string
  user_id?: string
  title: string
  area: ProjectArea
  status: ProjectStatus
  progress: number
  priority: Priority
  description: string
  start_date: string | null // YYYY-MM-DD
  deadline: string | null // YYYY-MM-DD — end date
  repo_url: string | null
  notes: string
  created_at: string
  updated_at: string
}

export const RECURRENCES = ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'] as const
export type Recurrence = (typeof RECURRENCES)[number]

export interface ProjectTask {
  id: string
  user_id?: string
  project_id: string | null // null → standalone task with a category
  category: TaskCategory | null
  title: string
  status: TaskStatus
  is_done: boolean // always status === 'done'
  jira_key: string | null
  description: string
  priority: Priority
  start_date: string | null // YYYY-MM-DD
  due_date: string | null // YYYY-MM-DD
  /** When completed, the next one is created. */
  recurrence: Recurrence | null
  created_at: string
}

export interface Transaction {
  id: string
  user_id?: string
  date: string // YYYY-MM-DD
  type: TxType
  category: string
  concept: string
  amount: number
  account: string
  created_at: string
}

export const CATEGORY_COLORS = ['rose', 'orange', 'amber', 'lime', 'emerald', 'teal', 'cyan', 'sky', 'indigo', 'violet', 'fuchsia', 'slate'] as const
export type CategoryColor = (typeof CATEGORY_COLORS)[number]

export interface Category {
  id: string
  user_id?: string
  name: string // lower-case; matches transactions.category
  type: TxType
  color: CategoryColor
  /** Monthly limit for expenses; null = none. */
  budget: number | null
  created_at: string
}

/** "Concepts that contain X are Y". */
export interface CategoryRule {
  id: string
  user_id?: string
  pattern: string
  type: TxType
  category: string
  created_at: string
}

/** A subscription or any other charge that repeats. */
export interface Bill {
  id: string
  user_id?: string
  name: string
  amount: number
  category: string
  account: string
  period: 'weekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'yearly'
  anchor_date: string // YYYY-MM-DD, one real charge date
  /** Days before the charge to warn (0 = no warning). */
  notify_days: number
  active: boolean
  created_at: string
}

export const ACCOUNT_KINDS = ['checking', 'savings', 'credit', 'cash', 'investment'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export interface Account {
  id: string
  user_id?: string
  name: string
  kind: AccountKind
  color: CategoryColor
  is_primary: boolean
  created_at: string
}

export interface WorkLog {
  id: string
  user_id?: string
  date: string // YYYY-MM-DD
  hours: number
  description: string
  jira_key: string | null
  task_id: string | null
  created_at: string
}

export const SUBJECT_STATUSES = ['in_progress', 'passed', 'failed'] as const
export type SubjectStatus = (typeof SUBJECT_STATUSES)[number]

export interface StudyProgram {
  id: string
  user_id?: string
  name: string
  institution: string
  academic_year: string
  total_credits: number | null
  created_at: string
}

export interface StudySubject {
  id: string
  user_id?: string
  program_id: string
  name: string
  code: string
  credits: number
  semester: string
  professor: string
  color: CategoryColor
  status: SubjectStatus
  /** Official grade (e.g. from the acta). Overrides the calculated one. */
  final_grade: number | null
  target_grade: number
  created_at: string
}

export const ASSESSMENT_KINDS = ['delivery', 'exam'] as const
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number]

export interface StudyAssessment {
  id: string
  user_id?: string
  subject_id: string
  name: string
  weight: number // % of the final grade
  grade: number | null // 0–10, null = not graded yet
  /** 'delivery' = has a deadline · 'exam' = happens at a date and time. */
  kind: AssessmentKind
  /** Delivery deadline or exam date+time (ISO). Drives the Telegram reminders. */
  due_at: string | null
  /** Delivered / sat: no more reminders. */
  is_done: boolean
  created_at: string
}

export interface StudyFile {
  id: string
  user_id?: string
  subject_id: string
  name: string
  topic: string
  storage_path: string
  size_bytes: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Pokémon Competitive (TCG & VGC)
// ---------------------------------------------------------------------------
export const POKEMON_GAMES = ['tcg', 'vgc'] as const
export type PokemonGame = (typeof POKEMON_GAMES)[number]

export const MATCH_FORMATS = ['bo1', 'bo3'] as const
export type MatchFormat = (typeof MATCH_FORMATS)[number]

export const TOURNAMENT_CATEGORIES = [
  'league_challenge', 'league_cup', 'regional', 'special', 'international', 'worlds',
  'global_challenge', 'grand_challenge', 'online', 'local', 'other',
] as const
export type TournamentCategory = (typeof TOURNAMENT_CATEGORIES)[number]

export const TOURNAMENT_STATUSES = ['planned', 'in_progress', 'finished', 'dropped'] as const
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number]

export const ROUND_RESULTS = ['win', 'loss', 'tie', 'bye', 'no_show'] as const
export type RoundResult = (typeof ROUND_RESULTS)[number]

export type RoundPhase = 'swiss' | 'top_cut'
export type TopCutType = 'standard' | 'asymmetric'

export interface TcgDeck {
  id: string
  user_id?: string
  name: string
  format: string
  /** 1–2 sprite slugs that identify the deck. */
  icons: string[]
  list_text: string
  notes: string
  /** Physically built: its cards are not available for anything else. */
  is_built: boolean
  created_at: string
}

/** Past lists of a deck; the current one is in the deck itself. */
export interface DeckVersion {
  id: string
  user_id?: string
  deck_id: string
  from_date: string // YYYY-MM-DD
  list_text: string
  note: string
  created_at: string
}

/** Plan against an archetype, for one deck or for all (deck_id = null). */
export interface MatchupNote {
  id: string
  user_id?: string
  deck_id: string | null
  archetype: string // rivalKey
  name: string
  icons: string[]
  notes: string
  created_at: string
}

/** Cards I own: one row per print + language + condition + finish. */
export interface OwnedCard {
  id: string
  user_id?: string
  tcgdex_id: string
  set_code: string
  set_name: string
  number: string
  /** Name in the card's own language. */
  name: string
  name_en: string
  category: 'pokemon' | 'trainer' | 'energy'
  /** Same signature = same card for deck building (reprints). */
  signature: string
  rarity: string
  image: string | null
  language: string
  condition: string
  finish: string
  first_edition: boolean
  signed: boolean
  altered: boolean
  grade_company: string
  grade: string
  quantity: number
  location: string
  for_sale: boolean
  paid: number | null
  acquired_at: string | null
  cm_product: number | null
  /** Cardmarket's daily guide: lowest and trend in any language. */
  ref_low: number | null
  ref_trend: number | null
  ref_date: string | null
  /** Lowest price in this card's language, noted by hand. */
  own_price: number | null
  own_price_date: string | null
  notes: string
  created_at: string
}

/** Value of the collection on a day. */
export interface CollectionSnapshot {
  id: string
  user_id?: string
  date: string
  total: number
  cards: number
  created_at: string
}

export interface VgcTeam {
  id: string
  user_id?: string
  name: string
  regulation: string
  paste: string
  notes: string
  created_at: string
}

export interface Tournament {
  id: string
  user_id?: string
  game: PokemonGame
  name: string
  date: string // YYYY-MM-DD
  mode: 'in_person' | 'online'
  location: string
  category: TournamentCategory
  format: string
  players: number | null
  swiss_rounds: number | null
  swiss_format: MatchFormat
  has_top_cut: boolean
  top_cut_type: TopCutType
  top_cut_size: number | null
  /** Asked explicitly, never assumed: null until the player answers. */
  top_cut_format: MatchFormat | null
  made_top_cut: boolean
  deck_id: string | null
  team_id: string | null
  status: TournamentStatus
  /** Best bracket reached: 1 = champion, 2 = finalist, 4 = top 4… */
  placement_bracket: number | null
  /** Exact final position, if known. */
  placement: number | null
  cp: number | null
  notes: string
  created_at: string
}

/** One game inside a match. `first` = did I go first (null = not recorded / VGC). */
export interface RoundGame {
  result: 'win' | 'loss' | 'tie'
  first: boolean | null
}

export interface RivalPokemon {
  species: string
  item: string
  nature: string
  moves: string[]
}

/** Record of an opponent as the event goes on (our match included). */
export interface RivalRecord {
  w: number
  l: number
  t: number
  dropped: boolean
  /** One of the wins was a bye: it does not count for Op Win %. */
  bye: boolean
}

export interface TournamentRound {
  id: string
  user_id?: string
  tournament_id: string
  phase: RoundPhase
  number: number
  result: RoundResult
  games: RoundGame[]
  won_dice: boolean | null
  went_first: boolean | null
  opponent_name: string
  /** TCG: archetype id, 'other' for a custom one, '' when unknown. */
  opponent_archetype: string
  opponent_icons: string[]
  opponent_deck_name: string
  /** VGC: up to 4 Pokémon seen. */
  opponent_pokemon: RivalPokemon[]
  /** null = not noted. */
  opponent_record: RivalRecord | null
  /** VGC: the species I brought from my own team. */
  my_pokemon: string[]
  notes: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Running & Race Prep
// ---------------------------------------------------------------------------
export const RUN_TYPES = ['easy', 'interval', 'tempo', 'long', 'race'] as const
export type RunType = (typeof RUN_TYPES)[number]

export const BLOCK_KINDS = ['warmup', 'strides', 'progressive', 'main', 'hills', 'easy', 'cooldown'] as const
export type BlockKind = (typeof BLOCK_KINDS)[number]

/** One part of a structured session, e.g. "5–6 × 800 m in 4:30, 3 min recovery". */
export interface WorkoutBlock {
  kind: BlockKind
  reps: number
  /** "5–6 reps": anything from `reps` to `reps_max` fulfils it. */
  reps_max: number | null
  unit: 's' | 'm'
  /** Seconds or metres of each rep. */
  amount: number
  /** Recovery between reps. */
  recovery_s: number | null
  /** 'time' = seconds per rep · 'pace' = seconds per km. */
  target_kind: 'time' | 'pace' | null
  target_s: number | null
  /** Hill reps only: `amount` goes up, then recovery, then `down` (same unit) back down. */
  hill?: { recovery_s: number | null; down: number }
}

/** A block as it was actually run. */
export interface RunBlock extends WorkoutBlock {
  done: boolean
  /** Per rep: seconds (blocks in metres) or pace in s/km (blocks in time); null = not run or not timed. */
  splits: (number | null)[]
  /** Hill reps: how many were run (they are counted, not timed). */
  reps_done?: number
}

export interface Shoe {
  id: string
  user_id?: string
  name: string
  /** Kilometres before using the app. */
  start_km: number
  limit_km: number
  retired: boolean
  /** Preselected in new runs. */
  is_default: boolean
  created_at: string
}

/** Reusable structured session. */
export interface RunWorkout {
  id: string
  user_id?: string
  name: string
  type: RunType
  blocks: WorkoutBlock[]
  created_at: string
}

export interface RaceGoal {
  id: string
  user_id?: string
  name: string
  date: string // YYYY-MM-DD
  distance_km: number
  /** Previous personal best over this distance (seconds). */
  previous_best_s: number | null
  target_s: number
  notes: string
  created_at: string
}

/** A planned session. */
export interface RunPlanSession {
  id: string
  user_id?: string
  goal_id: string
  date: string // YYYY-MM-DD
  type: RunType
  distance_km: number
  pace_s: number | null // target pace, s/km
  description: string
  blocks: WorkoutBlock[]
  created_at: string
}

/** A session actually run. */
export interface Run {
  id: string
  user_id?: string
  /** The planned session it fulfils, if any. */
  plan_id: string | null
  date: string // YYYY-MM-DD
  type: RunType
  distance_km: number
  duration_s: number
  /** Pace of the fast part (intervals / tempo blocks), s/km. */
  work_pace_s: number | null
  avg_hr: number | null
  rpe: number | null // 1–10
  /** All-out effort (test or race): the best basis for the projection. */
  is_test: boolean
  notes: string
  blocks: RunBlock[]
  shoe_id: string | null
  created_at: string
}

export interface Tables {
  events: CalendarEvent
  projects: Project
  project_tasks: ProjectTask
  transactions: Transaction
  categories: Category
  accounts: Account
  work_logs: WorkLog
  study_programs: StudyProgram
  study_subjects: StudySubject
  study_assessments: StudyAssessment
  study_files: StudyFile
  tcg_decks: TcgDeck
  vgc_teams: VgcTeam
  tournaments: Tournament
  tournament_rounds: TournamentRound
  race_goals: RaceGoal
  run_plan: RunPlanSession
  runs: Run
  run_workouts: RunWorkout
  category_rules: CategoryRule
  bills: Bill
  shoes: Shoe
  deck_versions: DeckVersion
  matchup_notes: MatchupNote
  owned_cards: OwnedCard
  collection_snapshots: CollectionSnapshot
}

export type TableName = keyof Tables
export type Dataset = { [K in TableName]: Tables[K][] }
/** Row payload for inserts: server-managed fields are optional. */
export type NewRow<K extends TableName> = Omit<Tables[K], 'id' | 'user_id' | 'created_at' | 'updated_at'> & {
  id?: string
}
