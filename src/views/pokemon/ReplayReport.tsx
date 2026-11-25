import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ExternalLink, Skull, Swords } from 'lucide-react'
import { Badge, Card, Segmented, Stat, cx } from '../../components/ui'
import { replayUrl } from '../../lib/pokemon/replay'
import { replayStats, type Combo } from '../../lib/pokemon/replayStats'
import { played, recordText, winRate } from '../../lib/pokemon/stats'
import { natureLabel } from '../../lib/pokemon/team'
import type { PokemonMatch, ReplayGame, ReplayMon, ReplaySide } from '../../lib/types'
import { RESULT_STYLES, SpeciesSprite, WinBar, fmtRate } from './parts'

const END: Record<ReplayGame['end'], string> = { ko: '', forfeit: 'por abandono', timeout: 'por tiempo' }
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
/** "[Gen 9 Champions] VGC 2026 Reg M-C (Bo3)" → "VGC 2026 Reg M-C". */
export const shortFormat = (f: string) => f.replace(/^\[[^\]]*\]\s*/, '').replace(/\s*\(Bo\d\)$/i, '')

// --------------------------------------------------------------- one match
export function ReplayReport({ teams, games }: { teams: PokemonMatch['teams']; games: ReplayGame[] }) {
  const last = games.at(-1)
  return (
    <div className="space-y-5">
      {games.map((g, i) => (
        <GameCard key={g.id} game={g} label={g.number ?? i + 1} open={games.length === 1} />
      ))}
      {teams && last && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <TeamSheet title={last.mine.name} mons={teams.mine} games={games} side="mine" />
          <TeamSheet title={last.rival.name} mons={teams.rival} games={games} side="rival" />
        </div>
      )}
    </div>
  )
}

function GameCard({ game: g, label, open: initial }: { game: ReplayGame; label: number; open: boolean }) {
  const [open, setOpen] = useState(initial)
  const r = RESULT_STYLES[g.result]
  return (
    <section className="rounded-xl border border-line">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
        <h3 className="text-sm font-semibold">Partida {label}</h3>
        <Badge className={r.cls}>{r.label}</Badge>
        <span className="num text-xs text-muted">
          {g.turns} turnos{g.seconds > 0 && ` · ${clock(g.seconds)}`} · quedan {g.mine.left}–{g.rival.left}
          {END[g.end] && ` · ${END[g.end]}`}
        </span>
        <a href={replayUrl(g.id)} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-8 items-center gap-1 text-xs font-medium text-accent hover:underline">
          Ver en Showdown <ExternalLink className="size-3.5" />
        </a>
      </header>
      <div className="grid grid-cols-1 divide-line max-md:divide-y md:grid-cols-2 md:divide-x">
        <SideTable side={g.mine} title="Yo" />
        <SideTable side={g.rival} title={g.rival.name || 'Rival'} />
      </div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-10 w-full items-center gap-2 border-t border-line px-4 text-sm font-medium hover:bg-surface-2">
        <ChevronDown className={cx('size-4 text-faint transition', open && 'rotate-180')} /> Turno a turno
      </button>
      {open && <Log game={g} />}
    </section>
  )
}

