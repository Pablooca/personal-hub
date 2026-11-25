import { useEffect, useMemo, useRef, useState } from 'react'
import { Link2, Loader2, Plus, RefreshCw, Trash2, Unlink } from 'lucide-react'
import { Button, Field, Modal, cx } from '../../components/ui'
import { toDateKey } from '../../lib/dates'
import { closestTeam, replayIds, sideNamed, summarise, type ReplaySet, type SetSummary } from '../../lib/pokemon/replay'
import { resultFromGames } from '../../lib/pokemon/stats'
import { formatTeam, parseTeam, type TeamMon } from '../../lib/pokemon/team'
import type { MatchFormat, NewRow, PokemonGame, PokemonMatch, ReplayMon, RivalPokemon, RoundGame } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'
import { RivalNote } from './DeckExtras'
import { ReplayReport, shortFormat } from './ReplayReport'
import { GamesEditor, RivalDeckPicker, Toggle, VgcSide, type RivalDeck } from './RoundModal'
import { Choice, FORMAT_LABEL, RESULT_STYLES, SpeciesSprite } from './parts'
import { loadSets, savedMatch } from './replays'

type Result = RoundGame['result']
const RESULTS: Result[] = ['win', 'loss', 'tie']
const NEW_TEAM = '+'

/** What a set of replays says, as fields of the match. */
function fieldsOf(s: SetSummary, set: ReplaySet): Pick<NewRow<'pokemon_matches'>, 'date' | 'format' | 'games' | 'venue' | 'opponent_name' | 'opponent_pokemon' | 'my_pokemon' | 'teams' | 'replays'> {
  const brought = (side: 'mine' | 'rival') => [...new Set(s.games.flatMap((g) => g[side].brought))]
  const at = s.games[0].at
  return {
    date: toDateKey(at ? new Date(at) : new Date()),
    format: set.bo3 ? 'bo3' : 'bo1',
    games: s.results,
    venue: s.games[0].rated ? 'Showdown (ladder)' : 'Showdown',
    opponent_name: s.opponent,
    opponent_pokemon: brought('rival').map((species): RivalPokemon => {
      const m = s.rival.find((x) => x.species === species)
      return { species, item: m?.item ?? '', nature: m?.nature ?? '', moves: m?.moves ?? [] }
    }),
    my_pokemon: brought('mine'),
    teams: { mine: s.mine, rival: s.rival },
    replays: s.games,
  }
}

function useTeams() {
  const { data } = useData()
  return useMemo(() => data.vgc_teams.map((t) => ({ id: t.id, mons: parseTeam(t.paste).mons })), [data.vgc_teams])
}

/** Names I have played with in Showdown, the most recent first. */
function useMyNames() {
  const { data } = useData()
  return useMemo(() => [...new Set([...data.pokemon_matches].sort((a, b) => b.date.localeCompare(a.date)).flatMap((m) => m.replays.map((g) => g.mine.name)))].filter(Boolean), [data.pokemon_matches])
}

