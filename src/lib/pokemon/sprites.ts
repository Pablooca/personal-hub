/** Sprite URLs (hot-linked, never stored in the repo) and species lookups. */
const LIMITLESS = 'https://r2.limitlesstcg.net/pokemon/gen9'
const SHOWDOWN = 'https://play.pokemonshowdown.com/sprites/gen5'

/** [name, limitless slug, showdown sprite id when different] */
export type SpeciesRow = [name: string, slug: string, sprite?: string]

export interface Species {
  name: string
  slug: string
  sprite: string
}

export const toId = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

export const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/♀/g, '-f')
    .replace(/♂/g, '-m')
    .replace(/[’'.:%]/g, '')
    .replace(/[\s_]+/g, '-')

/** Best first: Limitless → Showdown → base forme on Limitless. The component walks the list on error. */
export function spriteUrls(slug: string, sprite = slug): string[] {
  const safe = slug.replace(/[^a-z0-9-]/g, '')
  if (!safe) return []
  const base = safe.replace(/-(mega(-[xyz])?|[mf]-mega)$/, '')
  const urls = [`${LIMITLESS}/${safe}.png`, `${SHOWDOWN}/${sprite.replace(/[^a-z0-9-]/g, '')}.png`]
  if (base !== safe) urls.push(`${LIMITLESS}/${base}.png`)
  return urls
}

const REGIONS: Record<string, string> = { alolan: 'alola', galarian: 'galar', hisuian: 'hisui', paldean: 'paldea' }
const MASKS: [RegExp, string][] = [
  [/^wellspring mask /, '-wellspring'],
  [/^hearthflame mask /, '-hearthflame'],
  [/^cornerstone mask /, '-cornerstone'],
  [/^teal mask /, ''],
]

/**
 * Sprite slug for a TCG Pokémon card name:
 * "Mega Kangaskhan ex" → kangaskhan-mega · "Ethan's Ho-Oh ex" → ho-oh · "Team Rocket's Mewtwo ex" → mewtwo
 */
export function cardSlug(cardName: string, known?: ReadonlySet<string>): string {
  let n = cardName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, "'").toLowerCase().trim()
  n = n.replace(/\s+(ex|gx|v|vmax|vstar|v-union)$/, '')
  // Trainer's Pokémon — but not names that contain an apostrophe themselves (Farfetch'd, Sirfetch'd).
  n = n.replace(/^(?:[a-z.]+ )?[a-z.]+'s /, '')
  let suffix = ''
  for (const [re, s] of MASKS) if (re.test(n)) {
    n = n.replace(re, '')
    suffix = s
  }
  const mega = /^mega /.test(n)
  if (mega) n = n.slice(5)
  const region = n.match(/^(alolan|galarian|hisuian|paldean) /)
  if (region) {
    n = n.slice(region[0].length)
    suffix = `-${REGIONS[region[1]]}`
  }
  n = n.replace(/^(radiant|shining|bloodmoon) /, '')
  if (mega) {
    const xy = n.match(/ ([xyz])$/)
    if (xy) n = n.slice(0, -2)
    suffix = `-mega${xy ? `-${xy[1]}` : ''}`
  }
  const slug = slugify(n) + suffix
  if (!known || known.has(slug)) return slug
  return known.has(slugify(n)) ? slugify(n) : slug
}

/** English card scan from the Limitless CDN. */
export function cardImage(set: string, number: string): string | null {
  const s = set.toUpperCase().replace(/^PR-/, '')
  if (!/^[A-Z0-9]{2,6}$/.test(s) || !/^[A-Za-z0-9]{1,6}$/.test(number)) return null
  const n = /^\d+$/.test(number) ? number.padStart(3, '0') : number.toUpperCase()
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${s}/${s}_${n}_R_EN_SM.png`
}

export const cardUrl = (set: string, number: string) => `https://limitlesstcg.com/cards/${encodeURIComponent(set)}/${encodeURIComponent(number)}`
