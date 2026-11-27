import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseDeck, formatDeck, isBasicEnergy } from './deck.ts'
import { cardImage, cardSlug, spriteUrls, type SpeciesRow } from './sprites.ts'
import { EXAMPLE_DECK, EXAMPLE_TEAM } from './examples.ts'
import { finalStats, formatTeam, parseTeam, pokepasteId } from './team.ts'
import { bracketOf, bracketRange, cpFor, cpForPlacement, cutRoundLabel, placementLabel, recordFor, structureFor } from './structure.ts'
import { cutChance, mulberry32, myChance, myFinalPoints, playRound, scenarios, simulateSwiss, type SimConfig } from './simulate.ts'
import { decided, diceTally, matchesOf, matchupMatrix, ownMons, resultFromGames, rivalKey, rivalMons, swissRecord, turnTally, winRate } from './stats.ts'
import type { Tournament, TournamentRound } from '../types.ts'

const json = (f: string) => JSON.parse(readFileSync(new URL(`../../data/pokemon/${f}`, import.meta.url), 'utf8'))
const species = json('species.json') as SpeciesRow[]
const champions = json('champions.json')
const meta = json('tcg-meta.json')
const known = new Set(species.map((s) => s[1]))

// ----------------------------------------------------------------- decks
test('the example deck is a valid 60-card list (14 / 31 / 15)', () => {
  const d = parseDeck(EXAMPLE_DECK.list_text, meta.aceSpecs)
  assert.deepEqual(d.errors, [])
  assert.deepEqual(d.warnings, [])
  assert.deepEqual(d.counts, { pokemon: 14, trainer: 31, energy: 15 })
  assert.equal(d.total, 60)
  assert.ok(d.valid)
  // Two different prints of the same card stay separate, but count together.
  assert.equal(d.cards.filter((c) => c.name === 'Legendary Pyroduct').length, 2)
})

test('deck round trip through formatDeck', () => {
  const d = parseDeck(EXAMPLE_DECK.list_text)
  assert.deepEqual(parseDeck(formatDeck(d)).cards, d.cards)
})

test('PTCG Live export: bullets, foil suffix, Spanish headings and total line', () => {
  const d = parseDeck('Pokémon: 2\n* 4 Dragapult ex TWM 130 PH\n\nEntrenador: 1\n2 Ultra Ball MEG 131\n\nEnergía: 1\n54 Basic {R} Energy SVE 2\n\nCartas totales: 60')
  assert.equal(d.total, 60)
  assert.deepEqual(d.cards.map((c) => c.section), ['pokemon', 'trainer', 'energy'])
  assert.equal(d.cards[0].number, '130')
})

test('lists without headings use blank lines and basic energy names', () => {
  const d = parseDeck('4 Dreepy TWM 128\n\n4 Ultra Ball MEG 131\n\n10 Fire Energy MEE 10')
  assert.deepEqual(d.cards.map((c) => c.section), ['pokemon', 'trainer', 'energy'])
})

test('deck validation: total, 4 copies, ACE SPEC, junk lines', () => {
  const bad = parseDeck(EXAMPLE_DECK.list_text.replace('4 Ultra Ball', '5 Ultra Ball').replace('1 Aarune DLR 89', '1 Master Ball TEF 153'), meta.aceSpecs)
  assert.ok(bad.errors.some((e) => e.includes('61 cartas')))
  assert.ok(bad.errors.some((e) => e.includes('Ultra Ball')))
  assert.ok(bad.errors.some((e) => e.includes('ACE SPEC')))
  assert.ok(parseDeck('hola').errors.some((e) => e.includes('Línea 1')))
  assert.ok(!parseDeck('').valid)
  assert.ok(isBasicEnergy('Lightning Energy') && !isBasicEnergy('Legacy Energy'))
})

