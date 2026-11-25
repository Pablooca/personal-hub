/** Cardmarket's official daily price guide → reference prices of my cards. Pure functions. */

export const GUIDE_URL = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json'
/** Finishes priced with the guide's reverse-holo columns (same list as FINISHES in the app; tested). */
export const REVERSE_FINISHES: string[] = ['reverse', 'pokeball', 'masterball', 'energy']

export interface GuideRow {
  idProduct: number
  low?: number | null
  trend?: number | null
  'low-holo'?: number | null
  'trend-holo'?: number | null
}
export interface Guide {
  createdAt: string
  priceGuides: GuideRow[]
}
export interface PriceRow {
  product: number
  finish: string
  low: number | null
  trend: number | null
}

/** A truncated, empty or old file must never overwrite good prices. */
export function checkGuide(g: unknown, nowMs: number): Guide {
  const x = g as Partial<Guide> | null
  if (!x || !Array.isArray(x.priceGuides) || x.priceGuides.length < 10_000) throw new Error('price guide: unexpected content')
  const age = nowMs - Date.parse(String(x.createdAt).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  if (!(age < 4 * 86_400_000)) throw new Error('price guide: too old')
  return x as Guide
}

const num = (n: number | null | undefined) => (typeof n === 'number' && n > 0 ? n : null)

/** One row per product and finish that I own; products missing from the guide are left as they are. */
export function pickPrices(guide: Guide, cards: readonly { cm_product: number | null; finish: string }[]): PriceRow[] {
  const wanted = new Map<string, { product: number; finish: string }>()
  for (const c of cards) if (c.cm_product) wanted.set(`${c.cm_product}|${c.finish}`, { product: c.cm_product, finish: c.finish })
  const ids = new Set([...wanted.values()].map((w) => w.product))
  const found = new Map(guide.priceGuides.filter((r) => ids.has(r.idProduct)).map((r) => [r.idProduct, r]))
  return [...wanted.values()].flatMap((w) => {
    const r = found.get(w.product)
    if (!r) return []
    const rev = REVERSE_FINISHES.includes(w.finish)
    return [{ ...w, low: (rev ? num(r['low-holo']) : null) ?? num(r.low), trend: (rev ? num(r['trend-holo']) : null) ?? num(r.trend) }]
  })
}

/** Every 10 minutes from the chosen time, for three hours, until it works. */
export const isPriceTime = (at: number | null, minutes: number) => at !== null && minutes >= at && minutes < at + 180 && (minutes - at) % 10 === 0
