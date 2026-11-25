/**
 * Regenerates src/data/pokemon/*.json from public sources:
 *   - Pokémon Showdown (species, items, moves, Pokémon Champions legality and learnsets)
 *   - Limitless TCG (metagame archetypes with their icons, ACE SPEC list)
 *
 *   node scripts/build-pokemon-data.mjs [SET=DLR] [FORMAT=TEF-DLR]
 *
 * Run it when a new TCG set or a new VGC regulation comes out, then commit the JSON.
 */
import { writeFileSync } from 'node:fs'

const SET = process.argv[2] ?? 'DLR'
const FORMAT = process.argv[3] ?? 'TEF-DLR'
const OUT = new URL('../src/data/pokemon/', import.meta.url)
const SD = 'https://play.pokemonshowdown.com/data'
const MOD = 'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions'

const get = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.text()
}
const toId = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const decode = (s) => s.replace(/&#0?39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&eacute;/g, 'é').replace(/&quot;/g, '"')

/** Top-level `\tkey: { ... }` blocks of a Showdown mod file. Parsed as text, never executed. */
function blocks(src) {
  const out = new Map()
  for (const m of src.matchAll(/^\t(?:"?)([a-z0-9]+)(?:"?): \{([\s\S]*?)^\t\},/gm)) out.set(m[1], m[2])
  return out
}

/** Entries of a minified `exports.X={id:{name:"…",…},…}` file. Parsed as text, never executed. */
function minified(src) {
  const out = new Map()
  const start = src.indexOf('{') + 1
  let depth = 0
  let key = ''
  let buf = ''
  let quote = ''
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      buf += c
      if (c === '\\') buf += src[++i]
      else if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'") quote = c
    if (c === '{') {
      if (depth === 0) {
        key = buf.replace(/[,:\s"]/g, '')
        buf = ''
      }
      depth++
    }
    if (c === '}') {
      depth--
      if (depth === 0) {
        out.set(key, buf)
        buf = ''
        continue
      }
      if (depth < 0) break
    }
    buf += c
  }
  return out
}

const [dexRaw, movesRaw, itemsRaw, fmtRaw, modItemsRaw, modMovesRaw, learnRaw] = await Promise.all([
  get(`${SD}/pokedex.json`),
  get(`${SD}/moves.json`),
  get(`${SD}/items.js`),
  get(`${MOD}/formats-data.ts`),
  get(`${MOD}/items.ts`),
  get(`${MOD}/moves.ts`),
  get(`${MOD}/learnsets.ts`),
])
const dex = JSON.parse(dexRaw)
const moves = JSON.parse(movesRaw)

// ------------------------------------------------------------------ species
const limitlessSlug = (name) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/♀/g, '-f').replace(/♂/g, '-m').replace(/[’'.:%]/g, '').replace(/[\s_]+/g, '-')
const SKIP = /-(Gmax|Totem|Starter|Tera|Stellar|Busted|Meteor|Cosplay|Rock-Star|Belle|Pop-Star|PhD|Libre)|^Pikachu-|^(Arceus|Silvally|Genesect)-/
const species = []
for (const [, s] of Object.entries(dex)) {
  if (!s.num || s.num <= 0 || SKIP.test(s.name)) continue
  const sprite = s.forme ? `${toId(s.baseSpecies)}-${toId(s.forme)}` : toId(s.name)
  species.push({ name: s.name, slug: limitlessSlug(s.name), sprite, num: s.num })
}
species.sort((a, b) => a.num - b.num || a.name.localeCompare(b.name))
// [name, slug, showdown sprite (omitted when identical to the slug)]
writeFileSync(new URL('species.json', OUT), JSON.stringify(species.map((s) => (s.sprite === s.slug ? [s.name, s.slug] : [s.name, s.slug, s.sprite]))))

// ---------------------------------------------------------------- champions
const fmt = blocks(fmtRaw)
const learn = blocks(learnRaw)
const modItems = blocks(modItemsRaw)
const legalIds = [...fmt].filter(([, b]) => !/isNonstandard: "/.test(b) && !/tier: "Illegal"/.test(b.replace(/natDexTier.*/g, ''))).map(([id]) => id)

const items = []
const stones = {}
for (const [id, body] of minified(itemsRaw)) {
  const name = body.match(/name:"((?:[^"\\]|\\.)*)"/)?.[1]
  if (!name) continue
  const mod = modItems.get(id)
  const std = mod && /isNonstandard/.test(mod) ? mod.match(/isNonstandard: (null|"[^"]*")/)?.[1] : body.match(/isNonstandard:("[^"]*")/)?.[1] ?? 'null'
  if (std !== 'null') continue
  items.push(name)
  const stone = body.match(/megaStone:\{([^}]*)\}/)?.[1]
  if (stone) stones[name] = Object.fromEntries([...stone.matchAll(/"?([\w .:'’%-]+?)"?:"([^"]+)"/g)].map((m) => [m[1], m[2]]))
}
items.sort()

const moveNames = []
const moveIdx = new Map()
const idxOf = (id) => {
  if (!moveIdx.has(id)) {
    moveIdx.set(id, moveNames.length)
    moveNames.push(moves[id]?.name ?? id)
  }
  return moveIdx.get(id)
}
const learnOf = (id) => {
  const body = learn.get(id) ?? learn.get(toId(dex[id]?.baseSpecies ?? ''))
  const set = body?.match(/learnset: \{([\s\S]*?)\n\t\t\}/)?.[1] ?? ''
  return [...set.matchAll(/^\t\t\t"?([a-z0-9]+)"?: \[/gm)].map((m) => m[1])
}
const mons = {}
for (const id of legalIds) {
  const s = dex[id]
  if (!s || SKIP.test(s.name)) continue
  const b = s.baseStats
  mons[s.name] = {
    t: s.types,
    b: [b.hp, b.atk, b.def, b.spa, b.spd, b.spe],
    a: Object.values(s.abilities),
    // Megas share the base forme's learnset: stored once.
    m: /^Mega/.test(s.forme ?? '') ? s.baseSpecies : learnOf(id).map(idxOf),
  }
}
writeFileSync(new URL('champions.json', OUT), JSON.stringify({ items, stones, moves: moveNames, mons }))

// ----------------------------------------------------------------- TCG meta
const row = (html) =>
  [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => ({
    icons: [...m[1].matchAll(/<img[^>]*src="[^"]*\/([a-z0-9-]+)\.png"/g)].map((x) => x[1]),
    cells: m[1].replace(/<[^>]+>/g, '\n').split('\n').map((x) => decode(x.trim())).filter(Boolean),
  }))
const ladder = row(await get(`https://play.limitlesstcg.com/decks?game=PTCG&format=standard&rotation=2026&set=${SET}`))
const archetypes = ladder
  .filter((r) => /^\d+$/.test(r.cells[0] ?? '') && r.icons.length && r.cells[1] !== 'Other')
  .map((r) => ({ id: limitlessSlug(r.cells[1]), name: r.cells[1], icons: r.icons.slice(0, 2), share: Number.parseFloat(r.cells[3]) }))
// Archetypes from in-person events that the online ladder names differently (e.g. "Hydrapple ex").
const iconKey = (a) => [...a.icons].sort().join('+')
const seen = new Set(archetypes.map(iconKey))
for (const r of row(await get('https://limitlesstcg.com/decks'))) {
  if (!/^\d+$/.test(r.cells[0] ?? '') || !r.icons.length) continue
  const name = r.cells[2] === 'ex' ? `${r.cells[1]} ex` : r.cells[1]
  const a = { id: limitlessSlug(name), name, icons: r.icons.slice(0, 2), share: 0 }
  if (seen.has(iconKey(a))) continue
  seen.add(iconKey(a))
  archetypes.push(a)
}
if (archetypes.length < 20) throw new Error('Limitless metagame page changed: too few archetypes')
const ace = [...(await get('https://limitlesstcg.com/cards?q=is:ace_spec&display=text&show=all')).matchAll(/class="card-text-name"[^>]*>\s*(?:<a[^>]*>)?([^<]+)/g)].map((m) => decode(m[1].trim()))
writeFileSync(
  new URL('tcg-meta.json', OUT),
  JSON.stringify({ format: FORMAT, source: 'play.limitlesstcg.com', updated: new Date().toISOString().slice(0, 10), archetypes, aceSpecs: [...new Set(ace)].sort() }),
)
// ----------------------------------------------------------------- TCG sets
// PTCG Live code ↔ TCGdex id, to find any print by "MEG 104".
const TCGDEX = 'https://api.tcgdex.net/v2'
const tryJson = async (url) => {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url).catch(() => null)
    if (r?.ok) return r.json()
    await new Promise((ok) => setTimeout(ok, 400 * (i + 1)))
  }
  throw new Error(url)
}
const enSets = await tryJson(`${TCGDEX}/en/sets`)
const esNames = new Map((await tryJson(`${TCGDEX}/es/sets`)).map((s) => [s.id, s.name]))
const sets = []
let next = 0
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < enSets.length) {
      const d = await tryJson(`${TCGDEX}/en/sets/${enSets[next++].id}`)
      if (d.serie?.id === 'tcgp') continue // Pokémon TCG Pocket: not physical cards
      const code = d.abbreviation?.official ?? d.tcgOnline ?? ''
      sets.push([d.id, code, d.name, esNames.get(d.id) ?? d.name, d.releaseDate, d.cardCount?.official ?? 0])
    }
  }),
)
sets.sort((a, b) => b[4].localeCompare(a[4]))
writeFileSync(new URL('tcg-sets.json', OUT), JSON.stringify(sets))
console.log({ sets: sets.length, species: species.length, legal: Object.keys(mons).length, items: items.length, moves: moveNames.length, stones: Object.keys(stones).length, archetypes: archetypes.length, aceSpecs: new Set(ace).size, format: FORMAT })