export function MatchModal({ game, match, onClose, onSaved }: { game: PokemonGame; match: PokemonMatch | null; onClose: () => void; onSaved: (another: boolean) => void }) {
  const { data, create, update, remove } = useData()
  const toast = useToast()
  const tcg = game === 'tcg'
  const teams = useTeams()
  const myNames = useMyNames()
  const last = useMemo(() => data.pokemon_matches.filter((m) => m.game === game).sort((a, b) => b.created_at.localeCompare(a.created_at))[0], [data.pokemon_matches, game])

  const [format, setFormat] = useState<MatchFormat>(match?.format ?? (tcg ? (last?.format ?? 'bo1') : 'bo3'))
  const [date, setDate] = useState(match?.date ?? toDateKey(new Date()))
  const [deckId, setDeckId] = useState(match ? (match.deck_id ?? '') : (last?.deck_id ?? ''))
  const [teamId, setTeamId] = useState(match ? (match.team_id ?? '') : (last?.team_id ?? ''))
  const [games, setGames] = useState<RoundGame[]>(match?.games ?? [])
  const [result, setResult] = useState<Result | null>(match?.result ?? null)
  const [dice, setDice] = useState<boolean | null>(match?.won_dice ?? null)
  const [first, setFirst] = useState<boolean | null>(match?.went_first ?? null)
  const [venue, setVenue] = useState(match ? match.venue : tcg ? (last?.venue ?? '') : '')
  const [opponent, setOpponent] = useState(match?.opponent_name ?? '')
  const [rival, setRival] = useState<RivalDeck>({ id: match?.opponent_archetype ?? '', icons: match?.opponent_icons ?? [], name: match?.opponent_deck_name ?? '' })
  const [mons, setMons] = useState<RivalPokemon[]>(match?.opponent_pokemon ?? [])
  const [mine, setMine] = useState<string[]>(match?.my_pokemon ?? [])
  const [notes, setNotes] = useState(match?.notes ?? '')
  const [replays, setReplays] = useState(match?.replays ?? [])
  const [sheets, setSheets] = useState(match?.teams ?? null)

  // ---- replays (VGC only)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [sets, setSets] = useState<ReplaySet[]>([])
  const [me, setMe] = useState('')
  const asked = useRef('')

  const ids = tcg ? [] : replayIds(text)
  const key = ids.join()
  useEffect(() => {
    if (!key || key === asked.current) return
    const t = setTimeout(() => void read(key.split(',')), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  async function read(list: string[]) {
    const mark = list.join()
    asked.current = mark
    setBusy(true)
    const r = await loadSets(list, data.pokemon_matches)
    // A newer paste arrived meanwhile.
    if (asked.current !== mark) return
    setBusy(false)
    const errs = [...r.errors]
    let found = r.sets
    if (match?.replays.length && found.length) {
      const own = found.filter((s) => savedMatch([match], s))
      if (own.length < found.length) errs.push('Hay enlaces de otro set: añádelos como una partida nueva.')
      found = own
    } else if (match && found.length > 1) {
      errs.push('Son sets distintos: aquí solo se usa el primero.')
      found = found.slice(0, 1)
    }
    setErrors(errs)
    setSets(found)
    if (!found.length) return
    // Who am I: the name I always use, or whoever plays one of my teams.
    const r0 = found[0].games[0]
    const known = myNames.find((n) => sideNamed(r0, n) !== null)
    const byTeam = r0.sides.filter((s) => closestTeam(s.team, teams))
    const name = known ?? (byTeam.length === 1 ? byTeam[0].name : '')
    setMe(name)
    if (name) apply(found, name)
  }

  /** Fill the form with the only set (several are saved as they come). */
  function apply(list: ReplaySet[], name: string) {
    setMe(name)
    if (list.length !== 1) return
    const s = summarise(list[0], name)
    if (!s) return
    const f = fieldsOf(s, list[0])
    setFormat(f.format)
    setDate(f.date)
    setGames(f.games)
    setResult(resultFromGames(f.games))
    if (!venue) setVenue(f.venue)
    setOpponent(f.opponent_name)
    setMons(f.opponent_pokemon)
    setMine(f.my_pokemon)
    setSheets(f.teams)
    setReplays(f.replays)
    setTeamId(closestTeam(s.mine, teams)?.id ?? (match?.team_id || ''))
  }
  function detach() {
    setReplays([])
    setSheets(null)
    setSets([])
    setText('')
    asked.current = ''
  }

  const summaries = sets.map((set) => ({ set, s: me ? summarise(set, me) : null }))
  const several = sets.length > 1
  const single = sets.length === 1 ? summaries[0].s : null
  const missing = single && !single.decided ? single.missing.at(-1) : undefined
  const players = sets[0]?.games[0].sides.map((s) => s.name) ?? []
  const already = !match && sets.length === 1 ? savedMatch(data.pokemon_matches, sets[0]) : undefined
  const withReplays = replays.length > 0

  const customInvalid = tcg && rival.id === 'other' && rival.icons.length === 0
  const ok = !busy && (several ? summaries.some((x) => x.s) : result !== null && !customInvalid && Boolean(date) && (!sets.length || Boolean(me)))

  function changeGames(next: RoundGame[]) {
    setGames(next)
    setResult(resultFromGames(next))
  }
  function changeFormat(f: MatchFormat) {
    setFormat(f)
    if (f === 'bo1' && games.length > 1) changeGames(games.slice(0, 1))
  }
  function chooseFirst(v: boolean | null) {
    setFirst(v)
    if (games.length) setGames(games.map((g, i) => (i === 0 ? { ...g, first: v } : g)))
  }

  /** Team sheets do not show the stat points: those are left for you to fill in. */
  async function teamFrom(sheet: ReplayMon[]): Promise<string | null> {
    const zero = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
    const list = sheet.map((m): TeamMon => ({ nickname: '', species: m.species, gender: '', item: m.item, ability: m.ability, level: 50, teraType: m.tera, nature: m.nature, evs: zero, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, moves: m.moves }))
    const row = await create('vgc_teams', { name: `${sheet.slice(0, 2).map((m) => m.species).join(' + ')} (Showdown)`.slice(0, 120), regulation: shortFormat(replays[0]?.format ?? '').slice(0, 60), paste: formatTeam(list), notes: '' })
    return row?.id ?? null
  }

  const base = { game, won_dice: null, went_first: null, deck_id: null, opponent_archetype: '', opponent_icons: [], opponent_deck_name: '' } as const

  async function saveSeveral() {
    onSaved(false)
    let added = 0
    let updated = 0
    for (const { set, s } of summaries) {
      if (!s) continue
      const f = fieldsOf(s, set)
      const row = { ...base, ...f, opponent_icons: [], result: resultFromGames(f.games) ?? ('tie' as const) }
      const old = savedMatch(data.pokemon_matches, set)
      if (old) {
        await update('pokemon_matches', old.id, { games: f.games, result: row.result, replays: f.replays, teams: f.teams, opponent_pokemon: f.opponent_pokemon, my_pokemon: f.my_pokemon })
        updated++
      } else if (await create('pokemon_matches', { ...row, team_id: closestTeam(s.mine, teams)?.id ?? null, notes: '' })) added++
    }
    toast('success', [added && `${added} guardadas`, updated && `${updated} actualizadas`].filter(Boolean).join(' · ') || 'Nada que guardar')
  }

  async function save(another: boolean) {
    if (!ok) return
    if (several) return saveSeveral()
    if (result === null) return
    const row: NewRow<'pokemon_matches'> = {
      game, date, format, result, games,
      won_dice: tcg ? dice : null,
      went_first: tcg ? (games[0]?.first ?? first) : null,
      deck_id: tcg ? deckId || null : null,
      team_id: tcg || teamId === NEW_TEAM ? null : teamId || null,
      venue: venue.trim(),
      opponent_name: opponent.trim(),
      opponent_archetype: tcg ? rival.id : '',
      opponent_icons: tcg ? rival.icons : [],
      opponent_deck_name: tcg ? rival.name.trim() : '',
      opponent_pokemon: tcg ? [] : mons.filter((m) => m.species).map((m) => ({ ...m, moves: m.moves.filter(Boolean) })),
      my_pokemon: tcg ? [] : mine,
      teams: tcg ? null : sheets,
      replays: tcg ? [] : replays,
      notes,
    }
    onSaved(another)
    if (!tcg && teamId === NEW_TEAM && sheets) row.team_id = await teamFrom(sheets.mine)
    if (match) {
      const { replays: r, teams: t, ...rest } = row
      // Untouched replays are not written again: the copy at hand may lack their turn by turn.
      await update('pokemon_matches', match.id, replays === match.replays ? rest : { ...rest, replays: r, teams: t })
    } else if (already) await update('pokemon_matches', already.id, { ...row, notes: notes || already.notes })
    else await create('pokemon_matches', row)
  }

  const team = data.vgc_teams.find((t) => t.id === teamId) ?? null

  return (
    <Modal
      open
      full
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {match ? (opponent ? `Contra ${opponent}` : 'Partida') : several ? `${sets.length} enfrentamientos` : 'Nueva partida'}
          {!several && (
            <span className="num rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted">
              {game.toUpperCase()} {FORMAT_LABEL[format]}
            </span>
          )}
        </span>
      }
      footer={
        <>
          {match && (
            <Button
              variant="danger"
              className="mr-auto"
              aria-label="Eliminar partida"
              onClick={() => {
                onClose()
                void remove('pokemon_matches', match.id)
              }}
            >
              <Trash2 className="size-4" /> <span className="max-sm:sr-only">Eliminar</span>
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {!match && !several && (
            <Button className="hidden sm:inline-flex" disabled={!ok} onClick={() => void save(true)}>
              Guardar y otra
            </Button>
          )}
          <Button variant="primary" disabled={!ok} onClick={() => void save(false)}>
            {several ? 'Guardar todas' : already ? 'Actualizar la guardada' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-6xl">
        {!tcg && (
          <div className="mb-5 rounded-xl border border-line bg-surface-2 p-4">
            <Field label={match?.replays.length ? 'Añadir otra repetición de este set' : 'Enlaces de las repeticiones de Showdown'}>
              <textarea
                className={cx('field font-mono text-xs leading-relaxed', match?.replays.length ? 'min-h-11' : 'min-h-16')}
                rows={match?.replays.length ? 1 : 2}
                spellCheck={false}
                autoComplete="off"
                value={text}
                maxLength={8000}
                onChange={(e) => setText(e.target.value)}
                placeholder="https://replay.pokemonshowdown.com/…  (uno por partida, o de varios sets a la vez)"
              />
            </Field>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-live="polite">
              {busy ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" /> Leyendo las repeticiones…
                </span>
              ) : single ? (
                <span className="inline-flex items-center gap-1.5">
                  <Link2 className="size-3.5" /> {single.games.length} {single.games.length === 1 ? 'partida leída' : 'partidas leídas'} · {shortFormat(single.games[0].format)}
                </span>
              ) : text.trim() && !ids.length ? (
                <span>No hay ningún enlace de replay.pokemonshowdown.com.</span>
              ) : (
                !match && !sets.length && <span>O rellena la partida a mano aquí abajo.</span>
              )}
              {errors.map((e) => (
                <span key={e} className="text-rose-700 dark:text-rose-400">
                  {e}
                </span>
              ))}
              {(withReplays || several) && (
                <>
                  {match && !sets.length && (
                    <button type="button" className="inline-flex min-h-8 items-center gap-1 font-medium text-accent hover:underline" onClick={() => void read(replays.map((g) => g.id))}>
                      <RefreshCw className="size-3.5" /> Volver a leer
                    </button>
                  )}
                  <button type="button" className="inline-flex min-h-8 items-center gap-1 font-medium text-accent hover:underline" onClick={detach}>
                    <Unlink className="size-3.5" /> Quitar repeticiones
                  </button>
                </>
              )}
            </div>
            {sets.length > 0 && (
              <div className="mt-3">
                <span className="label">¿Quién eres?</span>
                <Choice label="Mi nombre en Showdown" value={me || null} invalid={!me} options={players.map((p) => ({ value: p, label: p }))} onChange={(v) => apply(sets, v)} />
              </div>
            )}
            {already && <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">Este set ya lo tenías guardado: se actualizará con lo nuevo.</p>}
            {missing && (
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
                Falta la partida {missing} de este BO3. Pega su enlace o, si no se jugó, elige tú el resultado.
              </p>
            )}
            {single && single.decided && single.missing.length > 0 && <p className="mt-2 text-sm text-muted">Sin repetición de la partida {single.missing.join(' y ')}: su resultado sale del marcador del set.</p>}
          </div>
        )}

        {several ? (
          <ul className="space-y-2">
            {summaries.map(({ set, s }) => (
              <SetRow key={set.key} set={set} s={s} saved={Boolean(savedMatch(data.pokemon_matches, set))} team={s ? (data.vgc_teams.find((t) => t.id === closestTeam(s.mine, teams)?.id)?.name ?? null) : null} />
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="label">Formato</span>
                  {withReplays ? (
                    <p className="flex min-h-10 items-center text-sm font-semibold">{FORMAT_LABEL[format]}</p>
                  ) : (
                    <Toggle label="Formato" value={format} onChange={changeFormat} options={[{ value: 'bo1', label: 'BO1' }, { value: 'bo3', label: 'BO3' }]} />
                  )}
                </div>
                <Field label="Fecha">
                  <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              </div>

              {tcg ? (
                <Field label="Mi mazo">
                  <select className="field" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                    <option value="">Sin asignar</option>
                    {data.tcg_decks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Mi equipo">
                  <select className="field" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">Sin asignar</option>
                    {data.vgc_teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                    {sheets && <option value={NEW_TEAM}>Crear un equipo con esta hoja</option>}
                  </select>
                </Field>
              )}

              {tcg && (
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

              {!withReplays && (
                <div>
                  <span className="label">{format === 'bo1' ? 'Partida' : 'Partidas (al mejor de 3)'}</span>
                  <GamesEditor games={games} format={format} tcg={tcg} first={first} onChange={changeGames} onFirst={setFirst} />
                </div>
              )}

              <div>
                <span className="label">
                  Resultado{format === 'bo3' && ' del set'}
                  {withReplays && games.length > 0 && <span className="num"> · {games.map((g) => RESULT_STYLES[g.result].short).join(' ')}</span>}
                </span>
                <Toggle<Result | 'none'> label="Resultado" value={result ?? 'none'} onChange={(v) => v !== 'none' && setResult(v)} options={RESULTS.map((r) => ({ value: r, label: RESULT_STYLES[r].label, cls: RESULT_STYLES[r].cls }))} />
                {!withReplays && <p className="mt-1.5 text-xs text-muted">Se calcula con las partidas; cámbialo si hubo abandono.</p>}
              </div>

              <Field label="Nombre del rival (opcional)">
                <input className="field" value={opponent} maxLength={120} autoComplete="off" onChange={(e) => setOpponent(e.target.value)} />
              </Field>
              <VenueField value={venue} onChange={setVenue} game={game} />
              <Field label="Notas">
                <textarea className="field min-h-20" value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} placeholder="Jugadas clave, errores…" />
              </Field>
            </div>

            <div className="min-w-0 lg:border-l lg:border-line lg:pl-6">
              {tcg ? (
                <>
                  <RivalDeckPicker value={rival} onChange={setRival} invalid={customInvalid} />
                  <RivalNote key={`${rival.id}-${rival.icons.join()}-${rival.name}`} deckId={deckId || null} rival={rival} />
                </>
              ) : withReplays ? (
                <ReplayReport teams={sheets} games={replays} />
              ) : (
                <VgcSide mons={mons} setMons={setMons} mine={mine} setMine={setMine} team={team} />
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function VenueField({ value, onChange, game }: { value: string; onChange: (v: string) => void; game: PokemonGame }) {
  const { data } = useData()
  const used = useMemo(() => [...new Set(data.pokemon_matches.filter((m) => m.game === game).map((m) => m.venue))].filter(Boolean).sort(), [data.pokemon_matches, game])
  return (
    <Field label="Dónde (opcional)">
      <input className="field" list={`venues-${game}`} value={value} maxLength={80} autoComplete="off" onChange={(e) => onChange(e.target.value)} placeholder={game === 'tcg' ? 'TCG Live, en la tienda, con amigos…' : 'Ladder, en la consola, con amigos…'} />
      <datalist id={`venues-${game}`}>
        {used.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </Field>
  )
}

function SetRow({ set, s, saved, team }: { set: ReplaySet; s: SetSummary | null; saved: boolean; team: string | null }) {
  const result = s ? (resultFromGames(s.results) ?? 'tie') : null
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm">
      {result && <span className={cx('rounded-lg border px-2 py-1 text-xs font-semibold', RESULT_STYLES[result].cls)}>{s!.results.map((g) => RESULT_STYLES[g.result].short).join(' ')}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{s ? `contra ${s.opponent}` : set.games[0].sides.map((x) => x.name).join(' – ')}</span>
        <span className="block text-xs text-muted">
          {set.bo3 ? 'BO3' : 'BO1'} · {set.games.length} {set.games.length === 1 ? 'repetición' : 'repeticiones'}
          {s && ` · ${team ?? 'sin equipo reconocido'}`}
          {s && !s.decided && ' · incompleto'}
          {saved && ' · ya guardado'}
          {!s && ' · no juegas con este nombre'}
        </span>
      </span>
      {s && (
        <span className="inline-flex -space-x-2">
          {s.rival.map((m) => (
            <SpeciesSprite key={m.species} species={m.species} size={28} />
          ))}
        </span>
      )}
      {!s && <Plus className="size-4 rotate-45 text-rose-600" aria-hidden />}
    </li>
  )
}
