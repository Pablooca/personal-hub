import { useState } from 'react'
import { Wand2 } from 'lucide-react'
import { Button, Field, Modal, cx } from '../../components/ui'
import { toDateKey } from '../../lib/dates'
import { uid } from '../../lib/format'
import { CATEGORY_LABELS, MIN_PLAYERS, cpFor, eventKind, structureFor } from '../../lib/pokemon/structure'
import { TOURNAMENT_CATEGORIES, TOURNAMENT_STATUSES, type MatchFormat, type PokemonGame, type Tournament, type TournamentCategory } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'
import { META } from './data'
import { Choice } from './parts'
import { STATUS_LABELS } from './Tournaments'

export const CUT_SIZES = [2, 4, 6, 8, 16, 32, 64]
const CHAMPIONSHIP = new Set<TournamentCategory>(['league_challenge', 'league_cup', 'regional', 'special', 'international', 'worlds'])
const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Math.max(0, Math.floor(Number(s))))

/** The explicit BO1/BO3 question for the top cut. Never pre-answered. */
export function TopCutFormatQuestion({ value, onChange, swiss, category, invalid }: { value: MatchFormat | null; onChange: (v: MatchFormat) => void; swiss: MatchFormat; category: TournamentCategory; invalid?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">
        ¿A qué formato se juega el Top Cut? <span className="text-rose-700 dark:text-rose-400">*</span>
      </p>
      <Choice<MatchFormat>
        label="Formato del Top Cut"
        value={value}
        onChange={onChange}
        invalid={invalid}
        options={[
          { value: 'bo1', label: 'BO1', hint: 'Una partida' },
          { value: 'bo3', label: 'BO3', hint: 'Al mejor de tres' },
        ]}
      />
      <p className="mt-2 text-xs text-muted">
        {CHAMPIONSHIP.has(category)
          ? 'El reglamento de Play! Pokémon exige BO3 en la fase eliminatoria de los eventos oficiales.'
          : swiss === 'bo1'
            ? 'Lo habitual online: suizas a BO1 y Top Cut a BO3. Confírmalo con la organización.'
            : 'Confírmalo con la organización antes de empezar.'}
      </p>
    </div>
  )
}