// ---------------------------------------------------------------- sprites
test('TCG card names map to real sprites', () => {
  const cases: Record<string, string> = {
    'Mega Kangaskhan ex': 'kangaskhan-mega', "Ethan's Ho-Oh ex": 'ho-oh', 'Latias ex': 'latias', "N's Zoroark ex": 'zoroark', "Team Rocket's Mewtwo ex": 'mewtwo',
    'Mega Charizard X ex': 'charizard-mega-x', 'Alolan Exeggutor ex': 'exeggutor-alola', 'Wellspring Mask Ogerpon ex': 'ogerpon-wellspring', 'Teal Mask Ogerpon ex': 'ogerpon', "Farfetch'd": 'farfetchd', 'Iron Thorns ex': 'iron-thorns',
  }
  for (const [card, slug] of Object.entries(cases)) {
    assert.equal(cardSlug(card, known), slug)
    assert.ok(known.has(slug), slug)
  }
  for (const c of parseDeck(EXAMPLE_DECK.list_text).cards.filter((x) => x.section === 'pokemon')) assert.ok(known.has(cardSlug(c.name, known)), c.name)
})

test('sprite and card URLs are sanitised', () => {
  assert.ok(spriteUrls('../evil"').every((u) => !u.includes('"') && !u.includes('..')))
  assert.equal(cardImage('DLR', '88'), 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/DLR/DLR_088_R_EN_SM.png')
  assert.equal(cardImage('../x', '1'), null)
})

test('metagame: unique ids, every archetype has 1–2 icons, examples from the brief are there', () => {
  assert.equal(meta.format, 'TEF-DLR')
  assert.equal(new Set(meta.archetypes.map((a: { id: string }) => a.id)).size, meta.archetypes.length)
  for (const a of meta.archetypes) assert.ok(a.icons.length >= 1 && a.icons.length <= 2, a.name)
  const icons = (name: string) => meta.archetypes.find((a: { name: string }) => a.name === name)?.icons
  assert.deepEqual(icons('Dragapult'), ['dragapult'])
  assert.deepEqual(icons('Basic Box'), ['kangaskhan-mega', 'clefairy'])
  assert.deepEqual(icons('Mega Rayquaza'), ['rayquaza-mega'])
  assert.deepEqual(icons('Lopunny Dudunsparce'), ['lopunny-mega', 'dudunsparce'])
  assert.deepEqual(icons('Hydrapple ex'), ['hydrapple'])
})

// ------------------------------------------------------------------ teams
const legal = {
  items: new Set<string>(champions.items),
  mon(name: string) {
    const m = champions.mons[name]
    if (!m) return null
    const idx = typeof m.m === 'string' ? champions.mons[m.m].m : m.m
    return { abilities: m.a as string[], moves: new Set<string>(idx.map((i: number) => champions.moves[i])) }
  },
}

test('the example team is valid: 6 Pokémon, 66 Stat Points each, every move and item legal', () => {
  const t = parseTeam(EXAMPLE_TEAM.paste, legal)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.warnings, [])
  assert.deepEqual(t.mons.map((m) => m.species), ['Glimmora', 'Garchomp', 'Delphox', 'Whimsicott', 'Farigiraf', 'Heracross'])
  assert.equal(t.system, 'sp')
  assert.equal(t.mons[1].nature, 'Adamant')
})

test('team round trip and nickname / gender / Tera parsing', () => {
  const t = parseTeam(EXAMPLE_TEAM.paste)
  assert.deepEqual(parseTeam(formatTeam(t.mons)).mons, t.mons)
  const [m] = parseTeam('Chispa (Incineroar) (M) @ Safety Goggles\nAbility: Intimidate\nLevel: 50\nTera Type: Grass\nEVs: 252 HP / 4 Atk / 252 SpD\nCareful Nature\nIVs: 0 Spe\n- Fake Out\n- Knock Off\n- Parting Shot\n- Flare Blitz').mons
  assert.deepEqual([m.nickname, m.species, m.gender, m.item, m.teraType, m.evs.hp, m.ivs.spe], ['Chispa', 'Incineroar', 'M', 'Safety Goggles', 'Grass', 252, 0])
})

