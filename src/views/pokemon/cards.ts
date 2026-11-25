import { useCallback, useEffect, useMemo, useState } from 'react'
import { printKey, signatureOf, type Print } from '../../lib/pokemon/collection'
import type { DeckCard } from '../../lib/pokemon/deck'
import setsRaw from '../../data/pokemon/tcg-sets.json?raw'

/** Card data from TCGdex (free, open); prices inside it are Cardmarket's daily guide. */
const API = 'https://api.tcgdex.net/v2'

export interface TcgSet {
  id: string
  code: string
  en: string
  es: string
  date: string
  official: number
}
export const SETS: TcgSet[] = (JSON.parse(setsRaw) as [string, string, string, string, string, number][]).map(([id, code, en, es, date, official]) => ({ id, code, en, es, date, official }))
const BY_CODE = new Map<string, TcgSet[]>()
for (const s of SETS) if (s.code) BY_CODE.set(s.code.toUpperCase(), [...(BY_CODE.get(s.code.toUpperCase()) ?? []), s])
export const SET_BY_ID = new Map(SETS.map((s) => [s.id, s]))
export const setsByCode = (code: string) => BY_CODE.get(code.toUpperCase().replace(/^PR-/, '')) ?? []

export interface ApiPrice {
  idProduct?: number | null
  low?: number | null
  trend?: number | null
  'low-holo'?: number | null
  'trend-holo'?: number | null
}
export interface ApiCard {
  id: string
  localId: string
  name: string
  category: string
  image?: string
  rarity?: string
  illustrator?: string
  hp?: number
  types?: string[]
  stage?: string
  evolveFrom?: string
  regulationMark?: string
  retreat?: number
  effect?: string
  trainerType?: string
  energyType?: string
  set: { id: string; name: string }
  variants?: { normal?: boolean; reverse?: boolean; holo?: boolean; firstEdition?: boolean; wPromo?: boolean }
  attacks?: { name?: string; damage?: string | number; cost?: string[]; effect?: string }[]
  abilities?: { name?: string; type?: string; effect?: string }[]
  weaknesses?: { type: string; value?: string }[]
  resistances?: { type: string; value?: string }[]
  legal?: { standard?: boolean; expanded?: boolean }
  pricing?: { cardmarket?: ApiPrice | null }
  variants_detailed?: { type?: string; foil?: string; pricing?: { cardmarket?: ApiPrice | null } }[]
}
export interface ApiHit {
  id: string
  localId: string
  name: string
  image?: string
}

async function get<T>(path: string): Promise<T | null> {
  // The free service drops a request now and then: try up to three times.
  let last: unknown
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise((ok) => setTimeout(ok, 500 * i))
    try {
      const r = await fetch(`${API}${path}`, { referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) })
      if (r.status === 404) return null
      if (r.ok) return (await r.json()) as T
      last = new Error(`TCGdex ${r.status}`)
    } catch (e) {
      last = e
    }
  }
  throw last
}

