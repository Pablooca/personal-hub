/** Structured sessions: blocks with reps, recovery and targets. Pure functions. */
import type { BlockKind, RunBlock, RunType, WorkoutBlock } from './types'

export const BLOCK_LABELS: Record<BlockKind, string> = {
  warmup: 'Calentamiento',
  strides: 'Cortas',
  progressive: 'Aceleración gradual',
  main: 'Series',
  hills: 'Colina',
  easy: 'Rodaje',
  cooldown: 'Enfriamiento',
}

export const newBlock = (kind: BlockKind): WorkoutBlock => {
  const base: WorkoutBlock = { kind, reps: 1, reps_max: null, unit: 's', amount: 300, recovery_s: null, target_kind: null, target_s: null }
  if (kind === 'strides') return { ...base, reps: 4, amount: 30, recovery_s: 30 }
  if (kind === 'progressive') return { ...base, reps: 4, amount: 30 }
  if (kind === 'main') return { ...base, reps: 6, unit: 'm', amount: 800, recovery_s: 180 }
  if (kind === 'hills') return { ...base, reps: 6, amount: 15, hill: { recovery_s: 60, down: 15 } }
  return base
}

// -------------------------------------------------------------------- format
const clock = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`
const dec = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',')

/** 30 → "30 s" · 300 → "5 min" · 90 → "1:30 min" */
export const fmtSeconds = (s: number) => (s < 60 || (s < 90 && s % 60) ? `${s} s` : s % 60 ? `${clock(s)} min` : `${s / 60} min`)
export const fmtMeters = (m: number) => (m >= 1000 && m % 100 === 0 ? `${dec(m / 1000)} km` : `${dec(m)} m`)
export const fmtAmount = (b: Pick<WorkoutBlock, 'unit' | 'amount'>) => (b.unit === 'm' ? fmtMeters(b.amount) : fmtSeconds(b.amount))
export const fmtReps = (b: Pick<WorkoutBlock, 'reps' | 'reps_max'>) => (b.reps_max && b.reps_max > b.reps ? `${b.reps}–${b.reps_max}` : String(b.reps))

const SUFFIX: Record<BlockKind, string> = { warmup: 'cal', strides: 'cortas', progressive: 'prog', main: '', hills: 'subida', easy: 'suave', cooldown: 'enf' }

export function formatBlock(b: WorkoutBlock): string {
  const reps = b.reps > 1 || (b.reps_max ?? 0) > 1 ? `${fmtReps(b)} × ` : ''
  if (b.kind === 'hills' && b.hill) {
    const mid = b.hill.recovery_s ? ` rec ${fmtSeconds(b.hill.recovery_s)},` : ''
    return `${reps}${fmtAmount(b)} subida,${mid} ${fmtAmount({ unit: b.unit, amount: b.hill.down })} bajada${b.recovery_s ? ` (rec ${fmtSeconds(b.recovery_s)})` : ''}`
  }
  const target = b.target_s && b.target_kind ? (b.target_kind === 'time' ? ` en ${clock(b.target_s)}` : ` a ${clock(b.target_s)}/km`) : ''
  const rec = b.recovery_s ? ` (rec ${fmtSeconds(b.recovery_s)})` : ''
  // "main" needs no word, except where a bare amount would be read as something else.
  const word = SUFFIX[b.kind] || (b.unit === 's' && b.amount <= 40 && !target ? 'series' : '')
  return `${reps}${fmtAmount(b)}${word ? ` ${word}` : ''}${target}${rec}`
}
/** "5 min cal + 4 × 30 s cortas (rec 30 s) + …" — parseWorkout reads it back. */
export const formatWorkout = (blocks: readonly WorkoutBlock[]) => blocks.map(formatBlock).join(' + ')

// --------------------------------------------------------------------- parse
/** "800", "800 m", "1 km", "30 s", "5 min", "5'", '30"', "1:30" */
export function parseAmount(text: string): { unit: 's' | 'm'; amount: number } | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.')
  const mmss = t.match(/^(\d{1,3}):(\d{2})(?:min|m|')?$/)
  if (mmss) return Number(mmss[2]) < 60 ? positive('s', Number(mmss[1]) * 60 + Number(mmss[2])) : null
  const m = t.match(/^(\d+(?:\.\d+)?)(km|mts?|metros|m|min(?:utos?)?|['’′](?!['’′])|seg(?:undos?)?|s|"|″|”|''|’’)?$/)
  if (!m) return null
  const n = Number(m[1])
  const u = m[2] ?? ''
  if (u === 'km') return positive('m', n * 1000)
  if (/^(m|mts?|metros)$/.test(u)) return positive('m', n)
  if (/^(min|minutos?)$/.test(u) || /^min/.test(u) || /^['’′]$/.test(u)) return positive('s', n * 60)
  if (u) return positive('s', n)
  // A bare number: metres when it looks like a track distance, otherwise ambiguous.
  return n >= 100 ? positive('m', n) : null
}
const positive = (unit: 's' | 'm', n: number) => {
  const amount = Math.round(n)
  return amount > 0 && amount <= (unit === 's' ? 5 * 3600 : 60_000) ? { unit, amount } : null
}
/** Recovery: "3'", "3 min", "30 s", "1:30"; a bare number is minutes up to 10 and seconds above. */
export function parseRecovery(text: string): number | null {
  const t = text.trim()
  if (/^\d+$/.test(t)) {
    const n = Number(t)
    return n > 0 ? (n <= 10 ? n * 60 : n) : null
  }
  const a = parseAmount(t)
  return a && a.unit === 's' && a.amount <= 3600 ? a.amount : null
}
/** "4:30" or "45 s" → seconds */
export function parseTarget(text: string): number | null {
  const t = text.trim().replace(/\/km$/i, '')
  const a = parseAmount(/^\d+$/.test(t) ? `${t} s` : t)
  return a && a.unit === 's' ? a.amount : null
}

const HILL_WORDS = /\b(subid\w*|subiend\w*|ascend\w*|bajad\w*|bajand\w*|descend\w*|colinas?|cuestas?)\b/
/** "6 x 15 s subida, rec 1 min, 15 s bajada (rec 2 min)": up, recovery, down and rest, in that order. */
function parseHills(t: string): WorkoutBlock | null {
  const reps = t.match(/^\s*(\d{1,2})(?:\s*[-–a]\s*(\d{1,2}))?\s*(?:[x×]|rep\w*|veces)/)
  const rest = reps ? t.slice(reps[0].length) : t
  const found = [...rest.matchAll(/\d+:\d{2}(?:\s*min)?|\d+(?:[.,]\d+)?\s*(?:minutos?|min|segundos?|seg|metros|mts?|m|s|''|"|″|'|′)/g)].map((m) => parseAmount(m[0]))
  if (!found.length || found.some((x) => !x)) return null
  const all = found as { unit: 's' | 'm'; amount: number }[]
  const up = all[0]
  // Up and down share the unit; recoveries are always times.
  const [mid, down, between] = all.length >= 3 ? [all[1], all[2], all[3]] : [undefined, all[1] ?? up, undefined]
  const n = reps ? Number(reps[1]) : 1
  const max = reps?.[2] ? Number(reps[2]) : null
  if (down.unit !== up.unit || (mid && mid.unit !== 's') || (between && between.unit !== 's') || n < 1 || (max !== null && max < n)) return null
  return { ...newBlock('hills'), reps: n, reps_max: max !== null && max > n ? max : null, ...up, recovery_s: between?.amount ?? null, hill: { recovery_s: mid?.amount ?? null, down: down.amount } }
}

const KIND_WORDS: [RegExp, BlockKind][] = [
  [/\b(cal|calent\w*|warm\s?-?up)\b/, 'warmup'],
  [/\b(enf|enfri\w*|vuelta a la calma|cool\s?-?down)\b/, 'cooldown'],
  [/\b(prog|progres\w*|acel|aceler\w*)\b(\s+gradual(es)?)?/, 'progressive'],
  [/\b(cortas?|strides?|rectas?|sprints?)\b/, 'strides'],
  [/\b(suave|rodaje|trote|easy)\b/, 'easy'],
  [/\b(series?|intervalos?)\b/, 'main'],
]

/** Reads shorthand such as `5' cal + 4x30"/30" + 4x30" prog + 5-6x800 en 4:30 r3' + 5' enf`. */
export function parseWorkout(text: string): { blocks: WorkoutBlock[]; errors: string[] } {
  const blocks: WorkoutBlock[] = []
  const errors: string[] = []
  const parts = text.split(/\s*[+·\n]\s*/).map((x) => x.trim()).filter(Boolean)
  parts.forEach((part, i) => {
    let t = part.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[()]/g, ' ')
    if (HILL_WORDS.test(t)) {
      const hills = parseHills(t)
      if (hills) blocks.push(hills)
      else errors.push(`no se entiende el bloque «${part.slice(0, 40)}».`)
      return
    }
    let kind: BlockKind | null = null
    for (const [re, k] of KIND_WORDS)
      if (re.test(t)) {
        kind = k
        t = t.replace(re, ' ')
        break
      }
    let recovery_s: number | null = null
    const DUR = String.raw`\d+:\d{2}(?:\s*min)?|\d+(?:[.,]\d+)?\s*(?:min|seg|s|''|"|″|'|′)?`
    const rec = t.match(new RegExp(String.raw`(?:\br(?:ec)?(?:up\w*)?\.?\s*|con\s+|/\s*)(${DUR})(?:\s*(?:de\s+)?rec\w*)?(?!\s*/?km)`))
    if (rec && !/km/.test(rec[0])) {
      recovery_s = parseRecovery(rec[1].replace(/\s+/g, ''))
      t = t.replace(rec[0], ' ')
    }
    let target_kind: WorkoutBlock['target_kind'] = null
    let target_s: number | null = null
    const tgt = t.match(/(?:(@|\ba\b|\ben\b)\s*)(\d{1,2}:\d{2})\s*(\/\s*km)?/)
    if (tgt) {
      target_s = parseTarget(tgt[2])
      target_kind = target_s ? (tgt[1] === 'en' && !tgt[3] ? 'time' : 'pace') : null
      t = t.replace(tgt[0], ' ')
    }
    const m = t.trim().match(/^(?:(\d{1,2})(?:\s*[-–a]\s*(\d{1,2}))?\s*[x×]\s*)?(\d+(?::\d{2})?(?:[.,]\d+)?\s*(?:km|mts?|metros|min\w*|seg\w*|m|s|''|"|″|'|′)?)\s*(?:de|por|al?)?$/)
    const amount = m && parseAmount(m[3])
    const reps = m?.[1] ? Number(m[1]) : 1
    const max = m?.[2] ? Number(m[2]) : null
    if (!amount || reps < 1 || (max !== null && max < reps)) {
      errors.push(`no se entiende el bloque «${part.slice(0, 40)}».`)
      return
    }
    // No word: edges without reps are warm-up / cool-down, very short reps without target are strides.
    const plain = reps === 1 && !target_s && amount.unit === 's'
    kind ??= plain && i === 0 && parts.length > 1 ? 'warmup' : plain && i === parts.length - 1 && parts.length > 1 ? 'cooldown' : reps > 1 && amount.unit === 's' && amount.amount <= 40 && !target_s ? 'strides' : 'main'
    blocks.push({ kind, reps, reps_max: max !== null && max > reps ? max : null, ...amount, recovery_s, target_kind, target_s })
  })
  return { blocks, errors }
}

// ---------------------------------------------------------------------- maths
/** Target as seconds per km, when it can be known. */
export function blockPace(b: WorkoutBlock): number | null {
  if (!b.target_s || !b.target_kind) return null
  if (b.target_kind === 'pace') return b.target_s
  return b.unit === 'm' ? (b.target_s / b.amount) * 1000 : null
}
/** Target as seconds per rep. */
export function blockTime(b: WorkoutBlock): number | null {
  if (!b.target_s || !b.target_kind) return null
  if (b.target_kind === 'time') return b.target_s
  return b.unit === 'm' ? (b.target_s * b.amount) / 1000 : null
}

/** Pace of one recorded rep (s/km). */
export const splitPace = (b: WorkoutBlock, split: number) => (b.unit === 'm' ? (split / b.amount) * 1000 : split)

const mains = <T extends WorkoutBlock>(blocks: readonly T[]) => blocks.filter((b) => b.kind === 'main')
/** What the session is about: its reps, or the steady running when there are none. */
export const core = <T extends WorkoutBlock>(blocks: readonly T[]): T[] => {
  const reps = mains(blocks)
  return reps.length ? reps : blocks.filter((b) => b.kind === 'easy')
}

/** Blocks whose repetitions decide whether a session was completed. */
const counted = <T extends WorkoutBlock>(blocks: readonly T[]) => blocks.filter((b) => b.kind === 'main' || b.kind === 'hills')
/** The part worth showing in a list: reps and hills, or the steady running. */
export const highlight = <T extends WorkoutBlock>(blocks: readonly T[]): T[] => {
  const list = counted(blocks)
  return list.length ? list : core(blocks)
}

// ------------------------------------------------------------------ sections
export type Section = 'warmup' | 'main' | 'cooldown'
export const SECTIONS: Section[] = ['warmup', 'main', 'cooldown']
export const SECTION_LABELS: Record<Section, string> = { warmup: 'Calentamiento', main: 'Bloque principal', cooldown: 'Enfriamiento' }
export const MAIN_KINDS: BlockKind[] = ['strides', 'progressive', 'main', 'hills', 'easy']
export const sectionOf = (b: Pick<WorkoutBlock, 'kind'>): Section => (b.kind === 'warmup' || b.kind === 'cooldown' ? b.kind : 'main')
export const inSection = <T extends WorkoutBlock>(blocks: readonly T[], s: Section) => blocks.filter((b) => sectionOf(b) === s)
/** Every session needs the three parts. */
export const missingSections = (blocks: readonly WorkoutBlock[]) => SECTIONS.filter((s) => !blocks.some((b) => sectionOf(b) === s))

/** Adds a 5-minute warm-up / cool-down when they are missing, and puts the parts in order. */
export function ensureSections(blocks: readonly WorkoutBlock[]): WorkoutBlock[] {
  return SECTIONS.flatMap((s) => {
    const own = inSection(blocks, s)
    return own.length || s === 'main' ? own : [newBlock(s)]
  })
}

/** Default structure of a session: 5 min + main part + 5 min, adding up to about `km`. */
export function defaultBlocks(type: RunType, km: number, pace: number | null, easy: number): WorkoutBlock[] {
  const edges = 600 / easy // km covered by warm-up and cool-down
  const metres = Math.max(500, Math.round(((km - edges) * 1000) / 100) * 100)
  const kind: BlockKind = type === 'easy' || type === 'long' ? 'easy' : 'main'
  const main: WorkoutBlock = { kind, reps: 1, reps_max: null, unit: 'm', amount: metres, recovery_s: null, target_kind: pace ? 'pace' : null, target_s: pace }
  return [newBlock('warmup'), main, newBlock('cooldown')]
}

/** Planned pace of the main reps (weighted by distance when there are several blocks). */
export function targetPace(blocks: readonly WorkoutBlock[]): number | null {
  let sum = 0
  let weight = 0
  for (const b of core(blocks)) {
    const p = blockPace(b)
    if (p === null) continue
    const w = b.reps * b.amount
    sum += p * w
    weight += w
  }
  const pace = weight ? Math.round(sum / weight) : null
  return pace !== null && pace >= 100 && pace <= 1200 ? pace : null
}

/** Average pace of the main reps actually timed. */
export function workPace(blocks: readonly RunBlock[]): number | null {
  let sum = 0
  let weight = 0
  for (const b of core(blocks))
    for (const s of b.splits) {
      if (!s) continue
      sum += splitPace(b, s) * b.amount
      weight += b.amount
    }
  const pace = weight ? Math.round(sum / weight) : null
  return pace !== null && pace >= 100 && pace <= 1200 ? pace : null
}

/** Reps of a block that were run: timed ones, or the planned minimum when it is just ticked. */
export const repsDone = (b: RunBlock) => (b.done ? (b.kind === 'hills' ? (b.reps_done ?? b.reps) : b.splits.filter((s) => s).length || b.reps) : 0)

/** Main and hill reps done against the plan; null when either side has no structure. */
export function completion(plan: readonly WorkoutBlock[], run: readonly RunBlock[]): { done: number; min: number; max: number } | null {
  const planned = counted(plan)
  const ran = counted(run)
  // A single continuous block is judged by its distance, not by "1 of 1".
  if (!run.length || planned.reduce((a, b) => a + (b.reps_max ?? b.reps), 0) < 2) return null
  return {
    done: ran.reduce((a, b) => a + repsDone(b), 0),
    min: planned.reduce((a, b) => a + b.reps, 0),
    max: planned.reduce((a, b) => a + (b.reps_max ?? b.reps), 0),
  }
}

/** Last third against first third of the timed main reps: +0.05 = ended 5 % slower. Needs 4 reps. */
export function repDrift(blocks: readonly RunBlock[]): number | null {
  const paces = mains(blocks).flatMap((b) => b.splits.filter((s): s is number => Boolean(s)).map((s) => splitPace(b, s)))
  if (paces.length < 4) return null
  const n = Math.max(1, Math.floor(paces.length / 3))
  const avg = (l: number[]) => l.reduce((a, b) => a + b, 0) / l.length
  return avg(paces.slice(-n)) / avg(paces.slice(0, n)) - 1
}

/** Start recording a planned structure. */
export const toRunBlocks = (blocks: readonly WorkoutBlock[]): RunBlock[] => {
  const timed = new Set<WorkoutBlock>(core(blocks))
  return blocks.map((b) => ({ ...b, done: true, splits: timed.has(b) ? Array.from({ length: b.reps_max ?? b.reps }, () => null) : [] }))
}

/** A saved run drops its trailing empty reps: bring the fields back for editing. */
export const padRunBlocks = (blocks: readonly RunBlock[]): RunBlock[] => {
  const fields = toRunBlocks(blocks)
  return blocks.map((b, i) => ({ ...b, splits: fields[i].splits.length > b.splits.length ? fields[i].splits.map((_, j) => b.splits[j] ?? null) : b.splits }))
}

export interface Estimate {
  seconds: number
  km: number
}

/**
 * Rough totals. Recovery counts between reps (not after the last one) at walking pace.
 * `easy` = easy pace in s/km. Recorded splits are used when there are any.
 */
export function estimate(blocks: readonly (WorkoutBlock | RunBlock)[], easy: number): Estimate {
  const WALK = 600
  let seconds = 0
  let km = 0
  for (const b of blocks) {
    const run = 'done' in b ? b : null
    if (run && !run.done) continue
    const timed = run ? run.splits.filter((s): s is number => Boolean(s)) : []
    const reps = run?.kind === 'hills' ? repsDone(run) : timed.length || b.reps
    if (b.kind === 'hills' && b.hill) {
      const [up, down] = [easy * 0.85, easy * 0.75]
      const legS = (x: number, pace: number) => (b.unit === 'm' ? (x / 1000) * pace : x)
      const legKm = (x: number, pace: number) => (b.unit === 'm' ? x / 1000 : x / pace)
      const rest = (b.hill.recovery_s ?? 0) * reps + (b.recovery_s ?? 0) * Math.max(0, reps - 1)
      seconds += (legS(b.amount, up) + legS(b.hill.down, down)) * reps + rest
      km += (legKm(b.amount, up) + legKm(b.hill.down, down)) * reps + rest / WALK
      continue
    }
    const fallback = b.kind === 'strides' || b.kind === 'progressive' ? easy * 0.8 : b.kind === 'main' ? easy * 0.87 : easy
    const pace = timed.length ? timed.reduce((a, s) => a + splitPace(b, s), 0) / timed.length : (blockPace(b) ?? fallback)
    const workS = b.unit === 'm' ? (pace * b.amount) / 1000 : b.amount
    const restS = (b.recovery_s ?? 0) * Math.max(0, reps - 1)
    seconds += workS * reps + restS
    km += (b.unit === 'm' ? b.amount / 1000 : b.amount / pace) * reps + restS / WALK
  }
  return { seconds: Math.round(seconds), km: Math.round(km * 10) / 10 }
}

/** Typical easy pace: median of recent easy runs, or derived from the goal pace. */
export function easyPace(runs: readonly { type: string; duration_s: number; distance_km: number; date: string }[], goalPaceS: number | null): number {
  const list = runs.filter((r) => r.type === 'easy').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((r) => r.duration_s / r.distance_km).sort((a, b) => a - b)
  if (list.length) return list[Math.floor(list.length / 2)]
  return goalPaceS ? goalPaceS * 1.18 : 390
}
