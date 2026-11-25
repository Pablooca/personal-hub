import { useEffect, useState } from 'react'
import { slugify, type Species, type SpeciesRow } from '../../lib/pokemon/sprites'
import type { LegalData } from '../../lib/pokemon/team'
import metaRaw from '../../data/pokemon/tcg-meta.json?raw'
import speciesRaw from '../../data/pokemon/species.json?raw'

export interface Archetype {
  id: string
  name: string
  icons: string[]
  share: number
}

export const META = JSON.parse(metaRaw) as { format: string; updated: string; archetypes: Archetype[]; aceSpecs: string[] }
export const ARCHETYPE = new Map(META.archetypes.map((a) => [a.id, a]))

export const SPECIES: Species[] = (JSON.parse(speciesRaw) as SpeciesRow[]).map(([name, slug, sprite]) => ({ name, slug, sprite: sprite ?? slug }))
export const BY_SLUG = new Map(SPECIES.map((s) => [s.slug, s]))
export const BY_NAME = new Map(SPECIES.map((s) => [s.name.toLowerCase(), s]))
export const KNOWN_SLUGS: ReadonlySet<string> = new Set(BY_SLUG.keys())

/** Sprite data for a species name ("Ogerpon-Wellspring") — tolerant with unknown formes. */
export function speciesOf(name: string): Species {
  return BY_NAME.get(name.trim().toLowerCase()) ?? { name, slug: slugify(name.trim()), sprite: slugify(name.trim()) }
}

export const slugName = (slug: string) => BY_SLUG.get(slug)?.name ?? slug.replace(/-/g, ' ')

// ------------------------------------------------------- Pokémon Champions
export interface ChampionsMon {
  types: string[]
  base: number[]
  abilities: string[]
  moves: string[]
}
export interface Champions extends LegalData {
  species: string[]
  itemList: string[]
  moveList: string[]
  get(species: string): ChampionsMon | null
  /** Mega forme unlocked by this item, if any. */
  mega(species: string, item: string): string | null
}

let cache: Promise<Champions> | null = null
/** 100 KB of VGC data, downloaded the first time it is needed. */
export function loadChampions(): Promise<Champions> {
  cache ??= import('../../data/pokemon/champions.json?raw')
    .then(({ default: raw }) => {
      const d = JSON.parse(raw) as {
        items: string[]
        stones: Record<string, Record<string, string>>
        moves: string[]
        mons: Record<string, { t: string[]; b: number[]; a: string[]; m: number[] | string }>
      }
      const lower = new Map(Object.keys(d.mons).map((n) => [n.toLowerCase(), n]))
      const memo = new Map<string, ChampionsMon | null>()
      const get = (species: string): ChampionsMon | null => {
        const key = lower.get(species.trim().toLowerCase())
        if (!key) return null
        if (!memo.has(key)) {
          const m = d.mons[key]
          const idx = typeof m.m === 'string' ? (d.mons[m.m]?.m ?? []) : m.m
          memo.set(key, { types: m.t, base: m.b, abilities: m.a, moves: Array.isArray(idx) ? idx.map((i) => d.moves[i]).sort() : [] })
        }
        return memo.get(key)!
      }
      return {
        species: Object.keys(d.mons).filter((n) => !/-Mega(-[XYZ])?$|[MF]-Mega$/.test(n)).sort(),
        itemList: d.items,
        items: new Set(d.items),
        moveList: [...d.moves].sort(),
        get,
        mon: (s: string) => {
          const m = get(s)
          return m && { abilities: m.abilities, moves: new Set(m.moves) }
        },
        mega: (species: string, item: string) => d.stones[item]?.[species] ?? null,
      }
    })
    .catch((e: unknown) => {
      cache = null // allow a retry after a network failure
      throw e
    })
  return cache
}

export function useChampions(): Champions | null {
  const [data, setData] = useState<Champions | null>(null)
  useEffect(() => {
    let live = true
    loadChampions().then((d) => live && setData(d), () => {})
    return () => {
      live = false
    }
  }, [])
  return data
}