export const image = (url: string | null | undefined, quality: 'low' | 'high' = 'low') => (url && /^https:\/\/assets\.tcgdex\.net\//.test(url) ? `${url}/${quality}.webp` : null)

const memo = new Map<string, Promise<ApiCard | null>>()
export function fetchCard(lang: string, id: string): Promise<ApiCard | null> {
  const key = `${lang}|${id}`
  let p = memo.get(key)
  if (!p) {
    p = get<ApiCard>(`/${lang}/cards/${encodeURIComponent(id)}`)
    p.catch(() => memo.delete(key))
    memo.set(key, p)
  }
  return p
}

/** "MEG 104" → card. Tries every set that shares the code. */
export async function fetchByNumber(lang: string, code: string, number: string): Promise<ApiCard | null> {
  for (const s of setsByCode(code)) {
    const plain = number.replace(/^0+(?=\d)/, '')
    for (const n of [...new Set([plain, plain.padStart(3, '0')])]) {
      const c = await get<ApiCard>(`/${lang}/sets/${encodeURIComponent(s.id)}/${encodeURIComponent(n)}`)
      if (c) return c
    }
  }
  return null
}

/** Search by name in a language; "MEG 104" goes straight to the print. */
export async function searchCards(lang: string, query: string): Promise<ApiHit[]> {
  const q = query.trim()
  const direct = q.match(/^([A-Za-z0-9]{2,6})\s*[- ]\s*([A-Za-z]{0,3}\d{1,3}[a-z]?)(?:\/\d+)?$/)
  if (direct && setsByCode(direct[1]).length) {
    const c = await fetchByNumber(lang, direct[1], direct[2])
    return c ? [c] : []
  }
  const list = (await get<ApiHit[]>(`/${lang}/cards?name=${encodeURIComponent(q)}&pagination:itemsPerPage=120`)) ?? []
  // Newest sets first; Pokémon TCG Pocket cards are not physical.
  const rank = new Map(SETS.map((s, i) => [s.id, i]))
  const setOf = (id: string) => id.slice(0, id.lastIndexOf('-'))
  const western = ['es', 'en', 'fr', 'de', 'it', 'pt'].includes(lang)
  return (western ? list.filter((c) => rank.has(setOf(c.id))) : list).sort((a, b) => (rank.get(setOf(a.id)) ?? 999) - (rank.get(setOf(b.id)) ?? 999))
}

export const categoryOf = (c: Pick<ApiCard, 'category'>): Print['category'] => {
  const k = c.category.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return k.startsWith('pok') ? 'pokemon' : k.startsWith('ener') ? 'energy' : 'trainer'
}
const num = (x: number | null | undefined) => (typeof x === 'number' && x > 0 ? x : null)

export function priceOf(c: ApiCard): { cm: number | null; low: number | null; trend: number | null; lowHolo: number | null; trendHolo: number | null } {
  const p = c.pricing?.cardmarket ?? c.variants_detailed?.find((v) => v.pricing?.cardmarket)?.pricing?.cardmarket ?? null
  return { cm: p?.idProduct ?? null, low: num(p?.low), trend: num(p?.trend), lowHolo: num(p?.['low-holo']), trendHolo: num(p?.['trend-holo']) }
}

/** The English card, reduced to what deck building and prices need. */
export function toPrint(c: ApiCard): Print {
  const set = SET_BY_ID.get(c.set.id)
  return { id: c.id, set: set?.code ?? c.set.id, number: c.localId.replace(/^0+(?=\d)/, ''), name: c.name, category: categoryOf(c), signature: signatureOf(c), image: c.image ?? null, rarity: c.rarity ?? '', ...priceOf(c) }
}

// ------------------------------------------------------------- prints cache
const CACHE_KEY = 'ph-prints-v1'
const MAX = 1500
type Stored = Record<string, { p: Print; d: string }>
let store: Stored | null = null
const load = (): Stored => {
  if (store) return store
  try {
    store = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Stored
  } catch {
    store = {}
  }
  return store
}
function save() {
  try {
    const all = Object.entries(load())
    if (all.length > MAX) store = Object.fromEntries(all.sort((a, b) => b[1].d.localeCompare(a[1].d)).slice(0, MAX))
    localStorage.setItem(CACHE_KEY, JSON.stringify(store))
  } catch {
    /* storage full: only lives in memory */
  }
}

/** Prints of these list lines, fetched when needed (prices refreshed daily). */
export function usePrints(lines: readonly Pick<DeckCard, 'set' | 'number'>[], enabled = true): { prints: Map<string, Print>; loading: boolean; failed: boolean } {
  const keys = useMemo(() => [...new Set(lines.filter((l) => l.set).map((l) => printKey(l.set, l.number)))].sort().join(','), [lines])
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const run = useCallback(async (signal: { stop: boolean }) => {
    const today = new Date().toISOString().slice(0, 10)
    const todo = keys.split(',').filter((k) => k && load()[k]?.d !== today)
    if (!todo.length) return
    setLoading(true)
    let bad = false
    let i = 0
    await Promise.all(
      Array.from({ length: 5 }, async () => {
        while (i < todo.length && !signal.stop) {
          const key = todo[i++]
          const at = key.indexOf('-')
          try {
            const c = await fetchByNumber('en', key.slice(0, at), key.slice(at + 1))
            if (c) load()[key] = { p: { ...toPrint(c), set: key.slice(0, at) }, d: today }
          } catch {
            bad = true
          }
        }
      }),
    )
    save()
    if (signal.stop) return
    setFailed(bad)
    setLoading(false)
    setVersion((v) => v + 1)
  }, [keys])

  useEffect(() => {
    if (!enabled) return
    const signal = { stop: false }
    void run(signal)
    return () => {
      signal.stop = true
    }
  }, [run, enabled])

  const prints = useMemo(() => {
    const m = new Map<string, Print>()
    for (const [k, v] of Object.entries(load())) m.set(k, v.p)
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, keys])
  return { prints, loading, failed }
}
