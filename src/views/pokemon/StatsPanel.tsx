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
import { DeckIcons, SpeciesSprite, WinBar, fmtRate, heat } from './parts'

type Period = 'all' | 'year' | '90'
const inPeriod = (date: string, p: Period) => {
  if (p === 'all') return true
  const now = new Date()
  if (p === 'year') return date >= `${now.getFullYear()}-01-01`
  const from = new Date(now.getTime() - 90 * 86_400_000)
  return new Date(`${date}T12:00:00`) >= from
}

const Kpi = ({ label, t, icon }: { label: string; t: Tally; icon?: ReactNode }) => <Stat label={label} value={fmtRate(winRate(t))} hint={played(t) ? `${recordText(t)} · ${played(t)} rondas` : 'Sin datos'} icon={icon} />

export function StatsPanel({ game }: { game: PokemonGame }) {
  const { data } = useData()
  const [period, setPeriod] = useState<Period>('all')
  const all = useMemo(() => matchesOf(data.tournaments, data.tournament_rounds).filter((m) => m.t.game === game), [data.tournaments, data.tournament_rounds, game])
  const ms = useMemo(() => all.filter((m) => inPeriod(m.t.date, period)), [all, period])

  if (!all.length)
    return (
      <Empty icon={<BarChart3 className="size-6 text-faint" />}>
        <p>Las estadísticas aparecerán cuando registres rondas en tus torneos de {game.toUpperCase()}.</p>
      </Empty>
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'all', label: 'Siempre' }, { value: 'year', label: 'Este año' }, { value: '90', label: '90 días' }]} />
      </div>
      {!ms.length ? (
        <Empty>No hay rondas con estos filtros.</Empty>
      ) : (
        <>
          <Global ms={ms} game={game} />
          {game === 'tcg' ? <TcgStats ms={ms} /> : <VgcStats ms={ms} />}
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
        <Stat label="Torneos" value={new Set(ms.map((m) => m.t.id)).size} hint={`${new Set(ms.filter((m) => m.t.made_top_cut).map((m) => m.t.id)).size} con Top Cut`} />
      </div>
      <div className={cx('mt-3 grid grid-cols-1 gap-3', game === 'tcg' && 'lg:grid-cols-2')}>
        <Card title="Fase y formato">
          <WinBar label="Suizo · BO1" tally={by((m) => m.r.phase === 'swiss' && m.format === 'bo1')} />
          <WinBar label="Suizo · BO3" tally={by((m) => m.r.phase === 'swiss' && m.format === 'bo3')} />
          <WinBar label="Top Cut · BO1" tally={by((m) => m.r.phase === 'top_cut' && m.format === 'bo1')} />
          <WinBar label="Top Cut · BO3" tally={by((m) => m.r.phase === 'top_cut' && m.format === 'bo3')} />
          <div className="my-2 border-t border-line" />
          <WinBar label="Presencial" tally={by((m) => m.t.mode === 'in_person')} />
          <WinBar label="Online" tally={by((m) => m.t.mode === 'online')} />
        </Card>
        {game === 'tcg' && (
          <Card title="Dado y turno de salida">
            <WinBar label="Ganando el dado" tally={dice.won} />
            <WinBar label="Perdiendo el dado" tally={dice.lost} />
            <div className="my-2 border-t border-line" />
            <WinBar label="Saliendo 1.º" tally={turn.first} hint="Por partida" />
            <WinBar label="Saliendo 2.º" tally={turn.second} hint="Por partida" />
            <p className="mt-2 text-xs text-muted">
              {dice.rate === null ? 'Aún no has anotado el dado.' : `Has ganado el dado el ${fmtRate(dice.rate)} de las veces.`} El turno se cuenta por partida; el dado, por ronda.
            </p>
          </Card>
        )}
      </div>
    </section>
  )
}

