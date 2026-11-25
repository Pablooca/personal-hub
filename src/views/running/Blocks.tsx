import { useId, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, BookmarkPlus, Plus, Trash2, Type, X } from 'lucide-react'
import { Button, Check, cx } from '../../components/ui'
import { fmtDuration, fmtGap, fmtKm, fmtPace } from '../../lib/running'
import {
  BLOCK_LABELS, MAIN_KINDS, SECTIONS, SECTION_LABELS, blockPace, blockTime, clock, core, estimate, fmtAmount, fmtSeconds, formatBlock, formatWorkout, newBlock, parseAmount, parseRecovery,
  parseTarget, parseWorkout, ensureSections, repsDone, sectionOf, splitPace, type Section,
} from '../../lib/workout'
import type { BlockKind, RunBlock, RunType, WorkoutBlock } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'

// ------------------------------------------------------------------- drafts
interface Draft {
  id: number
  kind: BlockKind
  reps: string
  amount: string
  recovery: string
  targetKind: 'time' | 'pace'
  target: string
  /** Hills: recovery at the top and the way down. */
  mid: string
  down: string
}

const toDraft = (b: WorkoutBlock, id: number): Draft => ({
  id,
  kind: b.kind,
  reps: b.reps_max && b.reps_max > b.reps ? `${b.reps}-${b.reps_max}` : String(b.reps),
  amount: fmtAmount(b),
  recovery: b.recovery_s ? fmtSeconds(b.recovery_s) : '',
  targetKind: b.target_kind ?? (b.unit === 'm' && b.reps > 1 ? 'time' : 'pace'),
  target: b.target_s ? clock(b.target_s) : '',
  mid: b.hill?.recovery_s ? fmtSeconds(b.hill.recovery_s) : '',
  down: b.hill ? fmtAmount({ unit: b.unit, amount: b.hill.down }) : '',
})

const repsOf = (t: string): [number, number | null] | null => {
  const m = t.trim().match(/^(\d{1,2})(?:\s*[-–a]\s*(\d{1,2}))?$/)
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : null
  return a < 1 || (b !== null && b < a) ? null : [a, b !== null && b > a ? b : null]
}

function toBlock(d: Draft): WorkoutBlock | null {
  const amount = parseAmount(d.amount)
  const reps = sectionOf(d) === 'main' ? repsOf(d.reps) : ([1, null] as [number, null])
  const rec = d.recovery.trim() ? parseRecovery(d.recovery) : null
  const target = d.target.trim() ? parseTarget(d.target) : null
  if (!amount || !reps || (d.recovery.trim() && !rec) || (d.target.trim() && !target)) return null
  if (d.kind === 'hills') {
    const down = parseAmount(d.down)
    const mid = d.mid.trim() ? parseRecovery(d.mid) : null
    if (!down || down.unit !== amount.unit || (d.mid.trim() && !mid)) return null
    return { kind: 'hills', reps: reps[0], reps_max: reps[1], ...amount, recovery_s: (reps[1] ?? reps[0]) > 1 ? rec : null, target_kind: null, target_s: null, hill: { recovery_s: mid, down: down.amount } }
  }
  // "Time per rep" makes no sense for a block measured in time.
  const kind = amount.unit === 's' ? 'pace' : d.targetKind
  return { kind: d.kind, reps: reps[0], reps_max: reps[1], ...amount, recovery_s: (reps[1] ?? reps[0]) > 1 ? rec : null, target_kind: target ? kind : null, target_s: target }
}

/**
 * Warm-up · main part · cool-down. Calls `onChange(null)` while something is
 * invalid or a part is missing. Remount (via `key`) to load another structure.
 */
