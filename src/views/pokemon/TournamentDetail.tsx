import { useMemo, useState } from 'react'
import { ArrowLeft, Calculator as CalcIcon, Copy, Flag, Pencil, Plus, Trash2, Trophy } from 'lucide-react'
import { Badge, Button, Card, Empty, Field, Modal, Stat, cx } from '../../components/ui'
import { fromDateKey } from '../../lib/dates'
import { capitalize, fmtDate } from '../../lib/format'
import { asymmetricCap, CATEGORY_LABELS, bracketOf, cpForPlacement, cutRoundLabel, eventKind, placementLabel, structureFor } from '../../lib/pokemon/structure'
import { type SimConfig } from '../../lib/pokemon/simulate'
import { recordText, roundFormat, swissRecord } from '../../lib/pokemon/stats'
import type { MatchFormat, RoundPhase, Tournament, TournamentRound } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'
import type { CalcSeed } from './Calculator'
import { ChancesCard, RivalsCard } from './Rivals'
import { RoundModal } from './RoundModal'
import { RoundTimer } from './RoundTimer'
import { CUT_SIZES, PlacementFields, TopCutFormatQuestion, TournamentForm } from './TournamentForm'
import { OwnIcons, STATUS_LABELS } from './Tournaments'
import { DeckIcons, FORMAT_LABEL, RESULT_STYLES, SpeciesSprite } from './parts'

/** Simulator settings that match a tournament. */
export function simFor(t: Tournament): SimConfig | null {
  if (!t.players || !t.swiss_rounds) return null
  const official = structureFor(t.game, eventKind(t.category, t.mode), t.players)
  return {
    players: t.players,
    rounds: t.swiss_rounds,
    tieRate: t.game === 'tcg' && t.swiss_format === 'bo3' ? 0.02 : 0,
    drops: [],
    dropRate: 0,
    phase: official?.phase && official.swiss === t.swiss_rounds ? official.phase : null,
    topCut: t.has_top_cut ? (t.top_cut_size ?? 0) : 0,
    topCutType: t.top_cut_type,
    cap: asymmetricCap(t.game),
  }
}

