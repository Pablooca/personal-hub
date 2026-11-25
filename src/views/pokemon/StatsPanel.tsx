import { useMemo, useState, type ReactNode } from 'react'
import { BarChart3, ChevronDown } from 'lucide-react'
import { Card, Empty, Segmented, Stat, cx } from '../../components/ui'
import {
  diceTally, emptyTally, extremes, groupTally, matchesOf, matchupMatrix, ownMons, played, recordText, rivalMons, tally, turnTally, winRate,
  type Match, type MonStats, type OwnMonStats, type Tally,
} from '../../lib/pokemon/stats'
import { natureLabel, parseTeam } from '../../lib/pokemon/team'
import type { PokemonGame } from '../../lib/types'
import { useData } from '../../state/data'
import { ARCHETYPE } from './data'
import { ReplayStatsSection } from './ReplayReport'
import { DeckIcons, SpeciesSprite, WinBar, fmtRate, heat } from './parts'

type Source = 'all' | 'tournament' | 'match'
const SOURCE_KEY = 'ph-pokemon-stats-source'
function readSource(): Source {
  try {
    const v = localStorage.getItem(SOURCE_KEY)
    return v === 'tournament' || v === 'match' ? v : 'all'
  } catch {
    return 'all'
  }
}

type Period = 'all' | 'year' | '90'
const inPeriod = (date: string, p: Period) => {
  if (p === 'all') return true
  const now = new Date()
  if (p === 'year') return date >= `${now.getFullYear()}-01-01`
  const from = new Date(now.getTime() - 90 * 86_400_000)
  return new Date(`${date}T12:00:00`) >= from
}

const Kpi = ({ label, t, icon }: { label: string; t: Tally; icon?: ReactNode }) => <Stat label={label} value={fmtRate(winRate(t))} hint={played(t) ? `${recordText(t)} · ${played(t)} ${played(t) === 1 ? 'enfrentamiento' : 'enfrentamientos'}` : 'Sin datos'} icon={icon} />

export function StatsPanel({ game }: { game: PokemonGame }) {
  const { data } = useData()
  const [period, setPeriod] = useState<Period>('all')
  const [source, setSourceState] = useState<Source>(readSource)
  const setSource = (v: Source) => {
    setSourceState(v)
    try {
      localStorage.setItem(SOURCE_KEY, v)
    } catch {
      /* ignore */
    }
  }
  const all = useMemo(() => matchesOf(data.tournaments, data.tournament_rounds, data.pokemon_matches).filter((m) => m.t.game === game), [data.tournaments, data.tournament_rounds, data.pokemon_matches, game])
  const both = all.some((m) => m.source === 'match') && all.some((m) => m.source === 'tournament')
  /** Everything in the period and source: what the decks or teams are compared with. */
  const wide = useMemo(() => all.filter((m) => inPeriod(m.t.date, period) && (!both || source === 'all' || m.source === source)), [all, period, source, both])
  const ownOf = (m: Match) => (game === 'tcg' ? m.t.deck_id : m.t.team_id) ?? 'none'
  const library: { id: string; name: string }[] = game === 'tcg' ? data.tcg_decks : data.vgc_teams
  const used = useMemo(() => [...groupTally(all, (m) => (game === 'tcg' ? m.t.deck_id : m.t.team_id) ?? 'none').entries()].sort((a, b) => played(b[1]) - played(a[1])).map(([id]) => id), [all, game])
  const [own, setOwn] = useState('')
  const picked = used.includes(own) ? own : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ms = useMemo(() => (picked ? wide.filter((m) => ownOf(m) === picked) : wide), [wide, picked, game])
  const nameOf = (id: string) => library.find((x) => x.id === id)?.name ?? (game === 'tcg' ? 'Sin mazo asignado' : 'Sin equipo asignado')
  const replayed = useMemo(() => {
    const ids = new Set(ms.filter((m) => m.source === 'match').map((m) => m.t.id))
    return data.pokemon_matches.filter((m) => ids.has(m.id) && m.replays.length > 0)
  }, [ms, data.pokemon_matches])

  if (!all.length)
    return (
      <Empty icon={<BarChart3 className="size-6 text-faint" />}>
        <p>Las estadísticas aparecerán cuando registres rondas de torneo o partidas de {game.toUpperCase()}.</p>
      </Empty>
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select className="field h-9 w-full min-w-0 sm:w-64 pointer-coarse:h-11" aria-label={game === 'tcg' ? 'Filtrar por mazo' : 'Filtrar por equipo'} value={picked} onChange={(e) => setOwn(e.target.value)}>
          <option value="">{game === 'tcg' ? 'Todos los mazos' : 'Todos los equipos'}</option>
          {used.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'all', label: 'Siempre' }, { value: 'year', label: 'Este año' }, { value: '90', label: '90 días' }]} />
        {both && <Segmented value={source} onChange={setSource} options={[{ value: 'all', label: 'Todo' }, { value: 'tournament', label: 'Torneos' }, { value: 'match', label: 'Partidas sueltas' }]} />}
      </div>
      {!ms.length ? (
        <Empty>No hay nada con estos filtros.</Empty>
      ) : (
        <>
          <Global ms={ms} game={game} />
          {game === 'tcg' ? <TcgStats ms={ms} wide={wide} picked={picked} onPick={setOwn} /> : <VgcStats ms={ms} wide={wide} picked={picked} onPick={setOwn} />}
          {replayed.length > 0 && <ReplayStatsSection matches={replayed} />}
        </>
      )}
    </div>
  )
}

