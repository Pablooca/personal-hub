import { useMemo, useState } from 'react'
import { Link2, Plus, Swords } from 'lucide-react'
import { LineChart } from '../../components/LineChart'
import { Badge, Button, Card, Empty, Segmented, Stat, cx } from '../../components/ui'
import { fromDateKey } from '../../lib/dates'
import { fmtDate } from '../../lib/format'
import { ratingPoints } from '../../lib/pokemon/replayStats'
import { addResult, emptyTally, matchesOf, played, recordText, tally, winRate } from '../../lib/pokemon/stats'
import type { MatchFormat, PokemonGame, PokemonMatch } from '../../lib/types'
import { useData } from '../../state/data'
import { MatchModal } from './MatchModal'
import { OwnFilter, useOwnFilter } from './OwnFilter'
import { OwnIcons } from './Tournaments'
import { DeckIcons, FORMAT_LABEL, RESULT_STYLES, SpeciesSprite, fmtRate } from './parts'

const scoreText = (m: PokemonMatch) => {
  const t = m.games.reduce((a, g) => addResult(a, g.result), emptyTally())
  return m.games.length ? recordText(t).replaceAll('-', '–') : RESULT_STYLES[m.result].short
}

export function Matches({ game, initialId = null }: { game: PokemonGame; initialId?: string | null }) {
  const { data } = useData()
  const [openId, setOpenId] = useState<string | null>(initialId)
  /** Number that changes to start a blank form again. */
  const [adding, setAdding] = useState<number | null>(null)
  const [format, setFormat] = useState<MatchFormat | 'all'>('all')
  const [limit, setLimit] = useState(40)

  const all = useMemo(
    () => data.pokemon_matches.filter((m) => m.game === game).sort((a, b) => b.date.localeCompare(a.date) || (b.replays[0]?.at ?? b.created_at).localeCompare(a.replays[0]?.at ?? a.created_at)),
    [data.pokemon_matches, game],
  )
  const own = useOwnFilter(game, all)
  const list = all.filter((m) => (format === 'all' || m.format === format) && own.matches(m))
  const asMatches = matchesOf([], [], list)
  const games = list.reduce((a, m) => m.games.reduce((x, g) => addResult(x, g.result), a), emptyTally())
  const points = ratingPoints(list)
  const open = data.pokemon_matches.find((m) => m.id === openId)
  const by = (f: MatchFormat) => tally(asMatches.filter((m) => m.format === f))

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{game === 'tcg' ? 'Partidas sueltas y sets fuera de torneos.' : 'Partidas y sets fuera de torneos. Pega los enlaces de Showdown y se rellenan solos.'}</p>
        <Button variant="primary" onClick={() => setAdding(1)}>
          {game === 'vgc' ? <Link2 className="size-4" /> : <Plus className="size-4" />} Nueva partida
        </Button>
      </div>

      {!all.length ? (
        <Empty icon={<Swords className="size-6 text-faint" />}>
          <p>Aún no hay partidas de {game.toUpperCase()}.</p>
        </Empty>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented value={format} onChange={setFormat} options={[{ value: 'all', label: 'Todas' }, { value: 'bo1', label: 'BO1' }, { value: 'bo3', label: 'BO3' }]} />
            <OwnFilter game={game} filter={own} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Winrate" value={fmtRate(winRate(tally(asMatches)))} hint={`${recordText(tally(asMatches))} · ${list.length} ${list.length === 1 ? 'enfrentamiento' : 'enfrentamientos'}`} />
            <Stat label="BO1" value={fmtRate(winRate(by('bo1')))} hint={played(by('bo1')) ? recordText(by('bo1')) : 'Sin datos'} />
            <Stat label="BO3" value={fmtRate(winRate(by('bo3')))} hint={played(by('bo3')) ? recordText(by('bo3')) : 'Sin datos'} />
            {points.length ? <Stat label="Elo" value={points.at(-1)!.rating} hint={`máximo ${Math.max(...points.map((p) => p.rating))}`} /> : <Stat label="Partidas" value={fmtRate(winRate(games))} hint={played(games) ? `${recordText(games)} en total` : 'Sin datos'} />}
          </div>
          {points.length > 1 && (
            <Card className="mt-3" title="Elo en Showdown">
              <LineChart
                label="Elo en Showdown"
                height={130}
                points={points.map((p, i) => ({ x: i, y: p.rating, label: fmtDate(new Date(p.at), { day: 'numeric', month: 'short' }), detail: p.match.opponent_name ? `contra ${p.match.opponent_name}` : '' }))}
                format={(y) => String(Math.round(y))}
              />
            </Card>
          )}

          <ul className="mt-4 space-y-2">
            {list.slice(0, limit).map((m) => (
              <li key={m.id}>
                <Row m={m} onOpen={() => setOpenId(m.id)} />
              </li>
            ))}
          </ul>
          {!list.length && <Empty>Ninguna partida coincide.</Empty>}
          {list.length > limit && (
            <button type="button" className="mt-3 min-h-11 w-full text-sm font-medium text-accent hover:underline" onClick={() => setLimit((l) => l + 80)}>
              Ver más ({list.length - limit})
            </button>
          )}
        </>
      )}

      {adding !== null && <MatchModal key={adding} game={game} match={null} onClose={() => setAdding(null)} onSaved={(another) => setAdding(another ? adding + 1 : null)} />}
      {open && <MatchModal key={open.id} game={game} match={open} onClose={() => setOpenId(null)} onSaved={() => setOpenId(null)} />}
    </>
  )
}

