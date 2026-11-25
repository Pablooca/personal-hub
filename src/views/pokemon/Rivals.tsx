import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, RotateCcw, UserMinus } from 'lucide-react'
import { Card, cx } from '../../components/ui'
import type { SimConfig } from '../../lib/pokemon/simulate'
import { bracketChances, chances, currentOwp, estimatedRival, recordRounds, recordsBefore, rivalWinPct, simulateField } from '../../lib/pokemon/standings'
import { recordText } from '../../lib/pokemon/stats'
import { bracketLabel } from '../../lib/pokemon/structure'
import type { RivalRecord, Tournament, TournamentRound } from '../../lib/types'
import { useData } from '../../state/data'
import { DeckIcons, RESULT_STYLES, SpeciesSprite } from './parts'

const pct1 = (v: number) => `${(v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`
/** 0–100 % without pretending to more precision than a simulation has. */
const chance = (v: number) => (v <= 0 ? '0 %' : v < 0.01 ? '< 1 %' : v > 0.99 && v < 1 ? '> 99 %' : `${Math.round(v * 100)} %`)
const toMine = (rounds: readonly TournamentRound[]) => rounds.map((r) => ({ result: r.result, rival: r.opponent_record ?? null }))

// ------------------------------------------------------------------- rivals
export function RivalsCard({ tournament: t, rounds }: { tournament: Tournament; rounds: TournamentRound[] }) {
  const mine = useMemo(() => toMine(rounds), [rounds])
  const before = useMemo(() => recordsBefore(mine), [mine])
  const owp = currentOwp(mine)
  const noted = rounds.filter((r) => r.result !== 'bye' && r.opponent_record).length
  const total = rounds.filter((r) => r.result !== 'bye').length

  return (
    <Card
      title="Seguimiento de rivales"
      bodyClass="p-0"
      action={
        owp !== null && (
          <span className="text-xs text-muted">
            Mi Op Win % <span className="num ml-1 text-sm font-semibold text-fg">{pct1(owp)}</span>
          </span>
        )
      }
    >
      <ul className="divide-y divide-line">
        {rounds.map((r, i) =>
          r.result === 'bye' ? null : <RivalRow key={r.id} t={t} round={r} estimate={estimatedRival(before[i], r.result)} played={rounds.length} />,
        )}
      </ul>
      <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
        {noted} de {total} anotados. Apunta el récord <strong>completo</strong> de cada rival (incluida vuestra partida) y actualízalo tras cada ronda. Lo que no anotes se estima según el emparejamiento suizo. Op Win %: victorias entre rondas, con mínimo 25 % y máximo 100 %
        (75 % si abandonó); los byes no cuentan.
      </p>
    </Card>
  )
}