function Global({ ms, game }: { ms: Match[]; game: PokemonGame }) {
  const by = (f: (m: Match) => boolean) => tally(ms.filter(f))
  const turn = turnTally(ms)
  const dice = diceTally(ms)
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Global</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Winrate" t={tally(ms)} />
        <Kpi label="BO1" t={by((m) => m.format === 'bo1')} />
        <Kpi label="BO3" t={by((m) => m.format === 'bo3')} />
        <Stat label="Torneos" value={new Set(ms.filter((m) => m.source === 'tournament').map((m) => m.t.id)).size} hint={`${new Set(ms.filter((m) => m.t.made_top_cut).map((m) => m.t.id)).size} con Top Cut`} />
      </div>
      <div className={cx('mt-3 grid grid-cols-1 gap-3', game === 'tcg' && 'lg:grid-cols-2')}>
        <Card title="Fase y formato">
          <WinBar label="Suizo · BO1" tally={by((m) => m.r.phase === 'swiss' && m.format === 'bo1')} />
          <WinBar label="Suizo · BO3" tally={by((m) => m.r.phase === 'swiss' && m.format === 'bo3')} />
          <WinBar label="Top Cut · BO1" tally={by((m) => m.r.phase === 'top_cut' && m.format === 'bo1')} />
          <WinBar label="Top Cut · BO3" tally={by((m) => m.r.phase === 'top_cut' && m.format === 'bo3')} />
          <div className="my-2 border-t border-line" />
          {ms.some((m) => m.source === 'match') && (
            <>
              <WinBar label="Partidas sueltas · BO1" tally={by((m) => m.source === 'match' && m.format === 'bo1')} />
              <WinBar label="Partidas sueltas · BO3" tally={by((m) => m.source === 'match' && m.format === 'bo3')} />
              <div className="my-2 border-t border-line" />
            </>
          )}
          <WinBar label="Torneos presenciales" tally={by((m) => m.t.mode === 'in_person')} />
          <WinBar label="Torneos online" tally={by((m) => m.t.mode === 'online')} />
        </Card>
        {game === 'tcg' && (
          <Card title="Dado y turno de salida">
            <WinBar label="Ganando el dado" tally={dice.won} />
            <WinBar label="Perdiendo el dado" tally={dice.lost} />
            <div className="my-2 border-t border-line" />
            <WinBar label="Saliendo 1.º" tally={turn.first} hint="Por partida" />
            <WinBar label="Saliendo 2.º" tally={turn.second} hint="Por partida" />
            <p className="mt-2 text-xs text-muted">
              {dice.rate === null ? 'Aún no has anotado el dado.' : `Has ganado el dado el ${fmtRate(dice.rate)} de las veces.`} El turno se cuenta por partida; el dado, por enfrentamiento.
            </p>
          </Card>
        )}
      </div>
    </section>
  )
}

