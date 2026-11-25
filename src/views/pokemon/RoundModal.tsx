import { useMemo, useState } from 'react'
import { Plus, Search, Trash2, X } from 'lucide-react'
import { Button, Field, Modal, cx } from '../../components/ui'
import { cutRoundLabel } from '../../lib/pokemon/structure'
import { decided, maxGames, resultFromGames, rivalKey } from '../../lib/pokemon/stats'
import { NATURES, natureLabel, parseTeam } from '../../lib/pokemon/team'
import type { MatchFormat, RivalPokemon, RoundGame, RoundPhase, RoundResult, Tournament, TournamentRound, VgcTeam } from '../../lib/types'
import { useData } from '../../state/data'
import { RivalNote } from './DeckExtras'
import { META, SPECIES, useChampions, type Champions } from './data'
import { Combobox, DeckIcons, FORMAT_LABEL, RESULT_STYLES, SpeciesSprite, SpritePicker } from './parts'

const RESULTS: RoundGame['result'][] = ['win', 'loss', 'tie']

function Toggle<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; cls?: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('min-h-10 flex-1 rounded-lg border px-2.5 text-sm transition', o.value === value ? cx('font-semibold', o.cls ?? 'border-accent bg-accent/10') : 'border-line bg-surface-2 text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function RoundModal({
  tournament: t,
  team,
  phase,
  number,
  round,
  onClose,
  onSaved,
}: {
  tournament: Tournament
  team: VgcTeam | null
  phase: RoundPhase
  number: number
  round: TournamentRound | null
  onClose: () => void
  onSaved: (another: boolean) => void
}) {
  const { create, update, remove } = useData()
  const tcg = t.game === 'tcg'
  const format: MatchFormat = phase === 'top_cut' ? (t.top_cut_format ?? t.swiss_format) : t.swiss_format

  const [games, setGames] = useState<RoundGame[]>(round?.games ?? [])
  const [result, setResult] = useState<RoundResult | null>(round?.result ?? null)
  const [dice, setDice] = useState<boolean | null>(round?.won_dice ?? null)
  const [first, setFirst] = useState<boolean | null>(round?.went_first ?? null)
  const [opponent, setOpponent] = useState(round?.opponent_name ?? '')
  const [rival, setRival] = useState<RivalDeck>({ id: round?.opponent_archetype ?? '', icons: round?.opponent_icons ?? [], name: round?.opponent_deck_name ?? '' })
  const [mons, setMons] = useState<RivalPokemon[]>(round?.opponent_pokemon ?? [])
  const [mine, setMine] = useState<string[]>(round?.my_pokemon ?? [])
  const [notes, setNotes] = useState(round?.notes ?? '')

  const customInvalid = tcg && rival.id === 'other' && rival.icons.length === 0
  const tieInCut = phase === 'top_cut' && result === 'tie'
  const ok = result !== null && !tieInCut && !(customInvalid && result !== 'bye')

  function changeGames(next: RoundGame[]) {
    setGames(next)
    setResult(resultFromGames(next))
  }
  function setGame(i: number, patch: Partial<RoundGame>) {
    const next = games.map((g, j) => (j === i ? { ...g, ...patch } : g))
    if (i === 0 && 'first' in patch) setFirst(patch.first ?? null)
    changeGames(decided(next.slice(0, i + 1), format) ? next.slice(0, i + 1) : next)
  }
  function addGame(r: RoundGame['result']) {
    // Loser of the previous game usually chooses to go first: suggested, always editable.
    const prev = games.at(-1)
    const guess = !tcg ? null : games.length === 0 ? first : prev?.result === 'tie' || prev?.first === null ? null : prev?.result === 'loss'
    changeGames([...games, { result: r, first: guess ?? null }])
  }
  function chooseFirst(v: boolean | null) {
    setFirst(v)
    if (games.length) setGames(games.map((g, i) => (i === 0 ? { ...g, first: v } : g)))
  }

  async function save(another: boolean) {
    if (!ok || result === null) return
    const bye = result === 'bye'
    const row = {
      tournament_id: t.id,
      phase,
      number,
      result,
      games: bye ? [] : games,
      won_dice: bye || !tcg ? null : dice,
      went_first: bye || !tcg ? null : (games[0]?.first ?? first),
      opponent_name: bye ? '' : opponent.trim(),
      opponent_archetype: bye || !tcg ? '' : rival.id,
      opponent_icons: bye || !tcg ? [] : rival.icons,
      opponent_deck_name: bye || !tcg ? '' : rival.name.trim(),
      opponent_pokemon: bye || tcg ? [] : mons.filter((m) => m.species).map((m) => ({ ...m, moves: m.moves.filter(Boolean) })),
      my_pokemon: bye || tcg ? [] : mine,
      notes,
    }
    onSaved(another)
    // The rival's record is kept in its own card: never overwrite it from here.
    if (round) await update('tournament_rounds', round.id, bye ? { ...row, opponent_record: null } : row)
    else await create('tournament_rounds', { ...row, opponent_record: null })
  }

  const title = phase === 'swiss' ? `Ronda ${number}` : cutRoundLabel(t.top_cut_size, number)
  const canAdd = !decided(games, format)

  return (
    <Modal
      open
      full
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {title}
          <span className="num rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted">
            {phase === 'swiss' ? 'Suizo' : 'Top Cut'} {FORMAT_LABEL[format]}
          </span>
        </span>
      }
      footer={
        <>
          {round && (
            <Button
              variant="danger"
              className="mr-auto"
              aria-label="Eliminar ronda"
              onClick={() => {
                onClose()
                void remove('tournament_rounds', round.id)
              }}
            >
              <Trash2 className="size-4" /> <span className="max-sm:sr-only">Eliminar</span>
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {!round && (phase === 'swiss' ? t.swiss_rounds === null || number < t.swiss_rounds : result === 'win') && (
            <Button className="hidden sm:inline-flex" disabled={!ok} onClick={() => void save(true)}>
              Guardar y siguiente
            </Button>
          )}
          <Button variant="primary" disabled={!ok} onClick={() => void save(false)}>
            Guardar
          </Button>
        </>
      }
    >
      <div className={cx('mx-auto grid max-w-6xl grid-cols-1 gap-6', tcg ? 'lg:grid-cols-[360px_minmax(0,1fr)]' : 'lg:grid-cols-[340px_minmax(0,1fr)]')}>
        {/* ------------------------------------------------------------ result */}
        <div className="space-y-5">
          {tcg && result !== 'bye' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="label">Dado</span>
                <Toggle label="Ganador del dado" value={dice === null ? 'x' : dice ? 'y' : 'n'} onChange={(v) => setDice(v === 'x' ? null : v === 'y')} options={[{ value: 'y', label: 'Yo' }, { value: 'n', label: 'Rival' }, { value: 'x', label: '—' }]} />
              </div>
              <div>
                <span className="label">Salgo</span>
                <Toggle label="Orden de salida" value={first === null ? 'x' : first ? 'y' : 'n'} onChange={(v) => chooseFirst(v === 'x' ? null : v === 'y')} options={[{ value: 'y', label: '1.º' }, { value: 'n', label: '2.º' }, { value: 'x', label: '—' }]} />
              </div>
            </div>
          )}

          {result !== 'bye' && (
            <div>
              <span className="label">{format === 'bo1' ? 'Partida' : 'Partidas (al mejor de 3)'}</span>
              <div className="space-y-2">
                {games.map((g, i) => (
                  <div key={i} className="rounded-lg border border-line p-2">
                    <div className="flex items-center gap-2">
                      <span className="num w-5 shrink-0 text-center text-xs text-muted">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <Toggle
                          label={`Resultado de la partida ${i + 1}`}
                          value={g.result}
                          onChange={(v) => setGame(i, { result: v })}
                          options={RESULTS.map((r) => ({ value: r, label: RESULT_STYLES[r].label, cls: RESULT_STYLES[r].cls }))}
                        />
                      </div>
                      <button type="button" aria-label={`Quitar partida ${i + 1}`} className="grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:bg-surface-2 hover:text-fg" onClick={() => changeGames(games.filter((_, j) => j !== i))}>
                        <X className="size-4" />
                      </button>
                    </div>
                    {tcg && format === 'bo3' && (
                      <div className="mt-2 pr-10 pl-7">
                        <Toggle
                          label={`Salida de la partida ${i + 1}`}
                          value={g.first === null ? 'x' : g.first ? 'y' : 'n'}
                          onChange={(v) => setGame(i, { first: v === 'x' ? null : v === 'y' })}
                          options={[{ value: 'y', label: '1.º' }, { value: 'n', label: '2.º' }, { value: 'x', label: 'Salida —' }]}
                        />
                      </div>
                    )}
                  </div>
                ))}
                {canAdd && (
                  <div className="flex gap-1">
                    {RESULTS.map((r) => (
                      <Button key={r} type="button" className="min-h-11 flex-1" onClick={() => addGame(r)}>
                        {maxGames(format) > 1 && <Plus className="size-3.5" />} {RESULT_STYLES[r].label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <span className="label">Resultado de la ronda</span>
            <Toggle<RoundResult | 'none'>
              label="Resultado de la ronda"
              value={result ?? 'none'}
              onChange={(v) => v !== 'none' && setResult(v)}
              options={(['win', 'loss', 'tie', 'bye'] as const)
                .filter((r) => phase === 'swiss' || r !== 'tie')
                .map((r) => ({ value: r, label: RESULT_STYLES[r].label, cls: RESULT_STYLES[r].cls }))}
            />
            <p className="mt-1.5 text-xs text-muted">{tieInCut ? 'En el Top Cut no puede haber empate: añade la partida que falta.' : 'Se calcula con las partidas; cámbialo si hubo empate acordado o abandono.'}</p>
          </div>

          {result !== 'bye' && (
            <Field label="Nombre del rival (opcional)">
              <input className="field" value={opponent} maxLength={120} autoComplete="off" onChange={(e) => setOpponent(e.target.value)} />
            </Field>
          )}
          <Field label="Notas">
            <textarea className="field min-h-20" value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} placeholder="Jugadas clave, errores, side…" />
          </Field>
        </div>

        {/* ---------------------------------------------------------- opponent */}
        {result !== 'bye' && (
          <div className="min-w-0 lg:border-l lg:border-line lg:pl-6">
            {tcg ? (
              <>
                <RivalDeckPicker value={rival} onChange={setRival} invalid={customInvalid} />
                <RivalNote key={`${rival.id}-${rival.icons.join()}-${rival.name}`} deckId={t.deck_id} rival={rival} />
              </>
            ) : <VgcSide mons={mons} setMons={setMons} mine={mine} setMine={setMine} team={team} />}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------ TCG rival deck
export interface RivalDeck {
  id: string
  icons: string[]
  name: string
}

const TOP = 30

export function RivalDeckPicker({ value, onChange, invalid }: { value: RivalDeck; onChange: (v: RivalDeck) => void; invalid: boolean }) {
  const { data } = useData()
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)

  // Custom decks already met, so they are one tap away next time.
  const customs = useMemo(() => {
    const m = new Map<string, RivalDeck>()
    for (const r of data.tournament_rounds) if (r.opponent_archetype === 'other') m.set(rivalKey(r), { id: 'other', icons: r.opponent_icons, name: r.opponent_deck_name })
    return [...m.values()]
  }, [data.tournament_rounds])

  const q = query.trim().toLowerCase()
  const list = META.archetypes.filter((a) => !q || a.name.toLowerCase().includes(q) || a.icons.some((i) => i.includes(q)))
  const shown = q || all ? list : list.slice(0, TOP)
  const key = value.id ? rivalKey({ opponent_archetype: value.id, opponent_icons: value.icons, opponent_deck_name: value.name }) : ''

  const tile = (d: RivalDeck, selected: boolean, k: string) => (
    <button
      key={k}
      type="button"
      aria-pressed={selected}
      aria-label={d.name}
      title={d.name}
      onClick={() => onChange(selected ? { id: '', icons: [], name: '' } : d)}
      className={cx('flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 transition', selected ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 hover:border-line-strong')}
    >
      <DeckIcons icons={d.icons} size={40} label={d.name} />
      <span className="line-clamp-1 w-full text-center text-[10px] leading-tight text-muted">{d.name}</span>
    </button>
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="label mb-0">Mazo del rival · {META.format}</span>
        <label className="relative w-full sm:w-56">
          <span className="sr-only">Buscar arquetipo</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <input className="field pl-8" placeholder="Buscar mazo o Pokémon…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
        {shown.map((a) => tile({ id: a.id, icons: a.icons, name: a.name }, value.id === a.id, a.id))}
        {customs
          .filter((c) => !q || c.name.toLowerCase().includes(q) || c.icons.some((i) => i.includes(q)))
          .map((c) => {
            const k = rivalKey({ opponent_archetype: 'other', opponent_icons: c.icons, opponent_deck_name: c.name })
            return tile({ ...c, name: c.name || 'Personalizado' }, key === k, k)
          })}
        <button
          type="button"
          aria-pressed={value.id === 'other'}
          onClick={() => onChange(value.id === 'other' ? { id: '', icons: [], name: '' } : { id: 'other', icons: [], name: '' })}
          className={cx('flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs font-semibold transition', value.id === 'other' ? 'border-accent bg-accent/10' : 'border-line-strong text-muted hover:text-fg')}
        >
          <Plus className="size-5" /> Otro
        </button>
      </div>

      {!q && list.length > TOP && (
        <button type="button" className="mt-3 min-h-9 text-sm font-medium text-accent hover:underline" onClick={() => setAll((x) => !x)}>
          {all ? 'Ver solo los más jugados' : `Ver los ${list.length} arquetipos`}
        </button>
      )}

      {value.id === 'other' && (
        <div className="mt-4 space-y-3">
          <div>
            <span className="label">Pokémon representativos (1 o 2)</span>
            <SpritePicker value={value.icons} onChange={(icons) => onChange({ ...value, icons })} />
            {invalid && <p className="mt-1.5 text-xs text-amber-800 dark:text-amber-300">Elige al menos un Pokémon para identificar el mazo.</p>}
          </div>
          <Field label="Nombre del mazo (opcional)">
            <input className="field" value={value.name} maxLength={120} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Personalizado" />
          </Field>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ VGC side
const NATURE_OPTIONS = NATURES.map((n) => ({ value: n[0], label: natureLabel(n[0]) }))
const blank = (): RivalPokemon => ({ species: '', item: '', nature: '', moves: ['', '', '', ''] })

function VgcSide({ mons, setMons, mine, setMine, team }: { mons: RivalPokemon[]; setMons: (m: RivalPokemon[]) => void; mine: string[]; setMine: (m: string[]) => void; team: VgcTeam | null }) {
  const champions = useChampions()
  const own = useMemo(() => (team ? parseTeam(team.paste).mons.map((m) => m.species) : []), [team])
  const slots = [...mons, ...(mons.length < 4 ? [blank()] : [])]
  const set = (i: number, p: RivalPokemon) => setMons(i < mons.length ? mons.map((m, j) => (j === i ? p : m)) : [...mons, p])

  const speciesOptions = useMemo(() => {
    const legal = champions ? champions.species : []
    const seen = new Set(legal)
    const rest = SPECIES.filter((s) => !seen.has(s.name)).map((s) => s.name)
    return [...legal, ...rest].map((name) => ({ value: name, label: name, icon: <SpeciesSprite species={name} size={28} /> }))
  }, [champions])

  return (
    <div className="space-y-5">
      <div>
        <span className="label">Mis 4 elegidos</span>
        {own.length ? (
          <div className="flex flex-wrap gap-1.5">
            {own.map((s) => {
              const on = mine.includes(s)
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  aria-label={s}
                  title={s}
                  onClick={() => setMine(on ? mine.filter((x) => x !== s) : mine.length < 4 ? [...mine, s] : mine)}
                  className={cx('grid size-14 place-items-center rounded-lg border transition', on ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 opacity-60 hover:opacity-100')}
                >
                  <SpeciesSprite species={s} size={44} />
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">Asigna un equipo al torneo para marcar qué Pokémon llevaste.</p>
        )}
      </div>

      <div>
        <span className="label">Pokémon del rival (hasta 4)</span>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {slots.map((m, i) => (
            <RivalMon key={i} index={i} mon={m} champions={champions} speciesOptions={speciesOptions} onChange={(p) => set(i, p)} onRemove={i < mons.length ? () => setMons(mons.filter((_, j) => j !== i)) : undefined} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RivalMon({
  index,
  mon,
  champions,
  speciesOptions,
  onChange,
  onRemove,
}: {
  index: number
  mon: RivalPokemon
  champions: Champions | null
  speciesOptions: { value: string; label: string }[]
  onChange: (m: RivalPokemon) => void
  onRemove?: () => void
}) {
  const n = index + 1
  const learn = champions?.get(mon.species)?.moves
  const moveOptions = useMemo(() => (learn?.length ? learn : (champions?.moveList ?? [])).map((m) => ({ value: m, label: m })), [learn, champions])
  const itemOptions = useMemo(() => {
    const items = champions?.itemList ?? []
    // The stone of this species first, then the rest.
    const stones = items.filter((i) => champions?.mega(mon.species, i))
    return [...stones, ...items.filter((i) => !stones.includes(i))].map((i) => ({ value: i, label: i }))
  }, [champions, mon.species])
  const moves = [0, 1, 2, 3].map((i) => mon.moves[i] ?? '')

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-2">
          {mon.species ? <SpeciesSprite species={champions?.mega(mon.species, mon.item) ?? mon.species} size={44} label={mon.species} /> : <span className="num text-sm text-faint">{n}</span>}
        </span>
        <Combobox className="min-w-0 flex-1" label={`Especie del rival ${n}`} placeholder="Pokémon…" value={mon.species} options={speciesOptions} onChange={(species) => onChange({ ...mon, species })} />
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Quitar Pokémon ${n}`} className="grid size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-surface-2 hover:text-fg">
            <X className="size-4" />
          </button>
        )}
      </div>
      {mon.species && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Combobox label={`Objeto del rival ${n}`} placeholder="Objeto" value={mon.item} options={itemOptions} free onChange={(item) => onChange({ ...mon, item })} />
          <select className="field" aria-label={`Naturaleza del rival ${n}`} value={mon.nature} onChange={(e) => onChange({ ...mon, nature: e.target.value })}>
            <option value="">Naturaleza</option>
            {NATURE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {moves.map((mv, i) => (
            <Combobox
              key={i}
              label={`Movimiento ${i + 1} del rival ${n}`}
              placeholder={`Movimiento ${i + 1}`}
              value={mv}
              options={moveOptions.filter((o) => o.value === mv || !moves.includes(o.value))}
              free
              onChange={(v) => onChange({ ...mon, moves: moves.map((x, j) => (j === i ? v : x)) })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