function SideTable({ side, title }: { side: ReplaySide; title: string }) {
  const rows = side.brought.map((s) => side.mons.find((m) => m.species === s)).filter((m) => m !== undefined)
  const luck = [side.crits && `${side.crits} ${side.crits === 1 ? 'crítico' : 'críticos'}`, side.misses && `${side.misses} ${side.misses === 1 ? 'fallo' : 'fallos'}`, side.lost_turns && `${side.lost_turns} ${side.lost_turns === 1 ? 'turno perdido' : 'turnos perdidos'}`].filter(Boolean)
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-semibold">{title}</span>
        {side.rating !== null && (
          <span className="num text-xs whitespace-nowrap text-muted">
            {side.rating}
            {side.rating_after !== null && ` → ${side.rating_after}`}
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {rows.map((m, i) => (
          <li key={m.species} className="flex min-h-10 items-center gap-2 text-sm">
            <SpeciesSprite species={m.species} size={36} className={cx(m.fainted !== null && 'opacity-45 grayscale')} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-1.5">
                <span className="truncate font-medium">{m.species}</span>
                {i < side.leads && <Badge className="border-line text-muted">Sale</Badge>}
                {m.mega && <Badge className="border-accent/40 bg-accent/10">Mega</Badge>}
                {m.tera && <Badge className="border-accent/40 bg-accent/10">Tera {m.tera}</Badge>}
              </span>
              <span className="block truncate text-xs text-muted" title={m.moves.map(([n, x]) => `${n} ×${x}`).join(', ')}>
                {m.moves.map(([n, x]) => `${n}${x > 1 ? ` ×${x}` : ''}`).join(' · ') || 'Sin usar movimientos'}
              </span>
            </span>
            <span className="num text-right text-xs whitespace-nowrap text-muted">
              <span className={cx('block', m.kos > 0 && 'font-semibold text-fg')}>{m.kos} KO</span>
              <span title="Daño hecho al rival, en % de sus PS">{m.dealt} % daño</span>
            </span>
            <span className={cx('num w-14 text-right text-xs whitespace-nowrap', m.fainted !== null ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400')}>{m.fainted !== null ? `cae T${m.fainted}` : `${m.hp} %`}</span>
          </li>
        ))}
      </ul>
      {luck.length > 0 && <p className="mt-2 text-xs text-muted">{luck.join(' · ')}</p>}
    </div>
  )
}

function Log({ game }: { game: ReplayGame }) {
  if (!game.log) return <p className="border-t border-line px-4 py-3 text-sm text-muted">El turno a turno no se guarda en la copia sin conexión: aparecerá al recuperar la red.</p>
  return (
    <ol className="scrollbar-thin max-h-[420px] space-y-3 overflow-y-auto border-t border-line px-4 py-3" tabIndex={0} aria-label="Turno a turno">
      {game.log.map((t) => (
        <li key={t.n}>
          <div className="eyebrow mb-1">{t.n === 0 ? 'Salida' : `Turno ${t.n}`}</div>
          <ul className="space-y-0.5 text-sm">
            {t.e.map((x, i) => (
              <li key={i} className={cx('flex gap-2 border-l-2 pl-2', x[0] === '1' ? 'border-sky-500' : x[0] === '2' ? 'border-rose-500' : 'border-line-strong text-muted')}>
                <span className="sr-only">{x[0] === '1' ? 'Yo:' : x[0] === '2' ? 'Rival:' : ''}</span>
                {x.slice(1).startsWith('Cae ') ? <Skull className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden /> : null}
                <span className="min-w-0 break-words">{x.slice(1)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

function TeamSheet({ title, mons, games, side }: { title: string; mons: ReplayMon[]; games: ReplayGame[]; side: 'mine' | 'rival' }) {
  return (
    <section className="rounded-xl border border-line">
      <h3 className="border-b border-line px-4 py-2.5 text-sm font-semibold">{side === 'mine' ? 'Mi equipo' : `Equipo de ${title}`}</h3>
      <ul className="divide-y divide-line">
        {mons.map((m) => {
          const n = games.filter((g) => g[side].brought.includes(m.species)).length
          return (
            <li key={m.species} className="flex items-start gap-3 px-4 py-2">
              <SpeciesSprite species={m.species} size={40} className={cx(n === 0 && 'opacity-50')} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">
                    {m.species}
                    {m.item && <span className="font-normal text-muted"> @ {m.item}</span>}
                  </span>
                  <span className="num text-xs whitespace-nowrap text-muted">{games.length > 1 ? `${n}/${games.length}` : n ? 'llevado' : ''}</span>
                </div>
                <p className="text-xs text-muted">
                  {[m.ability, m.nature && natureLabel(m.nature), m.tera && `Tera ${m.tera}`].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs">{m.moves.join(' · ')}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// -------------------------------------------------------------- statistics
const Icons = ({ species, size = 30 }: { species: string[]; size?: number }) => (
  <span className="inline-flex shrink-0 -space-x-1.5" title={species.join(' + ')}>
    {species.map((s) => (
      <SpeciesSprite key={s} species={s} size={size} />
    ))}
  </span>
)

function Combos({ title, list, empty, withNames = true }: { title: string; list: Combo[]; empty: string; withNames?: boolean }) {
  const [all, setAll] = useState(false)
  return (
    <Card title={title}>
      {list.slice(0, all ? 40 : 6).map((c) => (
        <WinBar
          key={c.species.join()}
          tally={c.tally}
          label={
            <>
              <Icons species={c.species} />
              {withNames && <span className="truncate">{c.species.join(' + ')}</span>}
            </>
          }
        />
      ))}
      {!list.length && <p className="text-sm text-muted">{empty}</p>}
      {list.length > 6 && (
        <button type="button" className="mt-1 min-h-9 text-sm font-medium text-accent hover:underline" onClick={() => setAll(!all)}>
          {all ? 'Ver menos' : `Ver las ${list.length}`}
        </button>
      )}
    </Card>
  )
}

export function ReplayStatsSection({ matches }: { matches: PokemonMatch[] }) {
  const s = useMemo(() => replayStats(matches), [matches])
  const [side, setSide] = useState<'mine' | 'rival'>('mine')
  const n = played(s.games)
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Partida a partida (repeticiones)</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Partidas" value={fmtRate(winRate(s.games))} hint={`${recordText(s.games)} · ${n} con repetición`} icon={<Swords className="size-4" />} />
        {s.byNumber.map((t, i) => (
          <Stat key={i} label={`Partida ${i + 1} del BO3`} value={fmtRate(winRate(t))} hint={played(t) ? recordText(t) : 'Sin datos'} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Combos title="Mis salidas" list={s.myLeads} empty="Sin datos." />
        <Combos title="Mis cuatro elegidos" list={s.picks} empty="Aún no hay partidas en las que se vieran los cuatro." withNames={false} />
        <Combos title="Contra cada salida rival" list={s.rivalLeads} empty="Sin datos." />
      </div>
      <Card className="mt-3" title="Por Pokémon" bodyClass="p-0" action={<Segmented value={side} onChange={setSide} options={[{ value: 'mine', label: 'Míos' }, { value: 'rival', label: 'Rivales' }]} />}>
        <div className="scrollbar-thin overflow-x-auto" tabIndex={0} role="region" aria-label="Estadísticas por Pokémon">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 text-left font-medium">Pokémon</th>
                {(side === 'mine' ? ['Llevado', 'Sale', 'Winrate', 'KO', 'Cae', 'Daño/partida', 'Mega'] : ['En el equipo', 'Lo lleva', 'Sale', 'Mi winrate']).map((h) => (
                  <th key={h} className="px-2 py-2 text-right font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="num divide-y divide-line">
              {side === 'mine'
                ? s.mine.map((m) => (
                    <tr key={m.species}>
                      <Name species={m.species} />
                      <Td>{`${played(m.tally)} (${fmtRate((played(m.tally) / n) * 100)})`}</Td>
                      <Td>{m.leads}</Td>
                      <Td strong>{`${fmtRate(winRate(m.tally))} · ${recordText(m.tally)}`}</Td>
                      <Td>{m.kos}</Td>
                      <Td>{m.faints}</Td>
                      <Td>{`${Math.round(m.dealt / played(m.tally))} %`}</Td>
                      <Td>{m.megas || '—'}</Td>
                    </tr>
                  ))
                : s.rival.map((m) => (
                    <tr key={m.species}>
                      <Name species={m.species} />
                      <Td>{m.seen}</Td>
                      <Td>{`${played(m.tally)} (${fmtRate((played(m.tally) / m.seen) * 100)})`}</Td>
                      <Td>{m.leads}</Td>
                      <Td strong>{played(m.tally) ? `${fmtRate(winRate(m.tally))} · ${recordText(m.tally)}` : '—'}</Td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-2 text-xs text-muted">El daño se mide en % de los PS del rival. Media de {s.turns.toLocaleString('es-ES', { maximumFractionDigits: 1 })} turnos por partida.</p>
    </section>
  )
}

const Name = ({ species }: { species: string }) => (
  <th className="px-4 py-1.5 text-left font-medium">
    <span className="flex items-center gap-2 whitespace-nowrap">
      <SpeciesSprite species={species} size={32} /> {species}
    </span>
  </th>
)
const Td = ({ children, strong }: { children: ReactNode; strong?: boolean }) => <td className={cx('px-2 py-1.5 text-right whitespace-nowrap', strong && 'font-semibold')}>{children}</td>