test('team validation: species clause, item clause, spread limits', () => {
  const t = parseTeam(`${EXAMPLE_TEAM.paste.replace('Whimsicott @ Focus Sash', 'Garchomp @ Life Orb').replace('27 HP / 20 Def', '32 HP / 20 Def')}`)
  assert.ok(t.errors.some((e) => e.includes('Especie repetida')))
  assert.ok(t.errors.some((e) => e.includes('Objeto repetido: Life Orb')))
  assert.ok(parseTeam('').errors.length)
})

test('level 50 stats: Champions (base + SP + 20) and classic EVs agree on known values', () => {
  const t = parseTeam(EXAMPLE_TEAM.paste)
  const chomp = finalStats(champions.mons.Garchomp.b, t.mons[1], 'sp')
  // Garchomp 108/130/95/80/85/102, Adamant, 2 HP / 32 Atk / 32 Spe
  assert.deepEqual(chomp, { hp: 185, atk: 200, def: 115, spa: 90, spd: 105, spe: 154 })
  // Classic 252+ Atk Garchomp at level 50 = 200; 252 Spe neutral = 154.
  const classic = finalStats(champions.mons.Garchomp.b, { nature: 'Adamant', level: 50, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } }, 'ev')
  assert.equal(classic.atk, 200)
  assert.equal(classic.spe, 154)
})

test('pokepaste links', () => {
  assert.equal(pokepasteId('https://pokepast.es/5c46f9ec443664cb'), '5c46f9ec443664cb')
  assert.equal(pokepasteId('https://evil.com/5c46f9ec443664cb'), null)
})

// -------------------------------------------------------------- structures
test('official structures (handbook variants 1, 2, 3 and 5)', () => {
  const s = (g: 'tcg' | 'vgc', k: Parameters<typeof structureFor>[1], n: number) => {
    const r = structureFor(g, k, n)!
    return [r.swiss, r.topCut]
  }
  assert.deepEqual(s('vgc', 'league_cup', 7), [3, 0])
  assert.deepEqual(s('vgc', 'league_cup', 8), [3, 2])
  assert.deepEqual(s('vgc', 'league_challenge', 33), [6, 8])
  assert.deepEqual(s('vgc', 'league_cup', 227), [8, 16])
  assert.deepEqual(s('vgc', 'league_cup', 513), [10, 32])
  assert.deepEqual(s('tcg', 'league_challenge', 40), [6, 0])
  assert.deepEqual(s('tcg', 'league_cup', 8), [3, 0])
  assert.deepEqual(s('tcg', 'league_cup', 12), [4, 4])
  assert.deepEqual(s('tcg', 'league_cup', 13), [5, 4])
  assert.deepEqual(s('tcg', 'league_cup', 21), [5, 8])
  assert.deepEqual(s('tcg', 'league_cup', 410), [10, 8])
  const big = structureFor('tcg', 'major', 1500)!
  assert.deepEqual([big.swiss, big.phase, big.topCut, big.topCutType], [13, { rounds: 8, threshold: 16 }, 8, 'asymmetric'])
  assert.equal(structureFor('tcg', 'major', 64)!.phase, null)
  assert.equal(structureFor('tcg', 'league_cup', 3), null)
})

test('Championship Points with kickers', () => {
  assert.equal(cpFor('league_cup', 1, 5), 50)
  assert.equal(cpFor('league_cup', 5, 17), 25)
  assert.equal(cpFor('league_cup', 5, 16), 0)
  assert.equal(cpFor('league_challenge', 4, 8), 10)
  assert.equal(cpFor('regional', 100, 900), 80)
  assert.equal(cpFor('international', 1, 2000), 500)
  assert.equal(cpFor('online', 1, 200), null)
  assert.equal(cpFor('regional', null, 900), null)
})

