import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { closestTeam, groupSets, parseReplay, replayIds, summarise, toId } from './replay.ts'
import { ratingPoints, replayStats } from './replayStats.ts'
import { matchesOf, tally } from './stats.ts'
import type { PokemonMatch } from '../types.ts'

const file = (n: number) => readFileSync(new URL(`./fixtures/bo3-game${n}.txt`, import.meta.url), 'utf8')
const names = new Map(['Good as Gold', 'Sludge Bomb', 'Life Orb', 'Raichunite Y', 'Toxic Debris'].map((n) => [toId(n), n]))
const F = 'gen9championsvgc2026regmcbo3'
const g1 = parseReplay(`${F}-1001`, file(1), names)
const g2 = parseReplay(`${F}-1007`, file(2), names)

test('links: several, private ones, the battle room and what is not a replay', () => {
  assert.deepEqual(replayIds(`https://replay.pokemonshowdown.com/${F}-1001 y replay.pokemonshowdown.com/${F}-1007?p2 https://replay.pokemonshowdown.com/${F}-1001.json`), [`${F}-1001`, `${F}-1007`])
  assert.deepEqual(replayIds(`https://replay.pokemonshowdown.com/${F}-9-abc123pw`), [`${F}-9-abc123pw`])
  assert.deepEqual(replayIds(`https://play.pokemonshowdown.com/battle-${F}-9`), [`${F}-9`])
  assert.deepEqual(replayIds('https://example.com/gen9-1 hola replay.pokemonshowdown.com/'), [])
})

test('a game: players, set, winner, rating and length', () => {
  assert.deepEqual([g1.number, g1.next, g1.bo3, g1.winner, g1.end, g1.turns], [1, `${F}-1007`, true, 0, 'ko', 8])
  assert.equal(g1.set, g2.set)
  assert.deepEqual([g1.score, g2.score], [[0, 0], [1, 0]])
  assert.deepEqual(g2.sides.map((s) => [s.name, s.rating, s.rating_after]), [['Yo Mismo', 1045, 1090], ['Rival Uno', 1171, 1137]])
  assert.equal(g1.seconds, 177)
})

test('a game: team sheets, picks and leads', () => {
  const [me, rival] = g1.sides
  assert.deepEqual(me.team.map((m) => m.species), ['Glimmora', 'Garchomp', 'Delphox', 'Whimsicott', 'Farigiraf', 'Heracross'])
  assert.deepEqual(me.team[0], { species: 'Glimmora', item: 'Life Orb', ability: 'Toxic Debris', nature: 'Modest', tera: '', moves: ['Sludge Bomb', 'Power Gem', 'Earth Power', 'Spiky Shield'] })
  assert.deepEqual([rival.team[5].ability, rival.team[3].item, rival.team[1].species], ['Good as Gold', 'Raichunite Y', 'Indeedee-F'])
  assert.deepEqual([me.brought, me.leads, me.left], [['Whimsicott', 'Delphox', 'Garchomp', 'Glimmora'], 2, 1])
  assert.deepEqual([rival.brought, rival.left], [['Incineroar', 'Raichu', 'Indeedee-F', 'Sneasler'], 0])
})

test('a game: knock-outs, damage and megas', () => {
  const line = (s: 0 | 1, species: string, g = g1) => g.sides[s].mons.find((m) => m.species === species)!
  assert.equal(line(0, 'Garchomp').kos, 4)
  assert.deepEqual([line(0, 'Delphox').mega, line(0, 'Delphox').fainted, line(1, 'Raichu').mega], ['Delphoxite', 2, 'Raichunite Y'])
  assert.deepEqual([line(0, 'Garchomp').hp, line(0, 'Garchomp').moves[0]], [5, ['Rock Slide', 6]])
  // Burned by Delphox and finished by the burn.
  assert.equal(line(0, 'Delphox', g2).kos, 1)
  assert.equal(g2.sides.reduce((a, s) => a + s.mons.reduce((b, m) => b + m.kos, 0), 0), 7)
  assert.deepEqual([g2.sides[1].crits, g2.sides[0].lost_turns, g2.sides[0].misses], [2, 2, 1])
})

test('turn by turn in a line per action', () => {
  const t1 = g1.log.find((t) => t.n === 1)!.e
  assert.ok(t1.includes('1Delphox: Heat Wave → Incineroar 79 % (poco eficaz), Raichu 40 %'), t1.join('\n'))
  assert.ok(t1.includes('2Raichu megaevoluciona (Raichunite Y)'))
  assert.ok(g1.log.find((t) => t.n === 2)!.e.includes('0Empieza Psychic Terrain'))
  // Consequences after the move that caused them.
  const t7 = g1.log.find((t) => t.n === 7)!.e
  assert.ok(t7.indexOf('2Sneasler baja hasta 16 % (Rough Skin)') > t7.findIndex((x) => x.startsWith('2Sneasler: Dire Claw')))
  assert.ok(g1.log.at(-1)!.e.at(-1)!.startsWith('2Cae Sneasler (Garchomp)'))
})