// ----------------------------------------------------------------------- TCG
function TcgStats({ ms }: { ms: Match[] }) {
  const { data } = useData()
  const [deckId, setDeckId] = useState('')
  const decks = useMemo(() => [...groupTally(ms, (m) => m.t.deck_id ?? 'none').entries()].sort((a, b) => played(b[1]) - played(a[1])), [ms])
  const picked = decks.some(([id]) => id === deckId) ? deckId : ''
  const scoped = useMemo(() => (picked ? ms.filter((m) => (m.t.deck_id ?? 'none') === picked) : ms), [ms, picked])
  const matrix = useMemo(() => matchupMatrix(scoped), [scoped])
  const turn = turnTally(scoped)
  const dice = diceTally(scoped)
  const deckOf = (id: string) => data.tcg_decks.find((d) => d.id === id)
  const deckName = (id: string) => deckOf(id)?.name ?? 'Sin mazo asignado'
  const name = (c: { id: string; name: string }) => ARCHETYPE.get(c.id)?.name ?? c.name
  const unknown = scoped.filter((m) => !m.r.opponent_archetype).length

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Por mazo</h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Rendimiento de mis mazos">
          {decks.map(([id, t]) => (
            <WinBar
              key={id}
              tally={t}
              label={
                <>
                  <DeckIcons icons={deckOf(id)?.icons ?? []} size={28} label={deckName(id)} />
                  <span className="truncate">{deckName(id)}</span>
                </>
              }
            />
          ))}
        </Card>
        <Card
          title="Salida y dado"
          action={
            <DeckFilter value={picked} onChange={setDeckId} decks={decks.map(([id]) => ({ id, name: deckName(id) }))} />
          }
        >
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
        action={<DeckFilter value={picked} onChange={setDeckId} decks={decks.map(([id]) => ({ id, name: deckName(id) }))} />}
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
              {unknown > 0 && <span>{unknown} rondas sin mazo rival anotado no aparecen.</span>}
            </div>
          </>
        ) : (
          <p className="p-4 text-sm text-muted">{picked ? 'Con este mazo aún no has anotado ningún mazo rival.' : 'Anota el mazo del rival en tus rondas para ver la matriz.'}</p>
        )}
      </Card>
    </section>
  )
}

function DeckFilter({ value, onChange, decks }: { value: string; onChange: (id: string) => void; decks: { id: string; name: string }[] }) {
  return (
    <select className="field h-9 w-40 min-w-0 sm:w-56" aria-label="Filtrar por mazo" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Todos los mazos</option>
      {decks.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
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
    <td className="h-12 min-w-16 rounded-md text-center" style={{ background: heat(rate) }} title={t && rate !== null ? `${title}: ${recordText(t)} (${fmtRate(rate)})` : `${title}: sin rondas`}>
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
function VgcStats({ ms }: { ms: Match[] }) {
  const { data } = useData()
  const [teamId, setTeamId] = useState('')
  const [side, setSide] = useState<'own' | 'rival'>('own')
  const [openMon, setOpenMon] = useState<string | null>(null)
  const teams = useMemo(() => [...groupTally(ms, (m) => m.t.team_id ?? 'none').entries()].sort((a, b) => played(b[1]) - played(a[1])), [ms])
  const scoped = useMemo(() => (teamId ? ms.filter((m) => (m.t.team_id ?? 'none') === teamId) : ms), [ms, teamId])
  const own = useMemo(() => ownMons(scoped), [scoped])
  const rivals = useMemo(() => rivalMons(scoped), [scoped])
  const ext = useMemo(() => extremes(rivals), [rivals])
  const teamName = (id: string) => data.vgc_teams.find((t) => t.id === id)?.name ?? 'Sin equipo asignado'
  const sets = useMemo(() => {
    // Items and natures my Pokémon carry in the teams I played with.
    const used = new Set(scoped.map((m) => m.t.team_id))
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
  }, [scoped, data.vgc_teams])

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Por equipo y Pokémon</h2>
        {teams.length > 1 && (
          <select className="field h-9 w-52" aria-label="Equipo" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Todos los equipos</option>
            {teams.map(([id]) => (
              <option key={id} value={id}>
                {teamName(id)}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Rendimiento por equipo">
          {teams.map(([id, t]) => {
            const team = data.vgc_teams.find((x) => x.id === id)
            return (
              <WinBar
                key={id}
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
            <p className="text-sm text-muted">Necesitas al menos dos rondas contra el mismo Pokémon.</p>
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
          {(side === 'own' ? own : rivals).length === 0 && <li className="p-4 text-sm text-muted">{side === 'own' ? 'Marca en cada ronda qué 4 Pokémon llevaste.' : 'Aún no has anotado Pokémon rivales.'}</li>}
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
