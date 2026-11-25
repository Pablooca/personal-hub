import { addDays, toDateKey } from '../lib/dates'
import { uid } from '../lib/format'
import { EXAMPLE_DECK, EXAMPLE_TEAM } from '../lib/pokemon/examples'
import type { Dataset, OwnedCard, RivalPokemon, TcgDeck, Tournament, TournamentRound, VgcTeam } from '../lib/types'

/** Fictional tournaments for Demo Mode. */
export function buildDemoPokemon(today: Date): Pick<Dataset, 'tcg_decks' | 'vgc_teams' | 'tournaments' | 'tournament_rounds' | 'deck_versions' | 'matchup_notes' | 'owned_cards' | 'collection_snapshots'> {
  const now = new Date().toISOString()
  const day = (n: number) => toDateKey(addDays(today, n))
  const deck: TcgDeck = { id: uid(), ...EXAMPLE_DECK, icons: [...EXAMPLE_DECK.icons], created_at: now }
  const deck2: TcgDeck = { ...deck, id: uid(), name: 'Dragapult de ejemplo', icons: ['dragapult'], is_built: false }
  const team: VgcTeam = { id: uid(), ...EXAMPLE_TEAM, created_at: now }

  const base: Omit<Tournament, 'id' | 'game' | 'name' | 'date'> = {
    mode: 'in_person', location: '', category: 'league_cup', format: 'TEF-DLR', players: 42, swiss_rounds: 6, swiss_format: 'bo3', has_top_cut: true, top_cut_type: 'standard', top_cut_size: 8,
    top_cut_format: 'bo3', made_top_cut: false, deck_id: null, team_id: null, status: 'finished', placement_bracket: null, placement: null, cp: null, notes: '', created_at: now,
  }
  const cup: Tournament = { ...base, id: uid(), game: 'tcg', name: 'League Cup de ejemplo', date: day(-12), location: 'Tienda de ejemplo', deck_id: deck.id, made_top_cut: true, placement_bracket: 4, placement: 3, cp: 32 }
  const online: Tournament = { ...base, id: uid(), game: 'tcg', name: 'Torneo online de ejemplo', date: day(-5), mode: 'online', category: 'online', players: 120, swiss_rounds: 7, swiss_format: 'bo1', deck_id: deck2.id, placement_bracket: 64, placement: 38 }
  const vgc: Tournament = { ...base, id: uid(), game: 'vgc', name: 'League Challenge VGC de ejemplo', date: day(-3), category: 'league_challenge', format: 'Regulación M-C', players: 18, swiss_rounds: 5, team_id: team.id, placement_bracket: 8, cp: 8 }
  const live: Tournament = { ...base, id: uid(), game: 'tcg', name: 'League Cup en juego', date: day(0), location: 'Tienda de ejemplo', players: 64, deck_id: deck.id, status: 'in_progress' }

  const rounds: TournamentRound[] = []
  const add = (t: Tournament, o: Partial<TournamentRound> & Pick<TournamentRound, 'number' | 'result'>) =>
    rounds.push({
      id: uid(), tournament_id: t.id, phase: 'swiss', games: [], won_dice: null, went_first: null, opponent_name: '', opponent_archetype: '', opponent_icons: [], opponent_deck_name: '',
      opponent_pokemon: [], opponent_record: null, my_pokemon: [], notes: '', created_at: now, ...o,
    })

  const META: Record<string, [string, string[]]> = {
    dragapult: ['Dragapult', ['dragapult']],
    'basic-box': ['Basic Box', ['kangaskhan-mega', 'clefairy']],
    'mega-rayquaza': ['Mega Rayquaza', ['rayquaza-mega']],
    'ns-zoroark': ["N's Zoroark", ['zoroark']],
    slowking: ['Slowking', ['slowking']],
    'lopunny-dudunsparce': ['Lopunny Dudunsparce', ['lopunny-mega', 'dudunsparce']],
    other: ['Sableye control', ['sableye', 'munkidori']],
  }
  const tcg = (t: Tournament, number: number, id: string, games: string, first: boolean, dice: boolean, phase: TournamentRound['phase'] = 'swiss') => {
    const gs = [...games].map((g, i) => ({ result: g === 'W' ? ('win' as const) : g === 'L' ? ('loss' as const) : ('tie' as const), first: i === 0 ? first : games[i - 1] === 'L' }))
    const w = gs.filter((g) => g.result === 'win').length
    const l = gs.filter((g) => g.result === 'loss').length
    add(t, { number, phase, result: w > l ? 'win' : l > w ? 'loss' : 'tie', games: gs, won_dice: dice, went_first: first, opponent_archetype: id, opponent_deck_name: META[id][0], opponent_icons: META[id][1] })
  }
  tcg(cup, 1, 'dragapult', 'WW', true, true)
  tcg(cup, 2, 'basic-box', 'WLW', false, false)
  tcg(cup, 3, 'mega-rayquaza', 'LL', false, true)
  tcg(cup, 4, 'ns-zoroark', 'WW', true, true)
  tcg(cup, 5, 'other', 'WL', true, false)
  tcg(cup, 6, 'dragapult', 'WLW', false, false)
  tcg(cup, 1, 'slowking', 'WW', true, true, 'top_cut')
  tcg(cup, 2, 'mega-rayquaza', 'WLL', false, false, 'top_cut')
  ;(['dragapult', 'mega-rayquaza', 'lopunny-dudunsparce', 'basic-box', 'slowking', 'dragapult', 'ns-zoroark'] as const).forEach((a, i) => tcg(online, i + 1, a, 'WLWWLLW'[i], i % 2 === 0, i % 3 !== 0))
  tcg(live, 1, 'basic-box', 'WW', true, true)
  tcg(live, 2, 'dragapult', 'WLW', false, true)
  tcg(live, 3, 'mega-rayquaza', 'LL', false, false)
  ;[{ w: 1, l: 2, t: 0 }, { w: 2, l: 1, t: 0 }].forEach((r, i) => {
    const round = rounds.find((x) => x.tournament_id === live.id && x.number === i + 1)
    if (round) round.opponent_record = { ...r, dropped: false, bye: false }
  })

  const mon = (species: string, item: string, nature: string, ...moves: string[]): RivalPokemon => ({ species, item, nature, moves })
  const inc = mon('Incineroar', 'Sitrus Berry', 'Careful', 'Fake Out', 'Flare Blitz', 'Parting Shot', 'Protect')
  const chomp = mon('Garchomp', 'Focus Sash', 'Jolly', 'Earthquake', 'Dragon Claw', 'Protect', 'Rock Slide')
  const sinis = mon('Sinistcha', 'Leftovers', 'Bold', 'Matcha Gotcha', 'Rage Powder', 'Trick Room', 'Protect')
  const char = mon('Charizard', 'Charizardite Y', 'Timid', 'Heat Wave', 'Solar Beam', 'Protect', 'Air Slash')
  const king = mon('Kingambit', 'Black Glasses', 'Adamant', 'Sucker Punch', 'Kowtow Cleave', 'Iron Head', 'Protect')
  const v = (number: number, g: string, mine: string[], rival: RivalPokemon[]) => {
    const gs = [...g].map((x) => ({ result: x === 'W' ? ('win' as const) : ('loss' as const), first: null }))
    add(vgc, { number, result: gs.filter((x) => x.result === 'win').length >= 2 ? 'win' : 'loss', games: gs, my_pokemon: mine, opponent_pokemon: rival })
  }
  v(1, 'WW', ['Delphox', 'Whimsicott', 'Garchomp', 'Farigiraf'], [inc, chomp, sinis, char])
  v(2, 'WLW', ['Delphox', 'Glimmora', 'Heracross', 'Farigiraf'], [king, inc, sinis])
  v(3, 'LL', ['Heracross', 'Whimsicott', 'Garchomp', 'Glimmora'], [char, chomp, inc, king])
  v(4, 'LWW', ['Delphox', 'Whimsicott', 'Glimmora', 'Garchomp'], [king, sinis, chomp])
  v(5, 'WLL', ['Delphox', 'Farigiraf', 'Heracross', 'Garchomp'], [char, inc, sinis, king])

  const card = (id: string, set: string, number: string, name: string, quantity: number, low: number, o: Partial<OwnedCard> = {}): OwnedCard => ({
    id: uid(), tcgdex_id: id, set_code: set, set_name: '', number, name, name_en: name, category: 'pokemon', signature: `p|${name.toLowerCase()}`, rarity: 'Rara Doble', image: null, language: 'es', condition: 'NM', finish: 'holo',
    first_edition: false, signed: false, altered: false, grade_company: '', grade: '', quantity, location: 'Archivador 1', for_sale: false, paid: null, acquired_at: null, cm_product: null, ref_low: low, ref_trend: low * 1.6,
    ref_date: day(-1), standard: true, standard_date: day(0), own_price: null, own_price_date: null, notes: '', created_at: now, ...o,
  })
  const owned_cards: OwnedCard[] = [
    card('me01-104', 'MEG', '104', 'Mega Kangaskhan ex', 5, 0.4, { own_price: 0.9, own_price_date: day(-3) }),
    card('sv08-076', 'SSP', '76', 'Latias ex', 2, 0.1),
    card('me01-131', 'MEG', '131', 'Ultra Ball', 6, 0.02, { category: 'trainer', signature: 't|ultra ball', finish: 'normal', rarity: 'Infrecuente', location: 'Caja' }),
    card('sv06-165', 'TWM', '165', 'Unfair Stamp', 1, 7.99, { category: 'trainer', signature: 't|unfair stamp', rarity: 'ACE SPEC', language: 'en', for_sale: true }),
  ]
  return { deck_versions: [], matchup_notes: [], owned_cards, collection_snapshots: [], tcg_decks: [deck, deck2], vgc_teams: [team], tournaments: [live, vgc, online, cup], tournament_rounds: rounds }
}
