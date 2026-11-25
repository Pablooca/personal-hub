/** Race preparation: paces, plan import and the "am I ready?" engine. Pure functions. */
import { completion, defaultBlocks, ensureSections, formatWorkout, parseWorkout, repDrift, targetPace } from './workout.ts'
import type { RaceGoal, Run, RunPlanSession, RunType, WorkoutBlock } from './types'

export const RUN_TYPE_LABELS: Record<RunType, string> = { easy: 'Rodaje suave', interval: 'Series / intervalos', tempo: 'Tempo / umbral', long: 'Tirada larga', race: 'Test / carrera' }
export const RUN_TYPE_SHORT: Record<RunType, string> = { easy: 'Rodaje', interval: 'Series', tempo: 'Tempo', long: 'Larga', race: 'Test' }

export const DISTANCES = [
  { label: '10K', km: 10 },
  { label: 'Media maratón', km: 21.097 },
  { label: 'Maratón', km: 42.195 },
] as const

// -------------------------------------------------------------------- format
const pad = (n: number) => String(n).padStart(2, '0')
export function fmtDuration(s: number): string {
  const t = Math.round(Math.abs(s))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  return `${s < 0 ? '−' : ''}${h ? `${h}:${pad(m)}` : m}:${pad(t % 60)}`
}
export const fmtPace = (secPerKm: number) => `${Math.floor(Math.round(secPerKm) / 60)}:${pad(Math.round(secPerKm) % 60)}`
/** One decimal, except the official half and full marathon distances. */
export const fmtKm = (km: number) => km.toLocaleString('es-ES', { maximumFractionDigits: [21.097, 42.195].some((d) => Math.abs(d - km) < 0.0005) ? 3 : 1 })

/** "1:45:30" → h:m:s · "45:20" → m:s · "45" → minutes · "1h45" → h+min */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  const hm = t.match(/^(\d+)h(\d{1,2})?m?(?:in)?$/)
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2] ?? 0) * 60
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null
  const p = t.split(':').map(Number)
  if (p.slice(1).some((x) => x > 59)) return null
  const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 60
  return s > 0 ? s : null
}