test('final placement: brackets, exact position and CP', () => {
  assert.deepEqual([1, 2, 3, 6, 16, 17, 100, 256, 700, 2000].map(bracketOf), [1, 2, 4, 8, 16, 32, 128, 256, 1024, null])
  assert.deepEqual([bracketRange(1), bracketRange(4), bracketRange(128), bracketRange(256)], [[1, 1], [3, 4], [65, 128], [129, 256]])
  assert.equal(placementLabel({ placement: null, placement_bracket: 1 }), 'Campeón')
  assert.equal(placementLabel({ placement: 6, placement_bracket: 8 }), 'Top 8 · 6.º')
  assert.equal(placementLabel({ placement: 38 }), 'Top 64 · 38.º')
  assert.equal(placementLabel({ placement: 2000, placement_bracket: null }), '2000.º')
  assert.equal(placementLabel({ placement: null, placement_bracket: null }), null)
  assert.deepEqual(cpForPlacement('league_cup', 8, null, 40), { min: 25, max: 25 })
  assert.deepEqual(cpForPlacement('regional', 128, null, 1500), { min: 80, max: 80 })
  assert.deepEqual(cpForPlacement('regional', 256, null, 1500), { min: 60, max: 60 })
  // 257th–512th = 45 CP, 513th–1024th = 22 CP
  assert.deepEqual(cpForPlacement('regional', 1024, null, 2500), { min: 22, max: 45 })
  assert.deepEqual(cpForPlacement('regional', 128, 100, 1500), { min: 80, max: 80 })
})

test('labels and records', () => {
  assert.deepEqual([1, 2, 3].map((n) => cutRoundLabel(8, n)), ['Cuartos', 'Semifinal', 'Final'])
  assert.equal(cutRoundLabel(32, 1), 'Top 32')
  assert.deepEqual(recordFor(16, 8), { w: 5, l: 2, t: 1 })
  assert.equal(recordFor(26, 8), null)
})

// --------------------------------------------------------------- simulator
const base: SimConfig = { players: 64, rounds: 6, tieRate: 0, drops: [], dropRate: 0, phase: null, topCut: 8, topCutType: 'standard', cap: 16, sims: 300, seed: 7 }

test('a round conserves players, and exactly one player is undefeated in 64 / 6', () => {
  const rnd = mulberry32(1)
  let c: Float64Array = new Float64Array([65])
  for (let i = 0; i < 6; i++) c = playRound(c, 0.1, rnd)
  assert.equal(c.reduce((a, b) => a + b, 0), 65)
  const sim = simulateSwiss(base)
  assert.equal(sim.lines[0].points, 18)
  assert.equal(sim.lines[0].players, 1)
})

test('64 players, 6 rounds, top 8: 5-1 always gets in, 4-2 is the bubble (1 seat for 15), 3-3 never', () => {
  const sim = simulateSwiss(base)
  const q = (p: number) => sim.byPoints.get(p)!
  assert.equal(q(18), 1)
  assert.equal(q(15), 1) // 1 + 6 = 7 players with 5-1 or better
  assert.ok(Math.abs(q(12) - 1 / 15) < 1e-9)
  assert.equal(q(9), 0)
  assert.equal(sim.safe, 15)
  assert.equal(sim.bubble, 12)
  assert.ok(Math.abs(sim.seats - 8) < 1e-9)
})

test('drops remove people from the bottom, and never change the number of seats', () => {
  const sim = simulateSwiss({ ...base, drops: [0, 6, 8] })
  assert.ok(Math.abs(sim.active - 50) < 1e-9)
  assert.ok(Math.abs(sim.seats - 8) < 1e-9)
})

test('asymmetrical cut lets in everyone tied with the Nth player, up to the cap', () => {
  assert.equal(cutChance(7, 5, 8, 'asymmetric', 16), 1)
  assert.equal(cutChance(7, 20, 8, 'asymmetric', 16), 9 / 20)
  assert.equal(cutChance(8, 5, 8, 'asymmetric', 16), 0)
  assert.equal(cutChance(7, 4, 8, 'standard', 16), 1 / 4)
})