// ----------------------------------------------------------------------- TCG
interface Scope {
  /** Only the chosen deck or team; `wide` has them all, to compare. */
  ms: Match[]
  wide: Match[]
  picked: string
  onPick: (id: string) => void
}

/** A deck or team to compare with the rest: choosing it filters the whole page. */
const PickRow = ({ on, name, onClick, children }: { on: boolean; name: string; onClick: () => void; children: ReactNode }) => (
  <button type="button" aria-pressed={on} aria-label={`${on ? 'Quitar el filtro de' : 'Ver solo'} ${name}`} onClick={onClick} className={cx('-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 text-left transition hover:bg-surface-2', on && 'bg-accent/10 ring-1 ring-accent/40')}>
    {children}
  </button>
)

function TcgStats({ ms, wide, picked, onPick }: Scope) {
  const { data } = useData()
  const decks = useMemo(() => [...groupTally(wide, (m) => m.t.deck_id ?? 'none').entries()].sort((a, b) => played(b[1]) - played(a[1])), [wide])
  const matrix = useMemo(() => matchupMatrix(ms), [ms])
  const turn = turnTally(ms)
  const dice = diceTally(ms)
  const deckOf = (id: string) => data.tcg_decks.find((d) => d.id === id)
  const deckName = (id: string) => deckOf(id)?.name ?? 'Sin mazo asignado'
  const name = (c: { id: string; name: string }) => ARCHETYPE.get(c.id)?.name ?? c.name
  const unknown = ms.filter((m) => !m.r.opponent_archetype).length

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Por mazo</h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Rendimiento de mis mazos">
          {decks.map(([id, t]) => (
            <PickRow key={id} on={picked === id} name={deckName(id)} onClick={() => onPick(picked === id ? '' : id)}>
              <WinBar
                tally={t}
                label={
                  <>
                    <DeckIcons icons={deckOf(id)?.icons ?? []} size={28} label={deckName(id)} />
                    <span className="truncate">{deckName(id)}</span>
                  </>
                }
              />
            </PickRow>
          ))}
        </Card>
        <Card title="Salida y dado">
          <WinBar label="Saliendo 1.º" tally={turn.first} />
          <WinBar label="Saliendo 2.º" tally={turn.second} />
          <WinBar label="Ganando el dado" tally={dice.won} />
          <WinBar label="Perdiendo el dado" tally={dice.lost} />
        </Card>
      </div>

      <Card
        className="mt-3"
        title="Matriz de emparejamientos"
        bodyClass="p-0"
      >
        {matrix.cols.length ? (
          <>
            <div className="scrollbar-thin relative overflow-x-auto" tabIndex={0} role="region" aria-label="Matriz de emparejamientos">
              <table className="border-separate border-spacing-0.5 p-2 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface px-2 text-left text-xs font-medium text-muted">Mi mazo ↓ · Rival →</th>
                    {matrix.cols.map((c) => (
                      <th key={c.key} className="min-w-16 px-1 pb-1 align-bottom font-normal">
                        <DeckIcons icons={c.icons} size={32} label={name(c)} />
                        <span className="sr-only">{name(c)}</span>
                        <span className="block max-w-20 truncate text-[10px] text-faint" aria-hidden title={name(c)}>
                          {name(c)}
                        </span>
                      </th>
                    ))}
                    <th className="px-2 text-xs font-medium text-muted">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row) => (
                    <tr key={row.deckId}>
                      <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left font-normal">
                        <span className="flex items-center gap-2">
                          <DeckIcons icons={deckOf(row.deckId)?.icons ?? []} size={32} label={deckName(row.deckId)} />
                          <span className="hidden max-w-40 truncate sm:inline">{deckName(row.deckId)}</span>
                        </span>
                      </th>
                      {matrix.cols.map((c) => (
                        <Cell key={c.key} t={row.cells.get(c.key)} title={`${deckName(row.deckId)} contra ${name(c)}`} />
                      ))}
                      <Cell t={row.total} title={`${deckName(row.deckId)}: total`} bold />
                    </tr>
                  ))}
                  {matrix.rows.length > 1 && (
                    <tr>
                      <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left text-xs font-medium text-muted">Total</th>
                      {matrix.cols.map((c) => (
                        <Cell key={c.key} t={c.total} title={`Total contra ${name(c)}`} bold />
                      ))}
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-xs text-muted">
              <Legend rate={15} label="Desfavorable" />
              <Legend rate={50} label="50 %" />
              <Legend rate={85} label="Favorable" />
              {unknown > 0 && <span>{unknown} sin mazo rival anotado no aparecen.</span>}
            </div>
          </>
        ) : (
          <p className="p-4 text-sm text-muted">{picked ? 'Con este mazo aún no has anotado ningún mazo rival.' : 'Anota el mazo del rival para ver la matriz.'}</p>
        )}
      </Card>
    </section>
  )
}