function RivalRow({ t, round: r, estimate, played }: { t: Tournament; round: TournamentRound; estimate: RivalRecord; played: number }) {
  const { update } = useData()
  const saved = r.opponent_record ?? null
  const [rec, setRec] = useState<RivalRecord | null>(saved)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const dirty = useRef<RivalRecord | null | undefined>(undefined)

  // Another device changed it.
  const key = JSON.stringify(saved)
  useEffect(() => {
    if (dirty.current === undefined) setRec(JSON.parse(key) as RivalRecord | null)
  }, [key])

  // Several quick taps become one write; leaving the page sends what is left.
  const flush = useRef(() => {})
  flush.current = () => {
    clearTimeout(timer.current)
    if (dirty.current === undefined) return
    const value = dirty.current
    dirty.current = undefined
    void update('tournament_rounds', r.id, { opponent_record: value })
  }
  useEffect(() => () => flush.current(), [])
  function change(next: RivalRecord | null) {
    setRec(next)
    dirty.current = next
    clearTimeout(timer.current)
    timer.current = setTimeout(() => flush.current(), 500)
  }

  const shown = rec ?? estimate
  const max = t.swiss_rounds ?? 30
  const count = recordRounds(shown)
  const behind = rec && !rec.dropped ? played - count : 0
  const step = (k: 'w' | 'l' | 't', d: number) => {
    const v = shown[k] + d
    if (v < 0 || (d > 0 && count >= max)) return
    change({ ...shown, [k]: v, bye: shown.bye && (k !== 'w' || v > 0) })
  }
  const st = RESULT_STYLES[r.result]
  const name = r.opponent_name || (t.game === 'tcg' ? r.opponent_deck_name : '') || 'Rival'
  const label = `ronda ${r.number}`

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="num w-7 shrink-0 text-xs text-muted">R{r.number}</span>
        <span className={cx('grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-bold', st.cls)} title={`Mi resultado: ${st.label}`}>
          {st.short}
        </span>
        <span className="flex min-w-0 flex-1 basis-28 items-center gap-2">
          {r.result === 'no_show' ? (
            <span className="shrink-0 text-xs text-muted">{st.label}</span>
          ) : t.game === 'tcg' ? (
            <DeckIcons icons={r.opponent_icons} size={28} label={r.opponent_deck_name || 'Mazo sin identificar'} />
          ) : (
            <span className="flex -space-x-2">
              {r.opponent_pokemon.slice(0, 3).map((m, i) => (
                <SpeciesSprite key={i} species={m.species} size={26} />
              ))}
            </span>
          )}
          <span className="truncate text-sm">{name}</span>
        </span>
        <span className="text-right">
          <span className={cx('num block text-sm font-semibold', !rec && 'text-muted')}>
            {rec ? '' : '≈ '}
            {recordText(shown)}
          </span>
          <span className="num block text-[11px] text-muted">{pct1(rivalWinPct(shown))}</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2 sm:pl-10">
        <Stepper label={`Victorias del rival de la ${label}`} short="V" value={shown.w} faint={!rec} onStep={(d) => step('w', d)} />
        <Stepper label={`Derrotas del rival de la ${label}`} short="D" value={shown.l} faint={!rec} onStep={(d) => step('l', d)} />
        {(t.game === 'tcg' || shown.t > 0) && <Stepper label={`Empates del rival de la ${label}`} short="E" value={shown.t} faint={!rec} onStep={(d) => step('t', d)} />}
        {rec ? (
          <>
            <Chip on={rec.dropped} onClick={() => change({ ...rec, dropped: !rec.dropped })}>
              <UserMinus className="size-3.5" /> Abandonó
            </Chip>
            {(rec.w > 0 || rec.bye) && (
              <Chip on={rec.bye} onClick={() => change({ ...rec, bye: !rec.bye })}>
                Tuvo bye
              </Chip>
            )}
            <button type="button" aria-label={`Borrar el récord del rival de la ${label}`} title="Volver a estimar" onClick={() => change(null)} className="grid size-9 place-items-center rounded-lg text-faint hover:bg-surface-2 hover:text-fg">
              <RotateCcw className="size-3.5" />
            </button>
          </>
        ) : (
          <Chip on={false} onClick={() => change({ ...estimate })}>
            <Check className="size-3.5" /> Es correcto
          </Chip>
        )}
      </div>
      {behind > 0 && (
        <p className="mt-1.5 text-xs text-amber-800 sm:pl-10 dark:text-amber-300">
          {behind === 1 ? 'Falta una ronda por anotar' : `Faltan ${behind} rondas por anotar`}: se simula{behind > 1 && 'n'}.
        </p>
      )}
    </li>
  )
}

function Stepper({ label, short, value, faint, onStep }: { label: string; short: string; value: number; faint: boolean; onStep: (d: 1 | -1) => void }) {
  return (
    <div className="flex items-center rounded-lg border border-line bg-surface-2" role="group" aria-label={label}>
      <button type="button" aria-label={`Quitar: ${label}`} disabled={value <= 0} onClick={() => onStep(-1)} className="grid h-9 w-8 place-items-center rounded-l-lg sm:w-9 hover:bg-line disabled:opacity-30">
        −
      </button>
      <span className={cx('num min-w-7 text-center sm:min-w-9 text-sm', faint ? 'text-muted' : 'font-semibold')} aria-live="polite">
        {value}
        {short}
      </span>
      <button type="button" aria-label={`Añadir: ${label}`} onClick={() => onStep(1)} className="grid h-9 w-8 place-items-center rounded-r-lg sm:w-9 hover:bg-line">
        +
      </button>
    </div>
  )
}

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className={cx('inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium', on ? 'border-accent bg-accent/10' : 'border-line text-muted hover:text-fg')}>
    {children}
  </button>
)

// ------------------------------------------------------------------ chances
const KS = [8, 4, 2] as const