/** "5:30", "5'30", "5:30/km", "5.5" (decimal minutes) → seconds per km */
export function parsePace(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '').replace(/(min)?\/km$/, '').replace(/["”]$/, '')
  if (!t) return null
  const ms = t.match(/^(\d{1,2})[:'’′](\d{2})?$/)
  let s: number
  if (ms) {
    if (Number(ms[2] ?? 0) > 59) return null
    s = Number(ms[1]) * 60 + Number(ms[2] ?? 0)
  } else if (/^\d{1,2}([.,]\d+)?$/.test(t)) s = Math.round(Number(t.replace(',', '.')) * 60)
  else return null
  return s >= 100 && s <= 1200 ? s : null
}

export const parseKm = (text: string): number | null => {
  const n = Number(text.trim().toLowerCase().replace(/\s*km$/, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 && n <= 500 ? n : null
}

export const goalPace = (g: Pick<RaceGoal, 'target_s' | 'distance_km'>) => g.target_s / g.distance_km
export const runPace = (r: Pick<Run, 'duration_s' | 'distance_km'>) => r.duration_s / r.distance_km

/** Riegel: T2 = T1 · (D2 / D1)^1.06 */
export const riegel = (t1: number, d1: number, d2: number) => t1 * (d2 / d1) ** 1.06

// --------------------------------------------------------------------- dates
const DAY = 86_400_000
const utc = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY)
export const shiftDay = (key: string, n: number) => new Date(utc(key) + n * DAY).toISOString().slice(0, 10)
/** Monday of the week. */
export const weekOf = (key: string) => shiftDay(key, -((new Date(utc(key)).getUTCDay() + 6) % 7))

// --------------------------------------------------------------- plan import
export interface PlanDraft {
  date: string
  type: RunType
  distance_km: number
  pace_s: number | null
  description: string
  blocks: WorkoutBlock[]
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function parseRunType(text: string): RunType | null {
  const t = fold(text)
  if (!t) return null
  if (/^(easy|rodaje|suave|recuperacion|recovery|facil)|rodaje|suave|recup/.test(t)) return 'easy'
  if (/interval|serie|fartlek|vo2|repet/.test(t)) return 'interval'
  if (/tempo|umbral|threshold|ritmo/.test(t)) return 'tempo'
  if (/long|larga|tirada|fondo/.test(t)) return 'long'
  if (/race|carrera|test|compet/.test(t)) return 'race'
  return null
}

export function parseDate(text: string): string | null {
  const t = text.trim()
  let y: number, m: number, d: number
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  const es = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (es) [y, m, d] = [Number(es[3]), Number(es[2]), Number(es[1])]
  else return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null
}

function splitCsv(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

const KEYS: Record<keyof PlanDraft, RegExp> = {
  blocks: /^(blocks|estructura|structure|bloques|workout)$/,
  date: /^(date|fecha|dia)$/,
  type: /^(type|tipo|sesion|session)$/,
  distance_km: /^(distance|distancia|distance_?km|distancia_?km|km)$/,
  pace_s: /^(pace|ritmo|target_?pace|ritmo_?objetivo|pace_s)$/,
  description: /^(description|descripcion|notas|notes|detalle|detalles)$/,
}
const keyOf = (header: string) => (Object.keys(KEYS) as (keyof PlanDraft)[]).find((k) => KEYS[k].test(fold(header).replace(/\s*\(.*\)$/, '').replace(/\s+/g, '_')))

/** CSV (`,` or `;`) or JSON (array, or `{ sessions: [...] }`). Bad rows are reported, not imported. */
export function parsePlan(text: string, easy = 390): { sessions: PlanDraft[]; errors: string[] } {
  const errors: string[] = []
  const sessions: PlanDraft[] = []
  const trimmed = text.replace(/^﻿/, '').trim()
  if (!trimmed) return { sessions, errors: ['El archivo está vacío.'] }

  const add = (raw: Partial<Record<keyof PlanDraft, string>>, where: string) => {
    const date = parseDate(raw.date ?? '')
    const type = parseRunType(raw.type ?? '')
    const km = parseKm(raw.distance_km ?? '')
    if (!date) return errors.push(`${where}: fecha no válida «${raw.date ?? ''}».`)
    if (!type) return errors.push(`${where}: tipo de sesión no reconocido «${raw.type ?? ''}».`)
    if (!km || km > 200) return errors.push(`${where}: distancia no válida «${raw.distance_km ?? ''}».`)
    const pace = raw.pace_s?.trim() ? (/^\d{3,4}$/.test(raw.pace_s.trim()) ? Number(raw.pace_s) : parsePace(raw.pace_s)) : null
    if (raw.pace_s?.trim() && !pace) errors.push(`${where}: ritmo no válido «${raw.pace_s}»; se importa sin ritmo.`)
    const structure = raw.blocks?.trim() ? parseWorkout(raw.blocks) : { blocks: [], errors: [] }
    if (structure.errors.length) errors.push(`${where}: ${structure.errors[0]}`)
    sessions.push({ date, type, distance_km: Math.round(km * 100) / 100, pace_s: pace ?? targetPace(structure.blocks), description: (raw.description ?? '').slice(0, 1000), blocks: structure.blocks.length ? ensureSections(structure.blocks) : defaultBlocks(type, km, pace, easy) })
  }

  if (/^[[{]/.test(trimmed)) {
    let json: unknown
    try {
      json = JSON.parse(trimmed)
    } catch {
      return { sessions, errors: ['El JSON no es válido.'] }
    }
    const list = Array.isArray(json) ? json : ((json as Record<string, unknown>).sessions ?? (json as Record<string, unknown>).sesiones)
    if (!Array.isArray(list)) return { sessions, errors: ['El JSON debe ser una lista de sesiones.'] }
    list.forEach((item, i) => {
      if (!item || typeof item !== 'object') return errors.push(`Sesión ${i + 1}: no es válida.`)
      const raw: Partial<Record<keyof PlanDraft, string>> = {}
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        const key = keyOf(k)
        if (key && v !== null && v !== undefined) raw[key] = String(v)
      }
      return add(raw, `Sesión ${i + 1}`)
    })
  } else {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim())
    const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) && lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ','
    const head = splitCsv(lines[0], sep).map(keyOf)
    const hasHead = head.includes('date')
    const cols = hasHead ? head : (['date', 'type', 'distance_km', 'pace_s', 'description', 'blocks'] as const)
    if (hasHead && (!head.includes('type') || !head.includes('distance_km'))) return { sessions, errors: ['Faltan columnas: se necesitan fecha, tipo y distancia.'] }
    lines.slice(hasHead ? 1 : 0).forEach((line, i) => {
      const raw: Partial<Record<keyof PlanDraft, string>> = {}
      splitCsv(line, sep).forEach((v, j) => {
        const key = cols[j]
        if (key) raw[key] = v
      })
      add(raw, `Línea ${i + (hasHead ? 2 : 1)}`)
    })
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date))
  return { sessions, errors }
}

export function planToCsv(list: Pick<RunPlanSession, 'date' | 'type' | 'distance_km' | 'pace_s' | 'description' | 'blocks'>[]): string {
  const q = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return ['fecha;tipo;distancia_km;ritmo;descripcion;estructura', ...list.map((s) => [s.date, RUN_TYPE_SHORT[s.type], String(s.distance_km).replace('.', ','), s.pace_s ? fmtPace(s.pace_s) : '', q(s.description), q(formatWorkout(s.blocks))].join(';'))].join('\n')
}

// ------------------------------------------------------------------ matching
/** Which runs fulfil each planned session: explicit link first, then same day (same type preferred). */
export function matchRuns(plan: RunPlanSession[], runs: Run[]): Map<string, Run> {
  const out = new Map<string, Run>()
  const ids = new Set(plan.map((p) => p.id))
  const used = new Set<string>()
  for (const r of runs)
    if (r.plan_id && ids.has(r.plan_id)) {
      if (!out.has(r.plan_id)) out.set(r.plan_id, r)
      used.add(r.id)
    }
  for (const sameType of [true, false])
    for (const r of runs) {
      if (used.has(r.id) || r.plan_id) continue
      const s = plan.find((p) => !out.has(p.id) && p.date === r.date && (!sameType || p.type === r.type))
      if (s) {
        out.set(s.id, r)
        used.add(r.id)
      }
    }
  return out
}

// -------------------------------------------------------------------- engine
export type Light = 'green' | 'amber' | 'red' | 'none'
export const LIGHT_LABELS: Record<Light, string> = { green: 'En objetivo / Excelente', amber: 'En progreso / Ajustado', red: 'En riesgo / Déficit', none: 'Faltan datos' }

const KEY_TYPES: RunType[] = ['long', 'interval', 'tempo']
export const isKey = (t: RunType) => KEY_TYPES.includes(t)

/** Slower than planned by more than this is a significant deviation. */
export const PACE_TOLERANCE = 0.04
const HARD_RPE = 8

export interface WeekVolume {
  week: string // Monday
  planned: number
  done: number
  sessions: number
  completed: number
}

export interface Projection {
  run: Run
  /** Projected time at the goal distance. */
  time: number
  pace: number
  /** Seconds per km over (+) or under (−) the goal pace. */
  gap: number
  /** Gap as a fraction of the goal time. */
  gapPct: number
  /** Based on a short or old effort. */
  lowConfidence: boolean
}

export interface KeySession {
  session: RunPlanSession
  run: Run | null
  ok: boolean
  /** Fraction slower (+) / faster (−) than planned; null = unknown. */
  paceDeviation: number | null
  /** How much of the session was done: reps for structured sessions, distance otherwise. */
  distancePct: number | null
  /** Reps run / planned, for structured sessions. */
  reps: { done: number; min: number; max: number } | null
}

export interface Alert {
  level: 'warn' | 'bad'
  text: string
}

export interface Readiness {
  light: Light
  score: number | null
  daysLeft: number
  weeksLeft: number
  adherence: { due: number; done: number; pct: number | null; plannedKm: number; doneKm: number; kmPct: number | null; score: number | null }
  volume: { weeks: WeekVolume[]; remainingKm: number; remainingSessions: number; weeklyRemaining: number; recentWeekly: number; projectedWeekly: number | null }
  projection: Projection | null
  projectionScore: number | null
  key: { list: KeySession[]; long: { due: number; done: number }; quality: { due: number; done: number }; pct: number | null; score: number | null }
  fatigue: { avg7: number | null; streak: number; high: boolean }
  alerts: Alert[]
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))

/** Pace that should be compared with the plan: the fast part if recorded, else the average. */
export const comparablePace = (r: Run) => r.work_pace_s ?? (r.type === 'interval' ? null : runPace(r))

export function project(goal: RaceGoal, runs: Run[], today: string): Projection | null {
  const pick = (days: number, minKm: number) =>
    runs
      // The average pace of an interval session includes the recoveries: useless for a projection.
      .filter((r) => r.type !== 'interval' && r.date <= today && daysBetween(r.date, today) <= days && r.distance_km >= minKm)
      .map((run) => ({ run, time: riegel(run.duration_s, run.distance_km, goal.distance_km) }))
      .sort((a, b) => a.time - b.time)[0]
  const solid = pick(42, Math.max(3, goal.distance_km * 0.2))
  const best = solid ?? pick(84, 3)
  if (!best) return null
  const pace = best.time / goal.distance_km
  return { run: best.run, time: best.time, pace, gap: pace - goalPace(goal), gapPct: (best.time - goal.target_s) / goal.target_s, lowConfidence: !solid }
}

export function evaluate(goal: RaceGoal, planAll: RunPlanSession[], runsAll: Run[], today: string): Readiness {
  const plan = planAll.filter((p) => p.goal_id === goal.id && p.date <= goal.date).sort((a, b) => a.date.localeCompare(b.date))
  const start = plan[0]?.date ?? goal.created_at.slice(0, 10)
  const runs = runsAll.filter((r) => r.date <= today).sort((a, b) => a.date.localeCompare(b.date))
  const inPlan = runs.filter((r) => r.date >= start && r.date <= goal.date)
  const matched = matchRuns(plan, runsAll)
  const alerts: Alert[] = []
  const daysLeft = daysBetween(today, goal.date)
  const weeksLeft = Math.max(0, daysLeft / 7)

  // --- adherence. Today's session only counts once it is done.
  const due = plan.filter((p) => p.date < today || (p.date === today && matched.has(p.id)))
  const done = due.filter((p) => matched.has(p.id))
  const plannedKm = due.reduce((a, p) => a + p.distance_km, 0)
  const doneKm = inPlan.reduce((a, r) => a + r.distance_km, 0)
  const pct = due.length ? (done.length / due.length) * 100 : null
  const kmPct = plannedKm ? (doneKm / plannedKm) * 100 : null
  const adherenceScore = pct === null || kmPct === null ? null : clamp((Math.min(100, pct) + Math.min(100, kmPct)) / 2)

  // --- weekly volume
  const weekMap = new Map<string, WeekVolume>()
  const week = (d: string) => {
    const k = weekOf(d)
    if (!weekMap.has(k)) weekMap.set(k, { week: k, planned: 0, done: 0, sessions: 0, completed: 0 })
    return weekMap.get(k)!
  }
  for (const p of plan) {
    const w = week(p.date)
    w.planned += p.distance_km
    w.sessions++
    if (matched.has(p.id)) w.completed++
  }
  for (const r of inPlan) week(r.date).done += r.distance_km
  const weeks = [...weekMap.values()].sort((a, b) => a.week.localeCompare(b.week))
  const pending = plan.filter((p) => p.date >= today && !matched.has(p.id) && daysLeft >= 0)
  const remainingKm = pending.reduce((a, p) => a + p.distance_km, 0)
  const remainingWeeks = new Set(pending.map((p) => weekOf(p.date))).size
  const weeklyRemaining = remainingWeeks ? remainingKm / remainingWeeks : 0
  const recent = runs.filter((r) => daysBetween(r.date, today) < 28)
  const recentWeekly = recent.reduce((a, r) => a + r.distance_km, 0) / 4
  const projectedWeekly = weeklyRemaining && kmPct !== null ? weeklyRemaining * Math.min(1, kmPct / 100) : null

  // --- projection
  const projection = project(goal, runs, today)
  const projectionScore = projection ? clamp(100 - Math.max(0, projection.gapPct) * 1000) : null

  // --- key sessions
  const list: KeySession[] = due
    .filter((p) => isKey(p.type))
    .map((session) => {
      const run = matched.get(session.id) ?? null
      const actual = run ? comparablePace(run) : null
      const paceDeviation = actual !== null && session.pace_s ? actual / session.pace_s - 1 : null
      const reps = run ? completion(session.blocks, run.blocks) : null
      const distancePct = run ? (reps ? (reps.done / reps.min) * 100 : (run.distance_km / session.distance_km) * 100) : null
      return { session, run, paceDeviation, distancePct, reps, ok: run !== null && (distancePct ?? 0) >= 85 && (paceDeviation === null || paceDeviation <= PACE_TOLERANCE) }
    })
  const count = (types: RunType[]) => {
    const l = list.filter((k) => types.includes(k.session.type))
    return { due: l.length, done: l.filter((k) => k.run && (k.distancePct ?? 0) >= 85).length }
  }
  const long = count(['long'])
  const quality = count(['interval', 'tempo'])
  const keyPct = list.length ? (list.filter((k) => k.ok).length / list.length) * 100 : null

  // --- fatigue
  const rated = runs.filter((r) => r.rpe !== null && daysBetween(r.date, today) <= 28)
  let streak = 0
  for (let i = rated.length - 1; i >= 0 && rated[i].rpe! >= HARD_RPE; i--) streak++
  const last7 = rated.filter((r) => daysBetween(r.date, today) < 7)
  const avg7 = last7.length ? last7.reduce((a, r) => a + r.rpe!, 0) / last7.length : null
  const high = streak >= 3 || (last7.length >= 3 && avg7! >= 7.5)

  // --- alerts
  if (streak >= 3) alerts.push({ level: 'bad', text: `Fatiga acumulada: ${streak} sesiones seguidas con RPE ${HARD_RPE} o más. Mete un rodaje suave o un día de descanso.` })
  else if (high) alerts.push({ level: 'bad', text: `Fatiga alta: RPE medio de ${avg7!.toFixed(1).replace('.', ',')} en los últimos 7 días.` })
  const hardEasy = recent.filter((r) => r.type === 'easy' && (r.rpe ?? 0) >= 7).length
  if (hardEasy >= 2) alerts.push({ level: 'warn', text: `${hardEasy} rodajes suaves con RPE 7 o más en 4 semanas: baja el ritmo de los días fáciles.` })
  const lastKeys = list.slice(-4)
  const slow = lastKeys.filter((k) => (k.paceDeviation ?? 0) > PACE_TOLERANCE)
  if (slow.length >= 2) {
    const avg = slow.reduce((a, k) => a + (k.paceDeviation ?? 0) * k.session.pace_s!, 0) / slow.length
    alerts.push({ level: 'bad', text: `${slow.length} de tus últimas ${lastKeys.length} sesiones clave fueron más lentas de lo previsto (≈ ${Math.round(avg)} s/km).` })
  }
  const fast = lastKeys.filter((k) => k.session.type === 'long' && (k.paceDeviation ?? 0) < -0.06)
  if (fast.length) alerts.push({ level: 'warn', text: 'Alguna tirada larga ha ido bastante más rápida de lo planificado: guarda esa intensidad para las sesiones de calidad.' })
  const unfinished = lastKeys.filter((k) => k.reps && k.reps.done < k.reps.min)
  if (unfinished.length) alerts.push({ level: 'warn', text: `${unfinished.length === 1 ? 'En una sesión de series reciente no completaste' : `En ${unfinished.length} sesiones de series recientes no completaste`} todas las repeticiones.` })
  const fading = recent.filter((r) => (repDrift(r.blocks) ?? 0) > 0.05)
  if (fading.length >= 2) alerts.push({ level: 'warn', text: `En ${fading.length} sesiones de series has acabado más de un 5 % más lento de lo que empezaste: sal algo más conservador.` })
  const missed = list.filter((k) => !k.run && daysBetween(k.session.date, today) <= 28)
  if (missed.length >= 2) alerts.push({ level: 'bad', text: `Has perdido ${missed.length} sesiones clave en las últimas 4 semanas.` })
  const short = lastKeys.filter((k) => k.session.type === 'long' && k.run && (k.distancePct ?? 100) < 85)
  if (short.length) alerts.push({ level: 'warn', text: `${short.length === 1 ? 'Una tirada larga reciente se quedó' : `${short.length} tiradas largas recientes se quedaron`} por debajo del 85 % de la distancia.` })
  const thisWeek = weekMap.get(weekOf(today))
  const prevWeek = weekMap.get(shiftDay(weekOf(today), -7))
  if (thisWeek && prevWeek && prevWeek.done >= 10 && thisWeek.done > prevWeek.done * 1.35) alerts.push({ level: 'warn', text: `Subida brusca de volumen: ${fmtKm(thisWeek.done)} km frente a ${fmtKm(prevWeek.done)} km la semana pasada.` })
  if (projection?.lowConfidence) alerts.push({ level: 'warn', text: 'La proyección se apoya en un esfuerzo corto o antiguo: haz un test para afinarla.' })
  if (!plan.length) alerts.push({ level: 'warn', text: 'Carga tu planning para medir la adherencia.' })

  // --- verdict: 40 % projection, 35 % adherence, 25 % key sessions (over what is known)
  const parts = ([[projectionScore, 40], [adherenceScore, 35], [keyPct, 25]] as [number | null, number][]).filter((p): p is [number, number] => p[0] !== null)
  const weight = parts.reduce((a, p) => a + p[1], 0)
  let score = weight ? Math.round(parts.reduce((a, p) => a + p[0] * p[1], 0) / weight) : null
  if (score !== null && high) score = Math.max(0, score - 10)
  let light: Light = score === null ? 'none' : score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red'
  // A good average never hides a goal pace that is out of reach today, or overreaching.
  if (light === 'green' && ((projection && projection.gapPct > 0.03) || high)) light = 'amber'

  return {
    light, score, daysLeft, weeksLeft,
    adherence: { due: due.length, done: done.length, pct, plannedKm, doneKm, kmPct, score: adherenceScore },
    volume: { weeks, remainingKm, remainingSessions: pending.length, weeklyRemaining, recentWeekly, projectedWeekly },
    projection, projectionScore,
    key: { list, long, quality, pct: keyPct, score: keyPct },
    fatigue: { avg7, streak, high },
    alerts,
  }
}
