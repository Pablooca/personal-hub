/**
 * Everything with a date, in one list: the calendar and the overview read it.
 * Nothing is copied into `events`: items are derived, so they can never go stale.
 */
import type { Dataset } from './types'

export const AGENDA_SOURCES = ['run', 'study', 'plan', 'tournament', 'task', 'project', 'bill'] as const
export type AgendaSource = (typeof AGENDA_SOURCES)[number]

export const SOURCE_LABELS: Record<AgendaSource, string> = { run: 'Entrenos', study: 'Entregas y exámenes', plan: 'Plan de estudio', tournament: 'Torneos', task: 'Tareas', project: 'Proyectos', bill: 'Cobros' }

export type Target =
  | { kind: 'event' | 'task' | 'project' | 'subject' | 'run' | 'session' | 'goal' | 'tournament' | 'deck' | 'team' | 'tx' | 'worklog' | 'card' | 'match' | 'bill' | 'plan'; id: string }

export interface AgendaItem {
  key: string
  source: AgendaSource
  date: string // YYYY-MM-DD
  time: string | null // HH:mm
  title: string
  detail: string
  done: boolean
  target: Target
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const localTime = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const km = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const RUN: Record<string, string> = { easy: 'Rodaje', interval: 'Series', tempo: 'Tempo', long: 'Tirada larga', race: 'Test' }

export interface AgendaDeps {
  /** Planned session id → the run that fulfils it. */
  matched: ReadonlyMap<string, { id: string }>
  /** Upcoming charges. */
  bills?: { id: string; name: string; amount: number; date: string }[]
}

export function agendaItems(d: Dataset, { matched, bills = [] }: AgendaDeps): AgendaItem[] {
  const out: AgendaItem[] = []
  for (const s of d.run_plan) {
    const run = matched.get(s.id)
    out.push({ key: `run-${s.id}`, source: 'run', date: s.date, time: null, title: `${RUN[s.type]} · ${km(s.distance_km)}`, detail: s.description, done: Boolean(run), target: run ? { kind: 'run', id: run.id } : { kind: 'session', id: s.id } })
  }
  for (const g of d.race_goals) out.push({ key: `goal-${g.id}`, source: 'run', date: g.date, time: null, title: g.name, detail: `Carrera · ${km(g.distance_km)}`, done: false, target: { kind: 'goal', id: g.id } })

  const subjects = new Map(d.study_subjects.map((s) => [s.id, s]))
  // Deadlines the user also added to the calendar by hand would show twice.
  const events = new Set(d.events.map((e) => `${localDay(e.start_at)}|${fold(e.title)}`))
  for (const a of d.study_assessments) {
    if (!a.due_at) continue
    const subject = subjects.get(a.subject_id)
    const date = localDay(a.due_at)
    const name = fold(a.name)
    const dup = [...events].some((k) => k.startsWith(`${date}|`) && k.includes(name) && (!subject || k.includes(fold(subject.name))))
    if (dup) continue
    out.push({
      key: `study-${a.id}`, source: 'study', date, time: localTime(a.due_at), title: a.kind === 'exam' ? `Examen: ${a.name}` : `Entrega: ${a.name}`,
      detail: subject?.name ?? '', done: a.is_done || a.grade !== null, target: { kind: 'subject', id: a.subject_id },
    })
  }
  // Dated blocks of a study plan (weekly goals span a week: they live in the plan).
  for (const i of d.study_plan_items) {
    if (i.kind === 'goal') continue
    const subject = i.subject_id ? subjects.get(i.subject_id) : undefined
    const kind = i.kind === 'review' ? 'Repaso' : i.kind === 'mock' ? 'Simulacro' : i.kind === 'buffer' ? 'Día colchón' : 'Hito'
    out.push({ key: `plan-${i.id}`, source: 'plan', date: i.date, time: null, title: i.title, detail: [kind, subject?.code || subject?.name].filter(Boolean).join(' · '), done: i.is_done, target: { kind: 'plan', id: i.plan_id } })
  }
  for (const t of d.tournaments) {
    out.push({ key: `tournament-${t.id}`, source: 'tournament', date: t.date, time: null, title: t.name, detail: `${t.game.toUpperCase()} · ${t.mode === 'online' ? 'Online' : t.location || 'Presencial'}`, done: t.status === 'finished' || t.status === 'dropped', target: { kind: 'tournament', id: t.id } })
  }
  const projects = new Map(d.projects.map((p) => [p.id, p]))
  for (const t of d.project_tasks) {
    if (!t.due_date) continue
    out.push({ key: `task-${t.id}`, source: 'task', date: t.due_date, time: null, title: t.title, detail: t.project_id ? (projects.get(t.project_id)?.title ?? '') : t.category === 'personal' ? 'Personal' : 'Trabajo', done: t.is_done, target: { kind: 'task', id: t.id } })
  }
  for (const p of d.projects) {
    if (!p.deadline) continue
    out.push({ key: `project-${p.id}`, source: 'project', date: p.deadline, time: null, title: p.title, detail: 'Fin del proyecto', done: p.status === 'completed', target: { kind: 'project', id: p.id } })
  }
  for (const b of bills) {
    out.push({ key: `bill-${b.id}-${b.date}`, source: 'bill', date: b.date, time: null, title: b.name, detail: b.amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }), done: false, target: { kind: 'bill', id: b.id } })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title))
}