export function TournamentForm({ tournament, defaultGame, onClose, onCreated }: { tournament: Tournament | null; defaultGame: PokemonGame; onClose: () => void; onCreated?: (id: string) => void }) {
  const { data, create, update } = useData()
  const toast = useToast()
  const [f, setF] = useState(() => ({
    game: tournament?.game ?? defaultGame,
    name: tournament?.name ?? '',
    date: tournament?.date ?? toDateKey(new Date()),
    mode: tournament?.mode ?? ('in_person' as Tournament['mode']),
    location: tournament?.location ?? '',
    category: tournament?.category ?? ('league_cup' as TournamentCategory),
    format: tournament?.format ?? (defaultGame === 'tcg' ? META.format : 'Regulación M-C'),
    players: tournament?.players?.toString() ?? '',
    swiss_rounds: tournament?.swiss_rounds?.toString() ?? '',
    swiss_format: tournament?.swiss_format ?? ('bo3' as MatchFormat),
    has_top_cut: tournament?.has_top_cut ?? false,
    top_cut_type: tournament?.top_cut_type ?? ('standard' as Tournament['top_cut_type']),
    top_cut_size: tournament?.top_cut_size?.toString() ?? '8',
    top_cut_format: tournament?.top_cut_format ?? (null as MatchFormat | null),
    deck_id: tournament?.deck_id ?? '',
    team_id: tournament?.team_id ?? '',
    status: tournament?.status ?? ('planned' as Tournament['status']),
    placement: tournament?.placement?.toString() ?? '',
    cp: tournament?.cp?.toString() ?? '',
    notes: tournament?.notes ?? '',
  }))
  const [tried, setTried] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  const players = num(f.players)
  const official = players && players >= MIN_PLAYERS ? structureFor(f.game, eventKind(f.category, f.mode), players) : null
  const suggestedCp = cpFor(f.category, num(f.placement), players)
  const needsFormat = f.has_top_cut && !f.top_cut_format

  function setMode(mode: Tournament['mode']) {
    setF((x) => ({
      ...x,
      mode,
      category: mode === 'online' ? 'online' : x.category === 'online' ? 'league_cup' : x.category,
      swiss_format: tournament ? x.swiss_format : mode === 'online' ? 'bo1' : 'bo3',
    }))
  }
  function setGame(game: PokemonGame) {
    setF((x) => ({ ...x, game, format: x.format === META.format || /^Regulaci/.test(x.format) ? (game === 'tcg' ? META.format : 'Regulación M-C') : x.format }))
  }
  function applyOfficial() {
    if (!official) return
    setF((x) => ({
      ...x,
      swiss_rounds: String(official.swiss),
      has_top_cut: official.topCut > 0,
      top_cut_size: official.topCut ? String(official.topCut) : x.top_cut_size,
      top_cut_type: official.topCutType,
    }))
  }

  async function save() {
    setTried(true)
    if (!f.name.trim()) return toast('error', 'Ponle un nombre al torneo.')
    if (needsFormat) return toast('error', 'Indica si el Top Cut se juega a BO1 o a BO3.')
    const row = {
      game: f.game,
      name: f.name.trim(),
      date: f.date,
      mode: f.mode,
      location: f.mode === 'in_person' ? f.location.trim() : '',
      category: f.category,
      format: f.format.trim(),
      players: players && players >= 2 ? players : null,
      swiss_rounds: num(f.swiss_rounds) || null,
      swiss_format: f.swiss_format,
      has_top_cut: f.has_top_cut,
      top_cut_type: f.top_cut_type,
      top_cut_size: f.has_top_cut ? num(f.top_cut_size) : null,
      top_cut_format: f.has_top_cut ? f.top_cut_format : null,
      made_top_cut: f.has_top_cut ? (tournament?.made_top_cut ?? false) : false,
      deck_id: f.game === 'tcg' && f.deck_id ? f.deck_id : null,
      team_id: f.game === 'vgc' && f.team_id ? f.team_id : null,
      status: f.status,
      placement: num(f.placement) || null,
      cp: num(f.cp),
      notes: f.notes,
    }
    onClose()
    if (tournament) await update('tournaments', tournament.id, row)
    else {
      const id = uid()
      const saved = create('tournaments', { ...row, id })
      onCreated?.(id)
      await saved
    }
  }

  return (
    <Modal
      open
      full
      onClose={onClose}
      title={tournament ? 'Editar torneo' : 'Nuevo torneo'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="label">Juego</span>
              <Choice<PokemonGame> label="Juego" value={f.game} onChange={setGame} options={[{ value: 'tcg', label: 'TCG' }, { value: 'vgc', label: 'VGC' }]} />
            </div>
            <div>
              <span className="label">Modalidad</span>
              <Choice<Tournament['mode']> label="Modalidad" value={f.mode} onChange={setMode} options={[{ value: 'in_person', label: 'Presencial' }, { value: 'online', label: 'Online' }]} />
            </div>
          </div>
          <Field label="Nombre">
            <input className={cx('field', tried && !f.name.trim() && 'border-rose-500')} value={f.name} maxLength={160} onChange={(e) => set('name', e.target.value)} placeholder="League Cup Sevilla, Limitless Weekly…" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fecha">
              <input type="date" className="field num" value={f.date} onChange={(e) => e.target.value && set('date', e.target.value)} />
            </Field>
            <Field label="Categoría">
              <select className="field" value={f.category} onChange={(e) => set('category', e.target.value as TournamentCategory)}>
                {TOURNAMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
            {f.mode === 'in_person' && (
              <Field label="Lugar">
                <input className="field" value={f.location} maxLength={120} onChange={(e) => set('location', e.target.value)} placeholder="Tienda o ciudad" />
              </Field>
            )}
            <Field label={f.game === 'tcg' ? 'Formato' : 'Regulación'}>
              <input className="field" value={f.format} maxLength={60} onChange={(e) => set('format', e.target.value)} />
            </Field>
            <Field label={f.game === 'tcg' ? 'Mi mazo' : 'Mi equipo'}>
              {f.game === 'tcg' ? (
                <select className="field" value={f.deck_id} onChange={(e) => set('deck_id', e.target.value)}>
                  <option value="">Sin elegir</option>
                  {data.tcg_decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select className="field" value={f.team_id} onChange={(e) => set('team_id', e.target.value)}>
                  <option value="">Sin elegir</option>
                  {data.vgc_teams.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Estado">
              <select className="field" value={f.status} onChange={(e) => set('status', e.target.value as Tournament['status'])}>
                {TOURNAMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Puesto final">
              <input className="field num" inputMode="numeric" value={f.placement} onChange={(e) => set('placement', e.target.value)} placeholder="—" />
            </Field>
            <Field label="CP obtenidos">
              <input className="field num" inputMode="numeric" value={f.cp} onChange={(e) => set('cp', e.target.value)} placeholder="—" />
            </Field>
          </div>
          {suggestedCp !== null && String(suggestedCp) !== f.cp.trim() && (
            <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => set('cp', String(suggestedCp))}>
              Según la tabla de la temporada 2027: {suggestedCp} CP. Aplicar
            </button>
          )}
          <Field label="Notas">
            <textarea className="field min-h-20" value={f.notes} maxLength={5000} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>

        <div className="space-y-4 lg:border-l lg:border-line lg:pl-6">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inscritos">
              <input className="field num" inputMode="numeric" value={f.players} onChange={(e) => set('players', e.target.value)} placeholder="N" />
            </Field>
            <Field label="Rondas suizas">
              <input className="field num" inputMode="numeric" value={f.swiss_rounds} onChange={(e) => set('swiss_rounds', e.target.value)} placeholder="—" />
            </Field>
          </div>
          {official && (
            <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
              <div className="text-xs text-muted">{official.variant}</div>
              <div className="mt-0.5">
                <span className="num font-semibold">{official.swiss}</span> rondas suizas ·{' '}
                {official.topCut ? (
                  <>
                    Top <span className="num font-semibold">{official.topCut}</span>
                    {official.topCutType === 'asymmetric' && ' asimétrico'}
                  </>
                ) : (
                  'sin Top Cut'
                )}
                {official.phase && ` · Día 2 con ${official.phase.threshold} puntos tras ${official.phase.rounds} rondas`}
              </div>
              <Button type="button" size="sm" className="mt-2" onClick={applyOfficial}>
                <Wand2 className="size-3.5" /> Usar esta estructura
              </Button>
            </div>
          )}
          <div>
            <span className="label">Formato de las rondas suizas</span>
            <Choice<MatchFormat> label="Formato de las rondas suizas" value={f.swiss_format} onChange={(v) => set('swiss_format', v)} options={[{ value: 'bo1', label: 'BO1' }, { value: 'bo3', label: 'BO3' }]} />
          </div>
          <div>
            <span className="label">¿Hay Top Cut?</span>
            <Choice<'yes' | 'no'> label="¿Hay Top Cut?" value={f.has_top_cut ? 'yes' : 'no'} onChange={(v) => set('has_top_cut', v === 'yes')} options={[{ value: 'no', label: 'Solo suizo' }, { value: 'yes', label: 'Suizo + Top Cut' }]} />
          </div>
          {f.has_top_cut && (
            <div className="space-y-4 rounded-lg border border-line p-3">
              <TopCutFormatQuestion value={f.top_cut_format} onChange={(v) => set('top_cut_format', v)} swiss={f.swiss_format} category={f.category} invalid={tried && needsFormat} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tamaño">
                  <select className="field" value={f.top_cut_size} onChange={(e) => set('top_cut_size', e.target.value)}>
                    {CUT_SIZES.map((n) => (
                      <option key={n} value={n}>
                        Top {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tipo">
                  <select className="field" value={f.top_cut_type} onChange={(e) => set('top_cut_type', e.target.value as Tournament['top_cut_type'])}>
                    <option value="standard">Estándar</option>
                    <option value="asymmetric">Asimétrico</option>
                  </select>
                </Field>
              </div>
            </div>
          )}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