test('two-phase events: nobody below the threshold survives', () => {
  const sim = simulateSwiss({ ...base, players: 1500, rounds: 13, phase: { rounds: 8, threshold: 16 }, topCutType: 'asymmetric', sims: 40 })
  assert.ok(sim.lines.at(-1)!.points >= 16)
  assert.ok(sim.seats >= 8 && sim.seats <= 16)
})

test('my chance: certain, impossible and in between; phase threshold respected', () => {
  const sim = simulateSwiss(base)
  assert.equal(myChance(myFinalPoints({ wins: 5, losses: 1, ties: 0 }, 6, 0.5, 0, null), sim), 1)
  assert.equal(myChance(myFinalPoints({ wins: 1, losses: 3, ties: 0 }, 6, 0.5, 0, null), sim), 0)
  const mid = myChance(myFinalPoints({ wins: 4, losses: 1, ties: 0 }, 6, 0.5, 0, null), sim)
  assert.ok(Math.abs(mid - (0.5 + 0.5 / 15)) < 1e-9)
  assert.equal(myFinalPoints({ wins: 4, losses: 4, ties: 0 }, 13, 0.9, 0, { rounds: 8, threshold: 16 }).size, 0)
  assert.deepEqual(scenarios({ wins: 4, losses: 1, ties: 0 }, 6, sim).map((x) => [x.wins, x.points]), [[1, 15], [0, 12]])
})

// ------------------------------------------------------------------- stats
const T = (o: Partial<Tournament>): Tournament => ({
  id: 't', game: 'tcg', name: 'x', date: '2026-11-25', mode: 'in_person', location: '', category: 'league_cup', format: 'TEF-DLR', players: 32, swiss_rounds: 5, swiss_format: 'bo1',
  has_top_cut: true, top_cut_type: 'standard', top_cut_size: 8, top_cut_format: 'bo3', made_top_cut: false, deck_id: 'd', team_id: null, status: 'finished', placement_bracket: null, placement: null, cp: null, notes: '', created_at: '', ...o,
})
const R = (o: Partial<TournamentRound>): TournamentRound => ({
  id: Math.random().toString(), tournament_id: 't', phase: 'swiss', number: 1, result: 'win', games: [], won_dice: null, went_first: null, opponent_name: '', opponent_archetype: '', opponent_icons: [],
  opponent_deck_name: '', opponent_pokemon: [], opponent_record: null, my_pokemon: [], notes: '', created_at: '', ...o,
})

test('match results from games', () => {
  const g = (r: 'win' | 'loss' | 'tie') => ({ result: r, first: null })
  assert.equal(resultFromGames([g('win'), g('loss'), g('win')]), 'win')
  assert.equal(resultFromGames([g('win'), g('loss')]), 'tie')
  assert.equal(resultFromGames([]), null)
  assert.ok(decided([g('win'), g('win')], 'bo3') && !decided([g('win')], 'bo3') && decided([g('loss')], 'bo1'))
})

test('byes give points but are not matches; the top cut uses its own format', () => {
  const rounds = [R({}), R({ number: 2, result: 'bye' }), R({ number: 3, result: 'tie' }), R({ phase: 'top_cut', result: 'loss' })]
  assert.deepEqual(swissRecord(rounds), { w: 2, l: 0, t: 1, points: 7, rounds: 3 })
  const ms = matchesOf([T({})], rounds)
  assert.equal(ms.length, 3)
  assert.deepEqual(ms.map((m) => m.format), ['bo1', 'bo1', 'bo3'])
})

test('a no-show is a Swiss win but not a match', () => {
  const rounds = [R({}), R({ number: 2, result: 'no_show' }), R({ number: 3, result: 'loss' })]
  assert.deepEqual(swissRecord(rounds), { w: 2, l: 1, t: 0, points: 6, rounds: 3 })
  assert.equal(matchesOf([T({})], rounds).length, 2)
})