function Row({ m, onOpen }: { m: PokemonMatch; onOpen: () => void }) {
  const { data } = useData()
  const r = RESULT_STYLES[m.result]
  const rating = m.replays.find((g) => g.mine.rating_after !== null)?.mine
  const diff = rating && rating.rating !== null && rating.rating_after !== null ? rating.rating_after - rating.rating : null
  const rivals = m.teams?.rival.map((x) => x.species) ?? m.opponent_pokemon.map((x) => x.species)
  return (
    <button type="button" onClick={onOpen} className="card flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-3 text-left transition hover:border-line-strong sm:flex-nowrap">
      <span className={cx('grid size-12 shrink-0 place-items-center rounded-lg border', r.cls)}>
        <span className="num text-base font-bold" title={r.label}>
          <span className="sr-only">{r.label}: </span>
          {scoreText(m)}
        </span>
      </span>
      <span className="min-w-0 flex-1 basis-40">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{m.opponent_name ? `contra ${m.opponent_name}` : m.game === 'tcg' && m.opponent_deck_name ? `contra ${m.opponent_deck_name}` : r.label}</span>
          <Badge className="border-line text-muted">{FORMAT_LABEL[m.format]}</Badge>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {[fmtDate(fromDateKey(m.date), { day: 'numeric', month: 'short', year: 'numeric' }), m.venue, m.game === 'tcg' && m.opponent_name && m.opponent_deck_name].filter(Boolean).join(' · ')}
          {diff !== null && (
            <span className="num">
              {' '}
              · Elo {rating!.rating_after} ({diff >= 0 ? '+' : '−'}
              {Math.abs(diff)})
            </span>
          )}
        </span>
      </span>
      <span className="flex items-center gap-2 max-sm:w-full max-sm:justify-between">
        <OwnIcons deck={data.tcg_decks.find((d) => d.id === m.deck_id)} team={data.vgc_teams.find((t) => t.id === m.team_id)} size={30} />
        {(m.game === 'tcg' ? m.opponent_icons.length > 0 : rivals.length > 0) && <span className="text-xs text-faint">vs</span>}
        {m.game === 'tcg'
          ? m.opponent_icons.length > 0 && <DeckIcons icons={m.opponent_icons} size={30} label={m.opponent_deck_name} />
          : rivals.length > 0 && (
              <span className="inline-flex -space-x-2">
                {rivals.map((s) => (
                  <SpeciesSprite key={s} species={s} size={26} />
                ))}
              </span>
            )}
      </span>
    </button>
  )
}