export function BlocksEditor({ initial, onChange, easy }: { initial: WorkoutBlock[]; onChange: (b: WorkoutBlock[] | null) => void; easy: number }) {
  const toast = useToast()
  const next = useRef(initial.length)
  const [rows, setRows] = useState<Draft[]>(() => initial.map(toDraft))
  const [asText, setAsText] = useState<string | null>(null)

  function commit(list: Draft[]) {
    setRows(list)
    const blocks = SECTIONS.flatMap((s) => list.filter((d) => sectionOf(d) === s)).map(toBlock)
    const ok = blocks.every((b) => b !== null) && SECTIONS.every((s) => list.some((d) => sectionOf(d) === s))
    onChange(ok ? (blocks as WorkoutBlock[]) : null)
  }
  const set = (id: number, patch: Partial<Draft>) =>
    commit(
      rows.map((r) => {
        if (r.id !== id) return r
        // Turning a block into (or out of) hill reps starts from sensible values.
        if (patch.kind && patch.kind !== r.kind && (patch.kind === 'hills' || r.kind === 'hills')) return toDraft({ ...newBlock(patch.kind), reps: repsOf(r.reps)?.[0] ?? 1, reps_max: repsOf(r.reps)?.[1] ?? null }, id)
        return { ...r, ...patch }
      }),
    )
  const add = (kind: BlockKind) => commit([...rows, toDraft(newBlock(kind), next.current++)])
  function move(id: number, dir: -1 | 1) {
    const s = sectionOf(rows.find((r) => r.id === id)!)
    const same = rows.filter((r) => sectionOf(r) === s)
    const i = same.findIndex((r) => r.id === id)
    if (!same[i + dir]) return
    ;[same[i], same[i + dir]] = [same[i + dir], same[i]]
    commit(SECTIONS.flatMap((x) => (x === s ? same : rows.filter((r) => sectionOf(r) === x))))
  }
  function applyText() {
    const r = parseWorkout(asText ?? '')
    if (r.errors.length) return toast('error', r.errors[0])
    if (!r.blocks.length) return
    commit(ensureSections(r.blocks).map((b) => toDraft(b, next.current++)))
    setAsText(null)
  }

  const valid = rows.map(toBlock)
  const total = valid.every((b) => b) ? estimate(valid as WorkoutBlock[], easy) : null

  return (
    <div className="space-y-3">
      {SECTIONS.map((s) => {
        const list = rows.filter((r) => sectionOf(r) === s)
        return (
          <section key={s} className={cx('rounded-xl border p-3', s === 'main' ? 'border-accent/40 bg-accent/5' : 'border-line')}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{SECTION_LABELS[s]}</h4>
              {s !== 'main' && (
                <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-accent hover:underline" onClick={() => add(s)}>
                  <Plus className="size-3.5" /> Añadir
                </button>
              )}
            </div>
            <div className="space-y-2">
              {list.map((d, i) => (
                <BlockRow key={d.id} d={d} section={s} first={i === 0} last={i === list.length - 1} removable={list.length > 1} onChange={(p) => set(d.id, p)} onMove={(dir) => move(d.id, dir)} onRemove={() => commit(rows.filter((r) => r.id !== d.id))} />
              ))}
              {!list.length && <p className="text-sm text-amber-800 dark:text-amber-300">Esta parte es obligatoria: añade un bloque.</p>}
            </div>
            {s === 'main' && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MAIN_KINDS.map((k) => (
                  <Button key={k} type="button" size="sm" onClick={() => add(k)}>
                    <Plus className="size-3.5" /> {BLOCK_LABELS[k]}
                  </Button>
                ))}
              </div>
            )}
          </section>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">
          {total ? (
            <>
              Total estimado: <span className="num font-semibold text-fg">{fmtDuration(total.seconds)}</span> · <span className="num font-semibold text-fg">{fmtKm(total.km)} km</span>
            </>
          ) : (
            'Revisa los campos marcados.'
          )}
        </span>
        <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-accent hover:underline" onClick={() => setAsText(asText === null ? formatWorkout(valid.filter((b): b is WorkoutBlock => b !== null)) : null)}>
          <Type className="size-3.5" /> Escribir como texto
        </button>
      </div>
      {asText !== null && (
        <div className="space-y-2">
          <textarea className="field min-h-20 text-sm" aria-label="Estructura como texto" value={asText} onChange={(e) => setAsText(e.target.value)} placeholder="5 min cal + 4x30s cortas rec 30s + 4x30s prog + 5-6x800 en 4:30 rec 3 + 5 min enf" />
          <p className="text-xs text-muted">«en 4:30» es el tiempo de cada serie; «a 4:30» es ritmo por km. Colina: «6x15s subida, rec 1 min, 15s bajada».</p>
          <Button type="button" size="sm" onClick={applyText}>
            Aplicar texto
          </Button>
        </div>
      )}
    </div>
  )
}

function BlockRow({ d, section, first, last, removable, onChange, onMove, onRemove }: { d: Draft; section: Section; first: boolean; last: boolean; removable: boolean; onChange: (p: Partial<Draft>) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void }) {
  const id = useId()
  const main = section === 'main'
  const hills = d.kind === 'hills'
  const amount = parseAmount(d.amount)
  const bad = {
    reps: main && !repsOf(d.reps),
    amount: !amount,
    recovery: d.recovery.trim() !== '' && !parseRecovery(d.recovery),
    target: d.target.trim() !== '' && !parseTarget(d.target),
    mid: d.mid.trim() !== '' && !parseRecovery(d.mid),
    down: hills && (!parseAmount(d.down) || parseAmount(d.down)?.unit !== amount?.unit),
  }
  const block = toBlock(d)
  const several = main && (repsOf(d.reps)?.[1] ?? repsOf(d.reps)?.[0] ?? 1) > 1
  const timeTarget = d.targetKind === 'time' && amount?.unit !== 's'
  const other = block?.target_s ? (timeTarget ? blockPace(block) : blockTime(block)) : null
  const field = (k: keyof typeof bad) => cx('field num', bad[k] && 'border-rose-500')

  return (
    <div className="rounded-lg border border-line bg-surface p-2.5">
      {main && (
        <div className="mb-2 flex items-center gap-1">
          <select className="field flex-1 font-medium" aria-label="Tipo de bloque" value={d.kind} onChange={(e) => onChange({ kind: e.target.value as BlockKind })}>
            {MAIN_KINDS.map((k) => (
              <option key={k} value={k}>
                {BLOCK_LABELS[k]}
              </option>
            ))}
          </select>
          <IconBtn label="Subir bloque" disabled={first} onClick={() => onMove(-1)} icon={ArrowUp} />
          <IconBtn label="Bajar bloque" disabled={last} onClick={() => onMove(1)} icon={ArrowDown} />
          <IconBtn label="Quitar bloque" disabled={!removable} onClick={onRemove} icon={Trash2} />
        </div>
      )}
      <div className="flex items-end gap-2">
        {main && (
          <label className="w-16 shrink-0">
            <span className="label">Reps</span>
            <input className={field('reps')} value={d.reps} inputMode="text" onChange={(e) => onChange({ reps: e.target.value })} placeholder="5-6" />
          </label>
        )}
        <label className="min-w-0 flex-1">
          <span className="label">{hills ? 'Subida' : main ? 'Cada una' : 'Duración o distancia'}</span>
          <input className={field('amount')} value={d.amount} onChange={(e) => onChange({ amount: e.target.value })} placeholder={hills ? '15 s' : '800 m · 30 s · 5 min'} />
        </label>
        {hills && (
          <>
            <label className="min-w-0 flex-1">
              <span className="label">Recup.</span>
              <input className={field('mid')} aria-label="Recuperación entre subida y bajada" value={d.mid} onChange={(e) => onChange({ mid: e.target.value })} placeholder="1 min" />
            </label>
            <label className="min-w-0 flex-1">
              <span className="label">Bajada</span>
              <input className={field('down')} value={d.down} onChange={(e) => onChange({ down: e.target.value })} placeholder="15 s" />
            </label>
          </>
        )}
        {several && !hills && (
          <label className="min-w-0 flex-1">
            <span className="label">Recuperación</span>
            <input className={field('recovery')} value={d.recovery} onChange={(e) => onChange({ recovery: e.target.value })} placeholder="3 min" />
          </label>
        )}
        {!main && removable && <IconBtn label="Quitar bloque" onClick={onRemove} icon={Trash2} />}
      </div>
      {hills && several && (
        <label className="mt-2 block">
          <span className="label">Descanso entre repeticiones (opcional)</span>
          <input className={field('recovery')} value={d.recovery} onChange={(e) => onChange({ recovery: e.target.value })} placeholder="Sin descanso extra" />
        </label>
      )}
      {main && !hills && (
        <div className="mt-2 flex items-end gap-2">
          <label className="min-w-0 flex-1" htmlFor={`${id}-t`}>
            <span className="label">Objetivo</span>
            <input id={`${id}-t`} className={field('target')} value={d.target} onChange={(e) => onChange({ target: e.target.value })} placeholder={several ? 'Opcional: 4:30' : 'Opcional'} />
          </label>
          <select className="field w-36 shrink-0" aria-label="El objetivo es" value={timeTarget ? 'time' : 'pace'} disabled={amount?.unit === 's'} onChange={(e) => onChange({ targetKind: e.target.value as 'time' | 'pace' })}>
            <option value="time">{several ? 'por serie' : 'en total'}</option>
            <option value="pace">min/km</option>
          </select>
        </div>
      )}
      {other !== null && <p className="mt-1.5 text-xs text-muted">{timeTarget ? `= ${fmtPace(other)} min/km` : `= ${fmtDuration(other)} ${several ? 'por serie' : 'en total'}`}</p>}
    </div>
  )
}

const IconBtn = ({ label, icon: Icon, ...p }: { label: string; icon: typeof X; onClick: () => void; disabled?: boolean }) => (
  <button type="button" aria-label={label} title={label} {...p} className="grid size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-surface-2 hover:text-fg disabled:opacity-30">
    <Icon className="size-4" />
  </button>
)

// ----------------------------------------------------------------- templates
export function Templates({ type, current, onApply }: { type: RunType; current: WorkoutBlock[] | null; onApply: (b: WorkoutBlock[], type: RunType) => void }) {
  const { data, create, remove } = useData()
  const toast = useToast()
  const [naming, setNaming] = useState<string | null>(null)
  const list = data.run_workouts
  const same = list.find((w) => current && formatWorkout(w.blocks) === formatWorkout(current))

  async function save() {
    const name = naming?.trim()
    if (!name || !current) return
    setNaming(null)
    if (await create('run_workouts', { name, type, blocks: current })) toast('success', 'Plantilla guardada')
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {list.length > 0 && (
        <select
          className="field min-w-0 flex-1 basis-44"
          aria-label="Aplicar plantilla"
          value={same?.id ?? ''}
          onChange={(e) => {
            const w = list.find((o) => o.id === e.target.value)
            if (w) onApply(ensureSections(w.blocks), w.type)
          }}
        >
          <option value="">Usar una plantilla…</option>
          {list.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        )}
        {same ? (
          <Button key="del" type="button" variant="danger" onClick={() => void remove('run_workouts', same.id).then(() => toast('success', 'Plantilla eliminada'))} aria-label="Eliminar plantilla">
            <Trash2 className="size-4" />
          </Button>
        ) : (
          <Button key="save" type="button" title="Guardar como plantilla" disabled={!current} onClick={() => setNaming(naming === null ? '' : null)}>
            <BookmarkPlus className="size-4" /> <span className={cx(list.length > 0 && 'max-sm:sr-only')}>Guardar como plantilla</span>
          </Button>
        )}
      </div>
      {naming !== null && (
        <div className="flex gap-2">
          <input
            className="field"
            aria-label="Nombre de la plantilla"
            placeholder="Nombre de la plantilla"
            maxLength={120}
            autoFocus
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              void save()
            }}
          />
          <Button type="button" variant="primary" disabled={!naming.trim()} onClick={() => void save()}>
            Guardar
          </Button>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------- display
/** Read-only summary grouped by part. */
export function StructureSummary({ blocks, className }: { blocks: readonly WorkoutBlock[]; className?: string }) {
  if (!blocks.length) return null
  return (
    <dl className={cx('space-y-0.5 text-xs', className)}>
      {SECTIONS.map((s) => {
        const list = blocks.filter((b) => sectionOf(b) === s)
        if (!list.length) return null
        return (
          <div key={s} className="flex gap-2">
            <dt className="w-24 shrink-0 text-faint">{SECTION_LABELS[s]}</dt>
            <dd className="min-w-0 text-muted">{list.map((b) => (s === 'main' ? formatBlock(b) : fmtAmount(b))).join(' + ')}</dd>
          </div>
        )
      })}
    </dl>
  )
}

// ----------------------------------------------------------------- recording
/** Tick each block and note the time of every rep of the main part. */
export function Recorder({ blocks, onChange }: { blocks: RunBlock[]; onChange: (b: RunBlock[]) => void }) {
  const timed = new Set(core(blocks))
  const set = (i: number, patch: Partial<RunBlock>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  return (
    <div className="space-y-3">
      {SECTIONS.map((s) => (
        <section key={s} className={cx('rounded-xl border p-3', s === 'main' ? 'border-accent/40 bg-accent/5' : 'border-line')}>
          <h4 className="mb-2 text-sm font-semibold">{SECTION_LABELS[s]}</h4>
          <div className="space-y-3">
            {blocks.map((b, i) =>
              sectionOf(b) !== s ? null : (
                <div key={i}>
                  <div className="flex min-h-9 items-center gap-2.5">
                    <Check checked={b.done} onChange={(done) => set(i, { done })} label={`Hecho: ${formatBlock(b)}`} />
                    <span className={cx('text-sm', !b.done && 'text-muted line-through')}>
                      {s === 'main' && <span className="font-medium">{BLOCK_LABELS[b.kind]}: </span>}
                      {s !== 'main' ? fmtAmount(b) : b.kind === 'hills' ? formatBlock(b) : formatBlock({ ...b, kind: 'main' }).replace(/ series\b/, '')}
                    </span>
                  </div>
                  {b.kind === 'hills' && b.done && <RepsDone block={b} onChange={(reps_done) => set(i, { reps_done })} />}
                  {timed.has(b) && b.done && <Splits key={b.splits.length} block={b} onChange={(splits) => set(i, { splits })} />}
                </div>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

function RepsDone({ block: b, onChange }: { block: RunBlock; onChange: (n: number) => void }) {
  const n = repsDone(b)
  const goal = b.reps_max && b.reps_max > b.reps ? `${b.reps}–${b.reps_max}` : String(b.reps)
  return (
    <div className="mt-1 flex items-center gap-3 text-sm">
      <div className="flex items-center rounded-lg border border-line bg-surface">
        <button type="button" aria-label="Una repetición menos" disabled={n <= 1} onClick={() => onChange(n - 1)} className="grid size-10 place-items-center rounded-l-lg hover:bg-surface-2 disabled:opacity-30">
          −
        </button>
        <span className="num w-10 text-center font-semibold" aria-live="polite">
          {n}
        </span>
        <button type="button" aria-label="Una repetición más" disabled={n >= 99} onClick={() => onChange(n + 1)} className="grid size-10 place-items-center rounded-r-lg hover:bg-surface-2">
          +
        </button>
      </div>
      <span className={cx(n < b.reps ? 'text-amber-800 dark:text-amber-300' : 'text-muted')}>de {goal} repeticiones</span>
    </div>
  )
}

function Splits({ block: b, onChange }: { block: RunBlock; onChange: (s: (number | null)[]) => void }) {
  const [text, setText] = useState(() => b.splits.map((s) => (s ? clock(s) : Number.isNaN(s) ? '?' : '')))
  const perRep = b.unit === 'm'
  const target = perRep ? blockTime(b) : blockPace(b)
  const goal = blockPace(b)
  /** null = empty · NaN = written but not valid (the run can't be saved until it is fixed). */
  const parse = (t: string): number | null => {
    if (!t.trim()) return null
    const v = parseTarget(t)
    const p = v ? splitPace(b, v) : 0
    return v && p >= 100 && p <= 1500 ? v : Number.NaN
  }
  function commit(list: string[]) {
    setText(list)
    onChange(list.map(parse))
  }
  const values = text.map(parse).filter((v): v is number => Boolean(v))
  const avg = values.length ? values.reduce((a, v) => a + splitPace(b, v), 0) / values.length : null
  const several = text.length > 1
  const fill = text.find((t) => parse(t)) ?? (target ? clock(target) : '')

  return (
    <div className="mt-1.5">
      <div className={cx('grid gap-2', several ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-1 sm:grid-cols-2')}>
        {text.map((t, i) => {
          const v = parse(t)
          const off = v && goal ? splitPace(b, v) / goal - 1 : null
          return (
            <label key={i}>
              <span className="label">
                {several ? `${i + 1}${i + 1 > b.reps ? ' (opc.)' : ''}` : perRep ? 'Tiempo del bloque' : 'Ritmo del bloque (min/km)'}
              </span>
              <input
                className={cx('field num', several && 'px-2 text-center', t.trim() && !v && 'border-rose-500')}
                aria-invalid={Boolean(t.trim()) && !v}
                aria-label={several ? `Serie ${i + 1}` : 'Bloque principal'}
                value={t}
                placeholder={target ? clock(target) : perRep ? (several ? 'm:ss' : 'h:mm:ss o mm:ss') : 'min/km'}
                onChange={(e) => commit(text.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {off !== null && several && <span className={cx('mt-0.5 block text-center font-mono text-[10px]', off > 0.04 ? 'text-amber-800 dark:text-amber-300' : 'text-faint')}>{off === 0 ? '=' : `${off > 0 ? '+' : '−'}${fmtGap(splitPace(b, v!) - goal!)}/km`}</span>}
            </label>
          )
        })}
      </div>
      {text.some((t) => Number.isNaN(parse(t))) && <p className="mt-1.5 text-xs text-rose-700 dark:text-rose-400">{perRep ? `Ese tiempo no cuadra con ${fmtAmount(b)}. Escríbelo como mm:ss o h:mm:ss (por ejemplo, 1:25:26).` : 'Escribe el ritmo como m:ss por km.'}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {several && (
          <>
            {fill && (
              <button type="button" className="min-h-8 font-medium text-accent hover:underline" onClick={() => commit(text.map((t, i) => (t.trim() || i >= b.reps ? t : fill)))}>
                Rellenar vacías con {fill}
              </button>
            )}
            <button type="button" className="min-h-8 font-medium text-accent hover:underline" onClick={() => commit([...text, ''])}>
              + Otra serie
            </button>
          </>
        )}
        {avg !== null && (
          <span className="text-muted">
            Media <span className="num font-semibold text-fg">{perRep && several ? `${fmtDuration((avg * b.amount) / 1000)} · ` : ''}{fmtPace(avg)}/km</span>
            {several && ` · ${values.length} de ${b.reps_max && b.reps_max > b.reps ? `${b.reps}–${b.reps_max}` : b.reps}`}
          </span>
        )}
      </div>
    </div>
  )
}