export function ChancesCard({ tournament: t, cfg, swiss, cut }: { tournament: Tournament; cfg: SimConfig; swiss: TournamentRound[]; cut: TournamentRound[] }) {
  const [winPct, setWinPct] = useState(50)
  const [drops, setDrops] = useState('')
  const played = swiss.length
  const left = Math.max(0, cfg.rounds - played)
  const inBracket = t.made_top_cut || cut.length > 0

  const dropped = Math.min(cfg.players - 2, Math.max(0, Math.floor(Number(drops) || 0)))
  // Field: only depends on the event (and on drops), not on my results.
  const fieldCfg = useMemo<SimConfig>(() => {
    if (!dropped || !played) return cfg
    // Spread what is known over the rounds already played.
    const upTo = Math.min(played, cfg.rounds)
    const list = Array.from({ length: upTo }, (_, i) => Math.floor(((i + 1) * dropped) / upTo) - Math.floor((i * dropped) / upTo))
    return { ...cfg, drops: list }
  }, [cfg, dropped, played])
  const deferredCfg = useDeferredValue(fieldCfg)
  const field = useMemo(() => (inBracket ? null : simulateField(deferredCfg)), [deferredCfg, inBracket])
  const mine = useMemo(() => toMine(swiss.slice(0, cfg.rounds)), [swiss, cfg.rounds])
  const deferredMine = useDeferredValue(mine)
  const deferredWin = useDeferredValue(winPct)
  const res = useMemo(
    () => (field ? chances(deferredCfg, field, deferredMine, { winRate: deferredWin / 100, ks: KS, topCutType: t.top_cut_type }) : null),
    [field, deferredCfg, deferredMine, deferredWin, t.top_cut_type],
  )
  const bracket = useMemo(() => (inBracket ? bracketChances(t.top_cut_size ?? 8, cut.map((r) => r.result), winPct / 100, KS) : null), [inBracket, t.top_cut_size, cut, winPct])

  if (bracket) {
    return (
      <>
        <Rows rows={KS.map((k) => ({ label: k === 2 ? 'Top 2 (final)' : `Top ${k}`, value: bracket.get(k)! }))} />
        <WinSlider value={winPct} onChange={setWinPct} label="Probabilidad de ganar cada eliminatoria" />
        <p className="mt-3 text-xs text-muted">Ya estás en el Top Cut: solo cuenta el cuadro.</p>
      </>
    )
  }
  if (!res) return null
  const bestCut = cfg.topCut > 0
  const rank = (n: number) => (Number.isFinite(n) ? `${n}.º` : 'fuera')

  return (
    <>
      {bestCut && (
        <div className="text-center" aria-live="polite">
          <div className="num text-4xl font-semibold">{chance(res.cut ?? 0)}</div>
          <p className="mt-0.5 text-xs text-muted">
            de entrar en el Top Cut (Top {cfg.topCut}
            {t.top_cut_type === 'asymmetric' && ' asimétrico'})
          </p>
        </div>
      )}
      <div className={cx(bestCut && 'mt-4')}>
        <div className="eyebrow mb-1">Puesto final del torneo</div>
        <Rows rows={KS.map((k) => ({ label: k === 2 ? `Top 2 (${bestCut ? 'final' : bracketLabel(2).toLowerCase()})` : `Top ${k}`, value: res.final.get(k)! }))} />
      </div>
      {bestCut && (
        <div className="mt-4">
          <div className="eyebrow mb-1">Clasificación tras el suizo</div>
          <Rows rows={KS.map((k) => ({ label: `Entre los ${k} primeros`, value: res.swiss.get(k)! }))} />
        </div>
      )}
      <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
        {res.rank && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Puesto más probable{left > 0 ? ' al acabar' : ''}</dt>
            <dd className="num text-right font-medium">
              {rank(res.rank[1])}
              {res.rank[0] !== res.rank[2] && (
                <span className="ml-1 text-xs font-normal text-muted">
                  ({rank(res.rank[0])}–{rank(res.rank[2])})
                </span>
              )}
            </dd>
          </div>
        )}
        {res.owp !== null && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Op Win % final esperado</dt>
            <dd className="num font-medium">{pct1(res.owp)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Rondas suizas restantes</dt>
          <dd className="num font-medium">{left}</dd>
        </div>
      </dl>
      <WinSlider value={winPct} onChange={setWinPct} label="Probabilidad de ganar cada ronda" />
      <label className="mt-3 block">
        <span className="label">Abandonos hasta ahora (opcional)</span>
        <input className="field num" inputMode="numeric" value={drops} disabled={!played} placeholder="0" onChange={(e) => setDrops(e.target.value)} />
      </label>
      <p className="mt-3 text-xs text-muted">Simulación con desempate por Op Win %. No conoce los resultados del resto de mesas, así que es una estimación.</p>
    </>
  )
}

function Rows({ rows }: { rows: { label: string; value: number }[] }) {
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_72px_52px] items-center gap-2 text-sm">
          <span className="truncate">{r.label}</span>
          <span className="block h-1.5 rounded-full bg-line" aria-hidden>
            <span className="block h-full rounded-full bg-sky-500" style={{ width: `${r.value * 100}%` }} />
          </span>
          <span className="num text-right font-semibold">{chance(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}

function WinSlider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <label className="mt-4 block">
      <span className="label">
        {label}: <span className="num">{value} %</span>
      </span>
      <input type="range" className="w-full" min={10} max={90} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}
