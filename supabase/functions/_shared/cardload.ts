/** Reads the collection and looks up prints on TCGdex for the bot. */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import sets from '../../../src/data/pokemon/tcg-sets.json' with { type: 'json' }
import { printKey, signatureOf, type Print } from '../../../src/lib/pokemon/collection.ts'
import type { OwnedCard, TcgDeck } from '../../../src/lib/types.ts'
import { foundText, inLists, matches, notFoundText, relevantDecks, searchOwned, words } from './cards.ts'

const API = 'https://api.tcgdex.net/v2'
/** undefined = the service failed, null = it does not exist. */
// deno-lint-ignore no-explicit-any
async function get(path: string): Promise<any> {
  for (let i = 0; i < 2; i++)
    try {
      const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(5000) })
      if (r.status === 404) return null
      if (r.ok) return await r.json()
    } catch {
      /* try again */
    }
  return undefined
}
const idsOf = (code: string) => (sets as unknown as [string, string][]).filter(([, c]) => c && c.toUpperCase() === code.toUpperCase().replace(/^PR-/, '')).map(([id]) => id)

async function print(set: string, number: string): Promise<Print | null | undefined> {
  const n = number.replace(/^0+(?=\d)/, '')
  for (const id of idsOf(set))
    for (const num of new Set([n, n.padStart(3, '0')])) {
      const c = await get(`/en/sets/${encodeURIComponent(id)}/${encodeURIComponent(num)}`)
      if (c === undefined) return undefined
      if (c) return { id: c.id, set, number: n, name: c.name, category: 'pokemon', signature: signatureOf(c), image: null, rarity: '', cm: null, low: null, trend: null, lowHolo: null, trendHolo: null }
    }
  return null
}

const price = (x: unknown) => (x === null || x === undefined ? null : Number(x))
async function loadCollection(db: SupabaseClient, owner: string): Promise<{ cards: OwnedCard[]; decks: TcgDeck[] }> {
  const cards: OwnedCard[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('owned_cards').select('*').eq('user_id', owner).order('id').range(from, from + 999)
    if (error) throw error
    cards.push(...(data as OwnedCard[]).map((c) => ({ ...c, own_price: price(c.own_price), ref_low: price(c.ref_low), ref_trend: price(c.ref_trend) })))
    if (data.length < 1000) break
  }
  const { data, error } = await db.from('tcg_decks').select('*').eq('user_id', owner)
  if (error) throw error
  return { cards, decks: data as TcgDeck[] }
}

/** `localOnly`: just the collection, and null when nothing matches. */
export async function cardAnswer(db: SupabaseClient, owner: string, query: string, today: string, localOnly = false): Promise<string | null> {
  const { cards, decks } = await loadCollection(db, owner)
  let hits = searchOwned(cards, query)
  let known: boolean | null = null
  if (!hits.length) {
    if (localOnly) return null
    // Another language: "Juez" also finds an English Judge.
    const q = words(query)
    const lists = await Promise.all(['es', 'en'].map((l) => get(`/${l}/cards?name=${encodeURIComponent(query)}&pagination:itemsPerPage=250`)))
    if (lists.every((x) => x !== undefined)) {
      const found = lists.flatMap((x) => (Array.isArray(x) ? (x as { id: string; name: string }[]) : [])).filter((c) => matches(q, c.name))
      known = found.length > 0
      const ids = new Set(found.map((c) => c.id))
      hits = cards.filter((c) => ids.has(c.tcgdex_id))
    }
    if (!hits.length) return notFoundText(query, inLists(decks, query), known)
  }
  const signatures = new Set(hits.map((c) => c.signature))
  const related = cards.filter((c) => signatures.has(c.signature))
  const rel = relevantDecks(decks.filter((d) => d.is_built !== false), related)
  const prints = new Map<string, Print>()
  let failed = false
  await Promise.all(
    rel.prints.slice(0, 12).map(async (p) => {
      const x = await print(p.set, p.number)
      if (x) prints.set(printKey(p.set, p.number), x)
      else if (x === undefined) failed = true
    }),
  )
  return foundText(hits, related, rel.decks, prints, today) + (failed ? '\n\n⚠️ No he podido comprobar las reimpresiones: en los mazos solo cuento la edición exacta.' : '')
}
