import { useDeferredValue, useMemo, useState } from 'react'
import { Info, RotateCcw, ShieldCheck, Target, Trophy, Users } from 'lucide-react'
import { Button, Card, Field, Stat, cx } from '../../components/ui'
import { MIN_PLAYERS, asymmetricCap, recordFor, structureFor, type EventKind } from '../../lib/pokemon/structure'
import { myChance, myFinalPoints, scenarios, simulateSwiss, type MyState, type SimConfig } from '../../lib/pokemon/simulate'
import { recordText } from '../../lib/pokemon/stats'
import type { MatchFormat, PokemonGame, TopCutType } from '../../lib/types'
import { Choice, fmtRate } from './parts'

export interface CalcSeed {
  key: string
  name: string
  game: PokemonGame
  kind: EventKind
  players: number
  rounds: number | null
  topCut: number | null
  topCutType: TopCutType
  format: MatchFormat
  me: MyState
}

const KINDS: { value: EventKind; label: string }[] = [
  { value: 'league_challenge', label: 'League Challenge' },
  { value: 'league_cup', label: 'League Cup' },
  { value: 'major', label: 'Regional / Especial / Internacional' },
  { value: 'online', label: 'Online u otro' },
]
type CutChoice = 'official' | '0' | `${TopCutType}-${number}`
const CUTS: { value: CutChoice; label: string }[] = [
  { value: 'official', label: 'El oficial para N' },
  { value: '0', label: 'Sin Top Cut' },
  ...[2, 4, 8, 16, 32, 64].map((n) => ({ value: `standard-${n}` as CutChoice, label: `Top ${n}` })),
  ...[2, 4, 6, 8, 16].map((n) => ({ value: `asymmetric-${n}` as CutChoice, label: `Top ${n} asimétrico` })),
]
const int = (s: string, min: number, max: number) => {
  const n = Math.floor(Number(s))
  return s.trim() === '' || !Number.isFinite(n) ? null : Math.min(max, Math.max(min, n))
}
const recordLabel = (points: number, rounds: number) => {
  const r = recordFor(points, rounds)
  return r ? recordText(r) : '—'
}