test('the set: result from both games, in any order', () => {
  const [set, ...rest] = groupSets([g2, g1])
  assert.equal(rest.length, 0)
  const s = summarise(set, 'yo mismo')!
  assert.deepEqual(s.results.map((r) => r.result), ['win', 'win'])
  assert.deepEqual([s.decided, s.missing, s.opponent, s.games[0].number], [true, [], 'Rival Uno', 1])
  const other = summarise(set, 'Rival Uno')!
  assert.deepEqual([other.results.map((r) => r.result), other.opponent], [['loss', 'loss'], 'Yo Mismo'])
  assert.ok(other.games[0].log!.find((t) => t.n === 1)!.e.some((x) => x.startsWith('2Delphox: Heat Wave')))
  assert.equal(summarise(set, 'alguien'), null)
})

test('a set with games missing', () => {
  const one = summarise(groupSets([g1])[0], 'Yo Mismo')!
  assert.deepEqual([one.decided, one.missing, one.results.length], [false, [2], 1])
  // Only the second: the scoreboard says who won the first.
  const two = summarise(groupSets([g2])[0], 'Yo Mismo')!
  assert.deepEqual([two.decided, two.missing, two.results.map((r) => r.result)], [true, [1], ['win', 'win']])
})

test('what is not a finished battle is refused', () => {
  assert.throws(() => parseReplay('x', '<html>'), /No es una repetición/)
  assert.throws(() => parseReplay('x', file(1).replace(/\|win\|.*/, '')), /no llegó a terminar/)
})

test('closed sheets: only what was shown', () => {
  const closed = parseReplay('x', file(1).replace(/\|showteam.*\n/g, ''))
  const mon = (s: string) => closed.sides[1].team.find((m) => m.species === s)!
  assert.deepEqual([mon('Raichu').item, mon('Raichu').moves], ['Raichunite Y', ['Zap Cannon', 'Protect']])
  assert.deepEqual([mon('Incineroar').ability, mon('Incineroar').item], ['Intimidate', 'Sitrus Berry'])
  assert.equal(mon('Indeedee-F').ability, 'Psychic Surge')
  assert.equal(closed.sides[0].team.find((m) => m.species === 'Garchomp')!.ability, 'Rough Skin')
})

test('a forfeit and a nickname', () => {
  const r = parseReplay('x', file(1).replaceAll('p1b: Garchomp', 'p1b: Tiburón').replace('|win|Yo Mismo', '|-message|Rival Uno forfeited.\n|win|Yo Mismo'))
  assert.equal(r.end, 'forfeit')
  assert.equal(r.sides[0].mons.find((m) => m.species === 'Garchomp')!.kos, 4)
})

test('my team is recognised by its sheet', () => {
  const sheet = g1.sides[0].team
  const same = { id: 'a', mons: sheet.map((m) => ({ ...m })) }
  const old = { id: 'b', mons: sheet.map((m) => ({ ...m, item: '', moves: [] })) }
  assert.equal(closestTeam(sheet, [old, same])?.id, 'a')
  assert.equal(closestTeam(sheet, [{ id: 'c', mons: sheet.slice(0, 4) }]), null)
})

// ------------------------------------------------------------------- stats
const loose = (o: Partial<PokemonMatch> = {}): PokemonMatch => {
  const s = summarise(groupSets([g1, g2])[0], 'Yo Mismo')!
  return {
    id: 'm', game: 'vgc', date: '2026-11-25', format: 'bo3', result: 'win', games: s.results, won_dice: null, went_first: null, deck_id: null, team_id: 'x', venue: '', opponent_name: s.opponent, opponent_archetype: '',
    opponent_icons: [], opponent_deck_name: '', opponent_pokemon: [], my_pokemon: ['Delphox'], teams: { mine: s.mine, rival: s.rival }, replays: s.games, notes: '', created_at: '', ...o,
  }
}

test('loose matches join the tournament ones', () => {
  const ms = matchesOf([], [], [loose(), loose({ id: 'n', game: 'tcg', format: 'bo1', result: 'loss', replays: [], teams: null })])
  assert.deepEqual(ms.map((m) => [m.source, m.t.game, m.format, m.r.phase]), [['match', 'vgc', 'bo3', null], ['match', 'tcg', 'bo1', null]])
  assert.deepEqual(tally(ms), { w: 1, l: 1, t: 0 })
})

test('statistics from replays', () => {
  const s = replayStats([loose()])
  assert.deepEqual([s.games, s.turns], [{ w: 2, l: 0, t: 0 }, 8.5])
  assert.deepEqual(s.myLeads, [{ species: ['Delphox', 'Whimsicott'], tally: { w: 2, l: 0, t: 0 } }])
  assert.deepEqual(s.rivalLeads[0].species, ['Incineroar', 'Raichu'])
  assert.deepEqual(s.picks[0].species, ['Delphox', 'Garchomp', 'Glimmora', 'Whimsicott'])
  const chomp = s.mine.find((m) => m.species === 'Garchomp')!
  assert.deepEqual([chomp.kos, chomp.faints, chomp.leads], [5, 1, 0])
  const ghold = s.rival.find((m) => m.species === 'Gholdengo')!
  assert.deepEqual([ghold.seen, ghold.tally], [2, { w: 0, l: 0, t: 0 }])
  assert.deepEqual(s.byNumber.map((t) => t.w), [1, 1, 0])
  assert.deepEqual(ratingPoints([loose()]).map((p) => p.rating), [1090])
})