test('turn and dice tallies', () => {
  const ms = matchesOf([T({})], [
    R({ won_dice: true, games: [{ result: 'win', first: true }, { result: 'loss', first: false }, { result: 'win', first: true }] }),
    R({ won_dice: false, result: 'loss', games: [{ result: 'loss', first: false }] }),
  ])
  const turn = turnTally(ms)
  assert.equal(winRate(turn.first), 100)
  assert.equal(winRate(turn.second), 0)
  assert.equal(diceTally(ms).rate, 50)
})

test('custom decks from "Otro" get their own column, whatever the icon order', () => {
  const a = R({ opponent_archetype: 'other', opponent_icons: ['pikachu', 'joltik'], opponent_deck_name: 'Rayos' })
  const b = R({ opponent_archetype: 'other', opponent_icons: ['joltik', 'pikachu'], opponent_deck_name: 'rayos ', result: 'loss' })
  assert.equal(rivalKey(a), rivalKey(b))
  const m = matchupMatrix(matchesOf([T({})], [a, b, R({ opponent_archetype: 'dragapult', opponent_icons: ['dragapult'], opponent_deck_name: 'Dragapult' }), R({})]))
  assert.equal(m.cols.length, 2)
  assert.deepEqual(m.rows[0].cells.get(rivalKey(a)), { w: 1, l: 1, t: 0 })
})

test('VGC aggregation per Pokémon', () => {
  const mon = (species: string, item: string) => ({ species, item, nature: 'Jolly', moves: ['Protect'] })
  const ms = matchesOf([T({ game: 'vgc' })], [
    R({ opponent_pokemon: [mon('Incineroar', 'Sitrus Berry'), mon('Garchomp', '')], my_pokemon: ['Delphox', 'Glimmora'] }),
    R({ result: 'loss', opponent_pokemon: [mon('Incineroar', 'Sitrus Berry')], my_pokemon: ['Delphox'] }),
  ])
  const inc = rivalMons(ms)[0]
  assert.deepEqual([inc.species, inc.record, inc.items[0], inc.moves[0]], ['Incineroar', { w: 1, l: 1, t: 0 }, ['Sitrus Berry', 2], ['Protect', 2]])
  const own = ownMons(ms)
  assert.deepEqual([own[0].species, own[0].usage, own[1].usage], ['Delphox', 100, 50])
  assert.deepEqual(own[0].versus.get('Incineroar'), { w: 1, l: 1, t: 0 })
})

test('VGC picks recorded game by game', () => {
  const mon = (species: string) => ({ species, item: '', nature: '', moves: [] })
  const ms = matchesOf([T({ game: 'vgc' })], [
    R({
      opponent_pokemon: ['Incineroar', 'Garchomp', 'Raichu', 'Sinistcha', 'Tinkaton', 'Basculegion'].map(mon),
      my_pokemon: ['Delphox', 'Glimmora', 'Garchomp'],
      games: [
        { result: 'win', first: null, mine: ['Delphox', 'Glimmora'], rival: ['Incineroar', 'Raichu'], rival_mega: 'Raichu' },
        { result: 'loss', first: null, mine: ['Delphox', 'Garchomp'], rival: ['Incineroar', 'Sinistcha'] },
        { result: 'win', first: null, mine: ['Glimmora'], rival: ['Raichu'] },
      ],
    }),
  ])
  const own = new Map(ownMons(ms).map((m) => [m.species, m]))
  assert.deepEqual(own.get('Delphox')!.record, { w: 1, l: 1, t: 0 })
  assert.deepEqual(own.get('Glimmora')!.versus.get('Raichu'), { w: 2, l: 0, t: 0 })
  assert.equal(own.get('Glimmora')!.versus.get('Tinkaton'), undefined)
  assert.equal(Math.round(own.get('Garchomp')!.usage), 33)
})