export function Calculator({ seed }: { seed: CalcSeed | null }) {
  const [game, setGame] = useState<PokemonGame>(seed?.game ?? 'tcg')
  const [kind, setKind] = useState<EventKind>(seed?.kind ?? 'league_cup')
  const [playersText, setPlayers] = useState(String(seed?.players ?? 48))
  const [roundsText, setRounds] = useState(seed?.rounds ? String(seed.rounds) : '')
  const [cut, setCut] = useState<CutChoice>(() => (!seed ? 'official' : !seed.topCut ? '0' : CUTS.some((c) => c.value === `${seed.topCutType}-${seed.topCut}`) ? `${seed.topCutType}-${seed.topCut}` : 'official'))
  const [format, setFormat] = useState<MatchFormat>(seed?.format ?? 'bo3')
  const [drops, setDrops] = useState<string[]>([])
  const [dropRate, setDropRate] = useState(0)
  const [me, setMe] = useState<MyState>(seed?.me ?? { wins: 0, losses: 0, ties: 0 })
  const [winPct, setWinPct] = useState(50)

  const players = int(playersText, 2, 20000) ?? 0
  const official = structureFor(game, kind, players)
  const rounds = int(roundsText, 1, 20) ?? official?.swiss ?? 0
  const tieRate = game === 'tcg' && format === 'bo3' ? 0.02 : 0
  const [type, size] = cut === 'official' ? [official?.topCutType ?? 'standard', official?.topCut ?? 0] : cut === '0' ? (['standard', 0] as const) : ([cut.split('-')[0] as TopCutType, Number(cut.split('-')[1])] as const)
  const phase = official?.phase && rounds === official.swiss ? official.phase : null
  const playedRounds = Math.min(rounds, me.wins + me.losses + me.ties)
  const knownDrops = useMemo(() => {
    // A blank field means "nothing known": rounds after the last filled one use the estimate.
    const last = drops.reduce((a, d, i) => (d.trim() !== '' ? i : a), -1)
    return drops.slice(0, last + 1).map((d) => int(d, 0, 20000) ?? 0)
  }, [drops])
  const dropped = knownDrops.slice(0, rounds).reduce((a, b) => a + b, 0)

  const cfg = useMemo<SimConfig | null>(
    () =>
      players >= MIN_PLAYERS && rounds > 0
        ? { players, rounds, tieRate, drops: knownDrops, dropRate: dropRate / 100, phase, topCut: size, topCutType: type, cap: asymmetricCap(game), sims: 600 }
        : null,
    // `phase` is a fresh object each render; its values depend on these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, rounds, tieRate, knownDrops, dropRate, phase?.rounds, phase?.threshold, size, type, game],
  )
  const deferred = useDeferredValue(cfg)
  const sim = useMemo(() => (deferred ? simulateSwiss(deferred) : null), [deferred])
  const overplayed = me.wins + me.losses + me.ties > rounds
  const chance = sim && deferred ? myChance(myFinalPoints(me, deferred.rounds, winPct / 100, tieRate, deferred.phase), sim) : 0
  const list = sim && deferred ? scenarios(me, deferred.rounds, sim, deferred.phase) : []

  const step = (k: keyof MyState, d: number) => setMe((m) => ({ ...m, [k]: Math.max(0, Math.min(20, m[k] + d)) }))

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Card title={seed ? seed.name : 'Torneo'}>
        <div className="space-y-4">
          <div>
            <span className="label">Disciplina</span>
            <Choice<PokemonGame> label="Disciplina" value={game} onChange={setGame} options={[{ value: 'tcg', label: 'TCG' }, { value: 'vgc', label: 'VGC' }]} />
          </div>
          <Field label="Tipo de evento">
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inscritos (N)">
              <input className="field num" inputMode="numeric" value={playersText} onChange={(e) => setPlayers(e.target.value)} />
            </Field>
            <Field label="Rondas suizas">
              <input className="field num" inputMode="numeric" value={roundsText} placeholder={official ? String(official.swiss) : '—'} onChange={(e) => setRounds(e.target.value)} />
            </Field>
          </div>
          <Field label="Top Cut">
            <select className="field" value={cut} onChange={(e) => setCut(e.target.value as CutChoice)}>
              {CUTS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <span className="label">Formato del suizo</span>
            <Choice<MatchFormat> label="Formato del suizo" value={format} onChange={setFormat} options={[{ value: 'bo1', label: 'BO1' }, { value: 'bo3', label: 'BO3' }]} />
            <p className="mt-1.5 text-xs text-muted">{tieRate ? 'En TCG a BO3 se estima un 2 % de empates.' : 'Sin empates.'}</p>
          </div>
        </div>
      </Card>

      <div className="min-w-0 space-y-4">
        {!cfg || !sim ? (
          <Card>
            <p className="text-sm text-muted">Indica al menos {MIN_PLAYERS} inscritos.</p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Rondas suizas" value={rounds} hint={official ? (roundsText && rounds !== official.swiss ? `Oficial: ${official.swiss}` : official.variant) : 'A medida'} icon={<RotateCcw className="size-4" />} />
              <Stat
                label="Top Cut"
                value={size ? `Top ${size}` : 'No hay'}
                hint={!size ? 'Gana quien acabe primero' : type === 'asymmetric' ? `Asimétrico: ≈ ${sim.seats.toFixed(0)} plazas (máx. ${Math.max(size, cfg.cap)})` : `${size} plazas`}
                icon={<Trophy className="size-4" />}
              />
              <Stat label="Puntos seguros" value={sim.safe ?? '—'} hint={sim.safe !== null ? `${recordLabel(sim.safe, rounds)} entra siempre (≥ 99 %)` : size ? 'Ningún récord asegura plaza' : '—'} icon={<ShieldCheck className="size-4" />} />
              <Stat label="Puntos mínimos" value={sim.bubble ?? '—'} hint={sim.bubble !== null ? (sim.bubble === sim.safe ? 'Sin burbuja: corte limpio' : `${recordLabel(sim.bubble, rounds)} entra el ${fmtRate((sim.byPoints.get(sim.bubble) ?? 0) * 100)}`) : '—'} icon={<Target className="size-4" />} />
            </div>

            {phase && (
              <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
                <Info className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>
                  Dos fases: tras la ronda {phase.rounds} solo siguen quienes tengan <strong>{phase.threshold} puntos o más</strong> ({recordLabel(phase.threshold, phase.rounds)}).
                </span>
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Simulador en vivo">
                <span className="label">Mi récord</span>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['wins', 'Victorias'],
                      ['losses', 'Derrotas'],
                      ['ties', 'Empates'],
                    ] as const
                  ).map(([k, label]) => (
                    <div key={k} className="rounded-lg border border-line bg-surface-2 p-2 text-center">
                      <div className="text-xs text-muted">{label}</div>
                      <div className="mt-1 flex items-center justify-between">
                        <button type="button" aria-label={`Quitar: ${label}`} className="grid size-9 place-items-center rounded-lg hover:bg-line" onClick={() => step(k, -1)}>
                          −
                        </button>
                        <span className="num text-lg font-semibold">{me[k]}</span>
                        <button type="button" aria-label={`Añadir: ${label}`} className="grid size-9 place-items-center rounded-lg hover:bg-line" onClick={() => step(k, 1)}>
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {overplayed && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">Tu récord tiene más rondas que el torneo.</p>}

                <div className="mt-4">
                  <label className="label" htmlFor="calc-win">
                    Probabilidad de ganar cada ronda: <span className="num">{winPct} %</span>
                  </label>
                  <input id="calc-win" type="range" className="w-full" min={10} max={90} step={5} value={winPct} onChange={(e) => setWinPct(Number(e.target.value))} />
                </div>

                <div className="mt-4">
                  <span className="label">Abandonos después de cada ronda</span>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
                    {Array.from({ length: Math.max(0, rounds - 1) }, (_, i) => (
                      <label key={i} className="block">
                        <span className={cx('num mb-0.5 block text-[11px]', i < playedRounds ? 'text-fg' : 'text-faint')}>R{i + 1}</span>
                        <input
                          className="field num px-2 text-center"
                          inputMode="numeric"
                          placeholder="—"
                          aria-label={`Abandonos tras la ronda ${i + 1}`}
                          value={drops[i] ?? ''}
                          onChange={(e) => setDrops((d) => Object.assign(Array.from({ length: Math.max(d.length, i + 1) }, (_, j) => d[j] ?? ''), { [i]: e.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-3">
                    <label className="label" htmlFor="calc-drop">
                      Abandono estimado en las demás rondas: <span className="num">{dropRate} %</span>
                    </label>
                    <input id="calc-drop" type="range" className="w-full" min={0} max={15} step={1} value={dropRate} onChange={(e) => setDropRate(Number(e.target.value))} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-muted">
                      <Users className="size-4" /> {players} inscritos − {dropped} abandonos · ≈ <span className="num text-fg">{Math.round(sim.active)}</span> al final
                    </span>
                    {(dropped > 0 || dropRate > 0) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDrops([])
                          setDropRate(0)
                        }}
                      >
                        Quitar abandonos
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              <Card title="Mis opciones">
                {size ? (
                  <>
                    <div className="text-center" aria-live="polite">
                      <div className="num text-4xl font-semibold">{fmtRate(chance * 100)}</div>
                      <p className="mt-1 text-xs text-muted">
                        de entrar en el Top Cut con {recordText({ w: me.wins, l: me.losses, t: me.ties })} tras {playedRounds} de {rounds} rondas
                      </p>
                    </div>
                    <ul className="mt-4 space-y-1">
                      {list.map((s) => (
                        <li key={s.wins} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-sm odd:bg-surface-2">
                          <span className="truncate">
                            {s.wins + s.losses === 0 ? 'Resultado final' : `Hago ${s.wins}-${s.losses}`} <span className="num text-xs text-muted">→ {s.points} pts</span>
                          </span>
                          <span className="num font-semibold">{fmtRate(s.qualify * 100)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-muted">Este torneo no tiene Top Cut: la clasificación final es la del suizo.</p>
                )}
              </Card>
            </div>

            <Card title="Clasificación estimada tras el suizo" bodyClass="p-0">
              <div className="scrollbar-thin relative overflow-x-auto" tabIndex={0} role="region" aria-label="Clasificación estimada">
                <table className="w-full min-w-[440px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="px-4 py-2 font-medium">Récord</th>
                      <th className="px-2 py-2 text-right font-medium">Puntos</th>
                      <th className="px-2 py-2 text-right font-medium">Jugadores</th>
                      <th className="px-2 py-2 text-right font-medium">Puestos</th>
                      <th className="w-2/5 px-4 py-2 font-medium">{size ? 'Entra en el Top Cut' : ''}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sim.lines
                      .filter((l) => l.players >= 0.3)
                      .slice(0, 16)
                      .map((l) => (
                        <tr key={l.points} className={cx(l.points === me.wins * 3 + me.ties && playedRounds === rounds && 'bg-accent/8')}>
                          <td className="num px-4 py-2 font-medium">{recordLabel(l.points, rounds)}</td>
                          <td className="num px-2 py-2 text-right">{l.points}</td>
                          <td className="num px-2 py-2 text-right">{l.players < 10 ? l.players.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : Math.round(l.players)}</td>
                          <td className="num px-2 py-2 text-right text-muted">
                            {Math.round(l.from)}–{Math.max(Math.round(l.from), Math.round(l.to))}
                          </td>
                          <td className="px-4 py-2">
                            {size > 0 && (
                              <span className="flex items-center gap-2">
                                <span className="block h-1.5 flex-1 rounded-full bg-line" aria-hidden>
                                  <span className="block h-full rounded-full bg-sky-500" style={{ width: `${l.qualify * 100}%` }} />
                                </span>
                                <span className="num w-11 text-right">{fmtRate(l.qualify * 100)}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-4 py-3 text-xs text-muted">
                Media de 600 torneos simulados con emparejamiento suizo. Entre empatados a puntos decide la resistencia (OWP), que aquí se reparte por igual. Rondas: Tournament Rules Handbook de Play! Pokémon (mayo de 2026)
                {type === 'asymmetric' && `; máximo de plazas del corte asimétrico: TCG 16 / VGC 32 (septiembre de 2026). Se interpreta que entran todos los empatados a puntos con el puesto ${size}`}.
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