const Legend = ({ rate, label }: { rate: number; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="size-3 rounded" style={{ background: heat(rate) }} /> {label}
  </span>
)

function Cell({ t, title, bold }: { t?: Tally; title: string; bold?: boolean }) {
  const rate = t ? winRate(t) : null
  return (
    <td className="h-12 min-w-16 rounded-md text-center" style={{ background: heat(rate) }} title={t && rate !== null ? `${title}: ${recordText(t)} (${fmtRate(rate)})` : `${title}: sin datos`}>
      {t && rate !== null ? (
        <>
          <span className={cx('num block text-sm', bold ? 'font-bold' : 'font-semibold')}>{fmtRate(rate)}</span>
          <span className="num block text-[10px]">{recordText(t)}</span>
        </>
      ) : (
        <span className="text-faint">·</span>
      )}
    </td>
  )
}

// ----------------------------------------------------------------------- VGC
function VgcStats({ ms, wide, picked, onPick }: Scope) {
  const { data } = useData()
  const [side, setSide] = useState<'own' | 'rival'>('own')
  const [openMon, setOpenMon] = useState<string | null>(null)
  const teams = useMemo(() => [...groupTally(wide, (m) => m.t.team_id ?? 'none').entries()].sort((a, b) => played(b[1]) - played(a[1])), [wide])
  const own = useMemo(() => ownMons(ms), [ms])
  const rivals = useMemo(() => rivalMons(ms), [ms])
  const ext = useMemo(() => extremes(rivals), [rivals])
  const teamName = (id: string) => data.vgc_teams.find((t) => t.id === id)?.name ?? 'Sin equipo asignado'
  const sets = useMemo(() => {
    // Items and natures my Pokémon carry in the teams I played with.
    const used = new Set(ms.map((m) => m.t.team_id))
    const out = new Map<string, { items: Set<string>; natures: Set<string> }>()
    for (const t of data.vgc_teams)
      if (used.has(t.id))
        for (const m of parseTeam(t.paste).mons) {
          const s = out.get(m.species) ?? { items: new Set<string>(), natures: new Set<string>() }
          if (m.item) s.items.add(m.item)
          if (m.nature) s.natures.add(m.nature)
          out.set(m.species, s)
        }
    return out
  }, [ms, data.vgc_teams])

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Por equipo y Pokémon</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Rendimiento por equipo">
          {teams.map(([id, t]) => {
            const team = data.vgc_teams.find((x) => x.id === id)
            return (
              <PickRow key={id} on={picked === id} name={teamName(id)} onClick={() => onPick(picked === id ? '' : id)}>
                <WinBar
                  tally={t}
                  label={
                    <span className="min-w-0">
                      <span className="block truncate">{teamName(id)}</span>
                      {team && (
                        <span className="flex -space-x-1.5">
                          {parseTeam(team.paste).mons.map((m, i) => (
                            <SpeciesSprite key={i} species={m.species} size={26} />
                          ))}
                        </span>
                      )}
                    </span>
                  }
                />
              </PickRow>
            )
          })}
        </Card>
        <Card title="Enfrentamientos contra Pokémon (mín. 2)">
          {ext.good.length || ext.bad.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Matchups title="Favorables" list={ext.good} />
              <Matchups title="Desfavorables" list={ext.bad} />
            </div>
          ) : (
            <p className="text-sm text-muted">Necesitas al menos dos enfrentamientos contra el mismo Pokémon.</p>
          )}
        </Card>
      </div>

      <Card
        className="mt-3"
        title="Por Pokémon"
        bodyClass="p-0"
        action={<Segmented value={side} onChange={setSide} options={[{ value: 'own', label: 'Míos' }, { value: 'rival', label: 'Rivales' }]} />}
      >
        <ul className="divide-y divide-line">
          {(side === 'own' ? own : rivals).map((m) => {
            const key = `${side}-${m.species}`
            const open = openMon === key
            return (
              <li key={key}>
                <button type="button" aria-expanded={open} onClick={() => setOpenMon(open ? null : key)} className="flex min-h-14 w-full items-center gap-3 px-4 py-1.5 text-left hover:bg-surface-2">
                  <SpeciesSprite species={m.species} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{m.species}</span>
                    <span className="block truncate text-xs text-muted">
                      {'usage' in m ? `Llevado ${played(m.record)} veces (${fmtRate(m.usage)})` : `Visto ${played(m.record)} veces${m.items[0] ? ` · ${m.items[0][0]}` : ''}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block text-sm font-semibold">{fmtRate(winRate(m.record))}</span>
                    <span className="num block text-xs text-muted">{recordText(m.record)}</span>
                  </span>
                  <ChevronDown className={cx('size-4 text-faint transition', open && 'rotate-180')} />
                </button>
                {open && <div className="border-t border-line bg-surface-2 px-4 py-3">{'usage' in m ? <OwnDetail m={m} set={sets.get(m.species)} /> : <RivalDetail m={m} />}</div>}
              </li>
            )
          })}
          {(side === 'own' ? own : rivals).length === 0 && <li className="p-4 text-sm text-muted">{side === 'own' ? 'Marca qué 4 Pokémon llevaste.' : 'Aún no has anotado Pokémon rivales.'}</li>}
        </ul>
      </Card>
    </section>
  )
}

const Matchups = ({ title, list }: { title: string; list: MonStats[] }) => (
  <div>
    <div className="eyebrow mb-1">{title}</div>
    {list.slice(0, 5).map((m) => (
      <WinBar
        key={m.species}
        tally={m.record}
        label={
          <>
            <SpeciesSprite species={m.species} size={28} /> <span className="truncate">{m.species}</span>
          </>
        }
      />
    ))}
    {!list.length && <p className="text-sm text-muted">Ninguno todavía.</p>}
  </div>
)

const Tags = ({ title, list, label = (s: string) => s }: { title: string; list: [string, number][]; label?: (s: string) => string }) => (
  <div>
    <div className="eyebrow mb-1">{title}</div>
    {list.length ? (
      <ul className="space-y-0.5 text-sm">
        {list.slice(0, 6).map(([k, n]) => (
          <li key={k} className="flex justify-between gap-2">
            <span className="truncate">{label(k)}</span> <span className="num text-muted">{n}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted">—</p>
    )}
  </div>
)

const RivalDetail = ({ m }: { m: MonStats }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <Tags title="Objetos" list={m.items} />
    <Tags title="Naturalezas" list={m.natures} label={natureLabel} />
    <Tags title="Movimientos" list={m.moves} />
  </div>
)

function OwnDetail({ m, set }: { m: OwnMonStats; set?: { items: Set<string>; natures: Set<string> } }) {
  const list = [...m.versus.entries()].sort((a, b) => played(b[1]) - played(a[1]) || (winRate(b[1]) ?? 0) - (winRate(a[1]) ?? 0)).slice(0, 12)
  return (
    <div className="space-y-3">
      {set && (
        <p className="text-sm">
          <span className="text-muted">Objetos:</span> {[...set.items].join(', ') || '—'} · <span className="text-muted">Naturalezas:</span> {[...set.natures].map(natureLabel).join(', ') || '—'}
        </p>
      )}
      <div className="eyebrow">Frente a cada Pokémon rival</div>
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {list.map(([species, t]) => (
          <WinBar
            key={species}
            tally={t ?? emptyTally()}
            label={
              <>
                <SpeciesSprite species={species} size={28} /> <span className="truncate">{species}</span>
              </>
            }
          />
        ))}
        {!list.length && <p className="text-sm text-muted">Sin Pokémon rivales anotados.</p>}
      </div>
    </div>
  )
}