// ------------------------------------------------------------------- search
export interface SearchHit {
  key: string
  group: string
  title: string
  detail: string
  target: Target
  score: number
}

/** Every word must appear; titles that start with the query come first. */
export function search(d: Dataset, query: string, limit = 40): SearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const hits: SearchHit[] = []
  const add = (group: string, target: Target, title: string, detail: string, extra = '', recency = '') => {
    const t = fold(title)
    const all = `${t} ${fold(detail)} ${fold(extra)}`
    if (!words.every((w) => all.includes(w))) return
    const score = (t.startsWith(words.join(' ')) ? 100 : 0) + words.filter((w) => t.includes(w)).length * 10
    hits.push({ key: `${target.kind}-${target.id}`, group, title, detail, target, score: score + (recency ? Number(recency.slice(0, 4)) % 100 / 100 : 0) })
  }
  const subjects = new Map(d.study_subjects.map((s) => [s.id, s.name]))
  const projects = new Map(d.projects.map((p) => [p.id, p.title]))
  for (const p of d.projects) add('Proyectos', { kind: 'project', id: p.id }, p.title, '', `${p.description} ${p.notes}`)
  for (const t of d.project_tasks) add('Tareas', { kind: 'task', id: t.id }, t.title, [t.jira_key, t.project_id && projects.get(t.project_id)].filter(Boolean).join(' · '), t.description)
  for (const e of d.events) add('Eventos', { kind: 'event', id: e.id }, e.title, localDay(e.start_at), e.description, e.start_at)
  for (const s of d.study_subjects) add('Asignaturas', { kind: 'subject', id: s.id }, s.name, [s.code, s.professor].filter(Boolean).join(' · '))
  for (const a of d.study_assessments) add('Entregas y exámenes', { kind: 'subject', id: a.subject_id }, a.name, subjects.get(a.subject_id) ?? '')
  for (const t of d.study_topics) add('Temas', { kind: 'subject', id: t.subject_id }, t.name, subjects.get(t.subject_id) ?? '', t.notes)
  for (const p of d.study_plans) add('Planes de estudio', { kind: 'plan', id: p.id }, p.name, `${p.start_date} → ${p.end_date}`, p.notes)
  for (const i of d.study_plan_items) add('Plan de estudio', { kind: 'plan', id: i.plan_id }, i.title, i.date, i.notes, i.date)
  for (const f of d.study_files) add('Apuntes', { kind: 'subject', id: f.subject_id }, f.name, [subjects.get(f.subject_id), f.topic].filter(Boolean).join(' · '))
  for (const t of d.transactions) add('Movimientos', { kind: 'tx', id: t.id }, t.concept || t.category, `${t.date} · ${t.amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`, `${t.category} ${t.account}`, t.date)
  for (const b of d.bills) add('Cobros', { kind: 'bill', id: b.id }, b.name, b.amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }))
  for (const l of d.work_logs) add('Horas', { kind: 'worklog', id: l.id }, l.description || l.jira_key || 'Horas', `${l.date}${l.jira_key ? ` · ${l.jira_key}` : ''}`, '', l.date)
  for (const t of d.tournaments) add('Torneos', { kind: 'tournament', id: t.id }, t.name, `${t.game.toUpperCase()} · ${t.date}`, `${t.location} ${t.notes}`, t.date)
  for (const m of d.pokemon_matches) add('Partidas', { kind: 'match', id: m.id }, m.opponent_name || m.opponent_deck_name || 'Partida', `${m.game.toUpperCase()} · ${m.format.toUpperCase()} · ${m.date}`, `${m.venue} ${m.notes} ${m.opponent_deck_name}`, m.date)
  for (const k of d.tcg_decks) add('Mazos', { kind: 'deck', id: k.id }, k.name, k.format, k.list_text)
  for (const c of d.owned_cards) add('Colección', { kind: 'card', id: c.id }, c.name, `${c.set_code} ${c.number} · ${c.quantity}×`, `${c.name_en} ${c.set_name} ${c.location}`)
  for (const k of d.vgc_teams) add('Equipos', { kind: 'team', id: k.id }, k.name, k.regulation, k.paste)
  for (const g of d.race_goals) add('Carreras', { kind: 'goal', id: g.id }, g.name, g.date)
  for (const r of d.runs) add('Entrenamientos', { kind: 'run', id: r.id }, `${RUN[r.type]} · ${km(r.distance_km)}`, r.date, r.notes, r.date)
  const seen = new Set<string>()
  return hits
    .sort((a, b) => b.score - a.score || b.detail.localeCompare(a.detail))
    .filter((h) => {
      const k = `${h.group}|${h.key}|${h.title}`
      return seen.has(k) ? false : (seen.add(k), true)
    })
    .slice(0, limit)
}