export function TournamentDetail({ tournament: t, onBack, onCalculator }: { tournament: Tournament; onBack: () => void; onCalculator: (s: CalcSeed) => void }) {
  const { data, update, remove, create } = useData()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [round, setRound] = useState<{ phase: RoundPhase; number: number; row: TournamentRound | null } | null>(null)
  const [askCut, setAskCut] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const rounds = useMemo(
    () => data.tournament_rounds.filter((r) => r.tournament_id === t.id).sort((a, b) => a.phase.localeCompare(b.phase) || a.number - b.number || a.created_at.localeCompare(b.created_at)),
    [data.tournament_rounds, t.id],
  )
  const swiss = rounds.filter((r) => r.phase === 'swiss')
  const cut = rounds.filter((r) => r.phase === 'top_cut')
  const rec = useMemo(() => swissRecord(rounds), [rounds])
  const deck = data.tcg_decks.find((d) => d.id === t.deck_id) ?? null
  const team = data.vgc_teams.find((d) => d.id === t.team_id) ?? null
  const swissDone = t.swiss_rounds !== null && swiss.length >= t.swiss_rounds
  const eliminated = cut.some((r) => r.result === 'loss')

  const cfg = useMemo(() => simFor(t), [t])
  const next = (list: TournamentRound[]) => list.reduce((a, r) => Math.max(a, r.number), 0) + 1

  function addRound(phase: RoundPhase) {
    if (phase === 'top_cut' && (!t.has_top_cut || !t.top_cut_format || !t.made_top_cut)) {
      setAskCut(true)
      return
    }
    setRound({ phase, number: next(phase === 'swiss' ? swiss : cut), row: null })
  }

  async function duplicate() {
    const { id: _i, user_id: _u, created_at: _c, ...rest } = t
    await create('tournaments', { ...rest, name: `${t.name} (copia)`.slice(0, 160), status: 'planned', placement_bracket: null, placement: null, cp: null, made_top_cut: false })
    toast('success', 'Torneo duplicado')
    onBack()
  }

  const roundRow = (r: TournamentRound) => {
    const f = roundFormat(t, r)
    const st = RESULT_STYLES[r.result]
    return (
      <li key={r.id}>
        <button type="button" onClick={() => setRound({ phase: r.phase, number: r.number, row: r })} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-surface-2">
          <span className="num w-10 shrink-0 text-xs text-muted">{r.phase === 'swiss' ? `R${r.number}` : ''}</span>
          <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg border text-sm font-bold', st.cls)} title={st.label}>
            {st.short}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {r.phase === 'top_cut' && <span className="text-sm font-semibold">{cutRoundLabel(t.top_cut_size, r.number)}</span>}
              {r.result === 'bye' ? (
                <span className="text-sm text-muted">Bye</span>
              ) : t.game === 'tcg' ? (
                <>
                  <DeckIcons icons={r.opponent_icons} size={30} label={r.opponent_deck_name || 'Mazo sin identificar'} />
                  <span className="truncate text-xs text-muted">{r.opponent_deck_name}</span>
                </>
              ) : (
                <span className="flex -space-x-1.5">
                  {r.opponent_pokemon.filter((p) => p.species).map((p, i) => (
                    <SpeciesSprite key={i} species={p.species} size={32} label={[p.species, p.item].filter(Boolean).join(' @ ')} />
                  ))}
                  {!r.opponent_pokemon.length && <span className="text-xs text-muted">Sin Pokémon registrados</span>}
                </span>
              )}
            </span>
            {r.opponent_name && <span className="block truncate text-xs text-muted">vs. {r.opponent_name}</span>}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted">
            <span className="num">
              {FORMAT_LABEL[f]}
              {r.games.length > 0 && f === 'bo3' && ` · ${r.games.filter((g) => g.result === 'win').length}-${r.games.filter((g) => g.result === 'loss').length}`}
            </span>
            {t.game === 'tcg' && r.result !== 'bye' && (
              <span>
                {r.went_first === null ? '' : r.went_first ? '1.º' : '2.º'}
                {r.won_dice !== null && (r.went_first !== null ? ' · ' : '')}
                {r.won_dice !== null && (r.won_dice ? 'dado ✓' : 'dado ✗')}
              </span>
            )}
          </span>
        </button>
      </li>
    )
  }

  return (
    <>
      <button type="button" onClick={onBack} className="mb-3 inline-flex min-h-9 items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Torneos
      </button>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="border-line-strong text-fg">{t.game.toUpperCase()}</Badge>
            <Badge className={STATUS_LABELS[t.status].cls}>{STATUS_LABELS[t.status].label}</Badge>
            <span className="text-xs text-muted">
              {CATEGORY_LABELS[t.category]} · {t.format}
            </span>
          </div>
          <h2 className="mt-1.5 text-lg font-semibold break-words sm:text-xl">{t.name}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {capitalize(fmtDate(fromDateKey(t.date), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · {t.mode === 'online' ? 'Online' : t.location || 'Presencial'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <OwnIcons deck={deck} team={team} size={34} />
            <span className="text-sm">{deck?.name ?? team?.name ?? <span className="text-muted">{t.game === 'tcg' ? 'Sin mazo asignado' : 'Sin equipo asignado'}</span>}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
          <Button size="icon" className="size-9" onClick={() => void duplicate()} aria-label="Duplicar torneo" title="Duplicar">
            <Copy className="size-4" />
          </Button>
          <Button variant="danger" size="icon" className="size-9" onClick={() => setConfirming(true)} aria-label="Eliminar torneo" title="Eliminar">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Suizo" value={rec.rounds ? recordText(rec) : '—'} hint={`${rec.rounds}${t.swiss_rounds ? ` de ${t.swiss_rounds}` : ''} rondas · ${FORMAT_LABEL[t.swiss_format]}`} />
        <Stat label="Puntos" value={rec.points} hint={t.players ? `${t.players} inscritos` : 'Inscritos sin indicar'} />
        <Stat
          label="Top Cut"
          value={t.has_top_cut ? (t.top_cut_format ? FORMAT_LABEL[t.top_cut_format] : '¿BO1 o BO3?') : 'No'}
          hint={t.has_top_cut ? `Top ${t.top_cut_size ?? '—'}${t.top_cut_type === 'asymmetric' ? ' asimétrico' : ''}${t.made_top_cut ? ' · clasificado' : ''}` : 'Solo rondas suizas'}
        />
        <Stat label="Resultado" value={<span className="text-lg sm:text-xl">{placementLabel(t) ?? '—'}</span>} hint={t.cp !== null ? `${t.cp} CP` : 'CP sin registrar'} icon={<Trophy className="size-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card
            title={`Fase suiza · ${FORMAT_LABEL[t.swiss_format]}`}
            bodyClass="p-0"
            action={
              <Button size="sm" variant={swissDone ? 'secondary' : 'primary'} onClick={() => addRound('swiss')}>
                <Plus className="size-3.5" /> Ronda {next(swiss)}
              </Button>
            }
          >
            {swiss.length ? (
              <ul className="divide-y divide-line">{swiss.map(roundRow)}</ul>
            ) : (
              <div className="p-4">
                <Empty>Aún no hay rondas. Añade la primera cuando empiece el torneo.</Empty>
              </div>
            )}
          </Card>

          {swiss.some((r) => r.result !== 'bye') && <RivalsCard tournament={t} rounds={swiss} />}

          {(t.made_top_cut || cut.length > 0) && (
            <Card
              title={`Top Cut · ${t.top_cut_format ? FORMAT_LABEL[t.top_cut_format] : 'formato sin definir'}`}
              bodyClass="p-0"
              action={
                !eliminated && (
                  <Button size="sm" variant="primary" onClick={() => addRound('top_cut')}>
                    <Plus className="size-3.5" /> {cutRoundLabel(t.top_cut_size, next(cut))}
                  </Button>
                )
              }
            >
              {cut.length ? (
                <ul className="divide-y divide-line">{cut.map(roundRow)}</ul>
              ) : (
                <div className="p-4">
                  <Empty>¡Clasificado! Registra aquí las eliminatorias.</Empty>
                </div>
              )}
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            {!t.made_top_cut && swiss.length > 0 && (
              <Button onClick={() => setAskCut(true)}>
                <Trophy className="size-4" /> He pasado a Top Cut
              </Button>
            )}
            {t.status !== 'finished' && rounds.length > 0 && (
              <Button onClick={() => setFinishing(true)}>
                <Flag className="size-4" /> Finalizar torneo
              </Button>
            )}
          </div>
          {t.notes && (
            <Card title="Notas">
              <p className="text-sm whitespace-pre-wrap">{t.notes}</p>
            </Card>
          )}
        </div>

        <aside className="min-w-0">
          {(t.status === 'in_progress' || t.status === 'planned') && <RoundTimer id={t.id} format={cut.length || t.made_top_cut ? (t.top_cut_format ?? t.swiss_format) : t.swiss_format} />}
          <Card title="Posibilidades">
            {cfg ? (
              <ChancesCard tournament={t} cfg={cfg} swiss={swiss} cut={cut} />
            ) : (
              <p className="text-sm text-muted">Indica los inscritos y las rondas suizas para calcular tus opciones.</p>
            )}
            {t.players && (
              <Button
                size="sm"
                className="mt-4 w-full"
                onClick={() =>
                  onCalculator({
                    key: `${t.id}-${rounds.length}`,
                    name: t.name,
                    game: t.game,
                    kind: eventKind(t.category, t.mode),
                    players: t.players!,
                    rounds: t.swiss_rounds,
                    topCut: t.has_top_cut ? t.top_cut_size : 0,
                    topCutType: t.top_cut_type,
                    format: t.swiss_format,
                    me: { wins: rec.w, losses: rec.l, ties: rec.t },
                  })
                }
              >
                <CalcIcon className="size-3.5" /> Simular con abandonos
              </Button>
            )}
          </Card>
        </aside>
      </div>

      {editing && <TournamentForm tournament={t} defaultGame={t.game} onClose={() => setEditing(false)} />}
      {round && (
        <RoundModal
          key={round.row?.id ?? `${round.phase}-${round.number}`}
          tournament={t}
          team={team}
          phase={round.phase}
          number={round.number}
          round={round.row}
          onClose={() => setRound(null)}
          onSaved={(again) => {
            if (t.status === 'planned') void update('tournaments', t.id, { status: 'in_progress' })
            setRound(again ? { phase: round.phase, number: round.number + 1, row: null } : null)
          }}
        />
      )}
      {askCut && (
        <TopCutModal
          tournament={t}
          onClose={() => setAskCut(false)}
          onDone={async (patch) => {
            setAskCut(false)
            await update('tournaments', t.id, { ...patch, has_top_cut: true, made_top_cut: true })
            toast('success', `Top Cut a ${FORMAT_LABEL[patch.top_cut_format]}`)
          }}
        />
      )}
      {finishing && <FinishModal tournament={t} onClose={() => setFinishing(false)} />}
      {confirming && (
        <Modal
          open
          onClose={() => setConfirming(false)}
          title="Eliminar torneo"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirming(false)
                  onBack()
                  void remove('tournaments', t.id)
                }}
              >
                <Trash2 className="size-4" /> Eliminar
              </Button>
            </>
          }
        >
          <p className="text-sm">
            Se eliminará «{t.name}» y sus {rounds.length} rondas. No se puede deshacer.
          </p>
        </Modal>
      )}
    </>
  )
}

function TopCutModal({ tournament: t, onClose, onDone }: { tournament: Tournament; onClose: () => void; onDone: (p: { top_cut_format: MatchFormat; top_cut_size: number }) => void }) {
  const [format, setFormat] = useState<MatchFormat | null>(t.top_cut_format)
  const [size, setSize] = useState(t.top_cut_size ?? 8)
  return (
    <Modal
      open
      onClose={onClose}
      title="Avanzar a Top Cut"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!format} onClick={() => format && onDone({ top_cut_format: format, top_cut_size: size })}>
            Continuar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TopCutFormatQuestion value={format} onChange={setFormat} swiss={t.swiss_format} category={t.category} />
        <Field label="Tamaño del Top Cut">
          <select className="field" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {CUT_SIZES.map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

function FinishModal({ tournament: t, onClose }: { tournament: Tournament; onClose: () => void }) {
  const { update } = useData()
  const [placement, setPlacement] = useState(t.placement?.toString() ?? '')
  const [bracket, setBracket] = useState(t.placement_bracket ?? (t.placement ? bracketOf(t.placement) : null))
  const [cp, setCp] = useState(t.cp?.toString() ?? '')
  const [dropped, setDropped] = useState(t.status === 'dropped')
  const place = Number(placement) > 0 ? Math.floor(Number(placement)) : null
  const range = cpForPlacement(t.category, bracket, place, t.players)
  const auto = range && range.min === range.max ? range.min : null
  return (
    <Modal
      open
      onClose={onClose}
      title="Finalizar torneo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose()
              const points = cp.trim() === '' ? auto : Math.max(0, Math.floor(Number(cp) || 0))
              void update('tournaments', t.id, { status: dropped ? 'dropped' : 'finished', placement_bracket: bracket, placement: place, cp: points })
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <PlacementFields
          bracket={bracket}
          position={placement}
          onChange={(b, p) => {
            setBracket(b)
            setPlacement(p)
          }}
        />
        <Field label="CP">
          <input className="field num" inputMode="numeric" value={cp} onChange={(e) => setCp(e.target.value)} placeholder={auto === null ? '—' : String(auto)} />
        </Field>
        {range && range.min !== range.max && (
          <p className="text-xs text-muted">
            Ese puesto abarca entre {range.min} y {range.max} CP: indica la posición exacta para calcularlos.
          </p>
        )}
        {auto !== null && <p className="text-xs text-muted">Según la tabla 2027 y {t.players} inscritos corresponden {auto} CP. Si lo dejas vacío se guarda ese valor.</p>}
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={dropped} onChange={(e) => setDropped(e.target.checked)} /> Abandoné antes de terminar
        </label>
      </div>
    </Modal>
  )
}

