import { useMemo, useState } from 'react'
import { CalendarDays, Globe, MapPin, Plus, Trophy, Users } from 'lucide-react'
import { Badge, Button, Empty, cx } from '../../components/ui'
import { fromDateKey } from '../../lib/dates'
import { fmtDate } from '../../lib/format'
import { recordText, swissRecord } from '../../lib/pokemon/stats'
import { CATEGORY_LABELS, placementLabel } from '../../lib/pokemon/structure'
import { parseTeam } from '../../lib/pokemon/team'
import type { PokemonGame, TcgDeck, Tournament, TournamentStatus, VgcTeam } from '../../lib/types'
import { useData } from '../../state/data'
import type { CalcSeed } from './Calculator'
import { TournamentDetail } from './TournamentDetail'
import { TournamentForm } from './TournamentForm'
import { DeckIcons, FORMAT_LABEL, SpeciesSprite } from './parts'

export const STATUS_LABELS: Record<TournamentStatus, { label: string; cls: string }> = {
  planned: { label: 'Próximo', cls: 'border-line-strong text-muted' },
  in_progress: { label: 'En juego', cls: 'border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300' },
  finished: { label: 'Finalizado', cls: 'border-line bg-surface-2 text-muted' },
  dropped: { label: 'Abandonado', cls: 'border-amber-500/30 bg-amber-500/12 text-amber-800 dark:text-amber-300' },
}

export function OwnIcons({ deck, team, size = 32 }: { deck?: TcgDeck | null; team?: VgcTeam | null; size?: number }) {
  const mons = useMemo(() => (team ? parseTeam(team.paste).mons.map((m) => m.species) : []), [team])
  if (deck) return <DeckIcons icons={deck.icons} size={size} label={deck.name} />
  if (team && mons.length)
    return (
      <span className="inline-flex -space-x-2" title={team.name}>
        {mons.map((s) => (
          <SpeciesSprite key={s} species={s} size={size * 0.85} />
        ))}
      </span>
    )
  return null
}

const ORDER: Record<TournamentStatus, number> = { in_progress: 0, planned: 1, finished: 2, dropped: 2 }

export function Tournaments({ game, initialId = null, onCalculator }: { game: PokemonGame; initialId?: string | null; onCalculator: (s: CalcSeed) => void }) {
  const { data } = useData()
  const [editing, setEditing] = useState<Tournament | 'new' | null>(null)
  const [openId, setOpenId] = useState<string | null>(initialId)
  const open = data.tournaments.find((t) => t.id === openId)

  const list = useMemo(
    () =>
      data.tournaments
        .filter((t) => t.game === game)
        .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.status === 'planned' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))),
    [data.tournaments, game],
  )
  const rounds = useMemo(() => {
    const m = new Map<string, typeof data.tournament_rounds>()
    for (const r of data.tournament_rounds) m.set(r.tournament_id, [...(m.get(r.tournament_id) ?? []), r])
    return m
  }, [data.tournament_rounds])
  const totalCp = list.reduce((a, t) => a + (t.cp ?? 0), 0)

  if (open) return <TournamentDetail tournament={open} onBack={() => setOpenId(null)} onCalculator={onCalculator} />

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {list.length} {list.length === 1 ? 'torneo' : 'torneos'}
          {totalCp > 0 && (
            <>
              {' '}
              · <span className="num font-semibold text-fg">{totalCp}</span> CP
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Nuevo torneo
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty icon={<Trophy className="size-6 text-faint" />}>
          <p>Aún no hay torneos de {game.toUpperCase()}.</p>
          <Button className="mt-1" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Registrar el primero
          </Button>
        </Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((t) => {
            const rs = rounds.get(t.id) ?? []
            const swiss = swissRecord(rs)
            const cut = rs.filter((r) => r.phase === 'top_cut')
            return (
              <li key={t.id} className="min-w-0">
                <button type="button" onClick={() => setOpenId(t.id)} className="card flex w-full items-start gap-3 p-4 text-left transition hover:border-line-strong">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={STATUS_LABELS[t.status].cls}>{STATUS_LABELS[t.status].label}</Badge>
                      {t.made_top_cut && <Badge className="border-accent/30 bg-accent/10 text-fg">Top Cut</Badge>}
                    </div>
                    <div className="mt-2 font-semibold break-words">{t.name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" /> {fmtDate(fromDateKey(t.date), { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {t.mode === 'online' ? <Globe className="size-3.5" /> : <MapPin className="size-3.5" />}
                        {t.mode === 'online' ? 'Online' : t.location || 'Presencial'}
                      </span>
                      <span>{CATEGORY_LABELS[t.category]}</span>
                      {t.players && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" /> {t.players}
                        </span>
                      )}
                      <span>
                        Suizo {FORMAT_LABEL[t.swiss_format]}
                        {t.has_top_cut && ` · Top Cut ${t.top_cut_format ? FORMAT_LABEL[t.top_cut_format] : 'sin definir'}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <OwnIcons deck={data.tcg_decks.find((d) => d.id === t.deck_id)} team={data.vgc_teams.find((x) => x.id === t.team_id)} />
                    {swiss.rounds > 0 && (
                      <span className="num text-lg font-semibold">
                        {recordText(swiss)}
                        {cut.length > 0 && <span className="text-sm text-muted"> +{cut.filter((r) => r.result === 'win' || r.result === 'bye').length}</span>}
                      </span>
                    )}
                    <span className={cx('text-right text-xs text-muted', !placementLabel(t) && !t.cp && 'hidden')}>
                      {placementLabel(t)}
                      {placementLabel(t) && t.cp ? ' · ' : ''}
                      {t.cp ? `${t.cp} CP` : ''}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <TournamentForm
          tournament={editing === 'new' ? null : editing}
          defaultGame={game}
          onClose={() => setEditing(null)}
          onCreated={(id) => setOpenId(id)}
        />
      )}
    </>
  )
}
