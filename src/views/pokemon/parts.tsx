import { memo, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { cx } from '../../components/ui'
import { spriteUrls } from '../../lib/pokemon/sprites'
import { played, recordText, winRate, type Tally } from '../../lib/pokemon/stats'
import { BY_SLUG, SPECIES, slugName, speciesOf } from './data'

// -------------------------------------------------------------------- Sprite
/** Pokémon sprite with a chain of fallbacks (and the initials as last resort). */
export const Sprite = memo(function Sprite({ slug, size = 36, label, className }: { slug: string; size?: number; label?: string; className?: string }) {
  const urls = useMemo(() => spriteUrls(slug, BY_SLUG.get(slug)?.sprite ?? slug), [slug])
  const [step, setStep] = useState(0)
  useEffect(() => setStep(0), [slug])
  const name = label ?? slugName(slug)
  if (step >= urls.length) {
    return (
      <span
        role="img"
        aria-label={name}
        title={name}
        className={cx('inline-grid shrink-0 place-items-center rounded-full bg-line text-[10px] font-semibold text-muted uppercase', className)}
        style={{ width: size, height: size }}
      >
        {name.slice(0, 2)}
      </span>
    )
  }
  return (
    <img
      src={urls[step]}
      alt={name}
      title={name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setStep((s) => s + 1)}
      className={cx('inline-block shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  )
})

export const SpeciesSprite = ({ species, size, label, className }: { species: string; size?: number; label?: string; className?: string }) => (
  <Sprite slug={speciesOf(species).slug} label={label ?? species} size={size} className={className} />
)

/** One or two icons side by side, as Limitless does. */
export function DeckIcons({ icons, size = 32, label }: { icons: string[]; size?: number; label?: string }) {
  if (!icons.length) return <Sprite slug="substitute" size={size} label={label ?? 'Sin identificar'} />
  return (
    <span className="inline-flex shrink-0 items-center -space-x-1" title={label}>
      {icons.slice(0, 2).map((s) => (
        <Sprite key={s} slug={s} size={size} label={label ? `${label} (${slugName(s)})` : undefined} />
      ))}
    </span>
  )
}

// ------------------------------------------------------------------ Combobox
export interface Option {
  value: string
  label: string
  icon?: ReactNode
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Searchable drop-down. Free text is kept when `free` is set. */
export function Combobox({
  value,
  options,
  onChange,
  placeholder,
  label,
  free,
  className,
}: {
  value: string
  options: Option[]
  onChange: (v: string) => void
  placeholder?: string
  label: string
  free?: boolean
  className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const current = options.find((o) => o.value === value)

  const shown = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return options.slice(0, 80)
    const starts: Option[] = []
    const has: Option[] = []
    for (const o of options) {
      const l = norm(o.label)
      if (l.startsWith(q)) starts.push(o)
      else if (l.includes(q)) has.push(o)
    }
    return [...starts, ...has].slice(0, 80)
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && close()
    document.addEventListener('pointerdown', out)
    return () => document.removeEventListener('pointerdown', out)
  })
  useEffect(() => {
    if (open) list.current?.scrollIntoView({ block: 'nearest' })
  }, [open])
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function close(commitFree = true) {
    if (free && commitFree && query.trim() && query.trim() !== value) onChange(shown.find((o) => norm(o.label) === norm(query.trim()))?.value ?? query.trim())
    setOpen(false)
    setQuery('')
  }
  function choose(o: Option) {
    onChange(o.value)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={box} className={cx('relative', className)}>
      <div className="relative">
        {!open && Boolean(current?.icon) && <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2">{current?.icon}</span>}
        <input
          className={cx('field pr-8', !open && Boolean(current?.icon) && 'pl-10')}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={open && shown[active] ? `${id}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={open ? query : (current?.label ?? value)}
          onFocus={() => {
            setOpen(true)
            setActive(0)
          }}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActive((a) => Math.min(a + 1, shown.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter' && open) {
              e.preventDefault()
              if (shown[active] && (query.trim() || !free)) choose(shown[active])
              else close()
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation() // closes the list, not the dialog around it
              close(false)
            } else if (e.key === 'Tab') close()
          }}
        />
        {value && !open ? (
          <button type="button" onClick={() => onChange('')} aria-label={`Quitar ${label}`} className="absolute inset-y-0 right-0 grid w-8 place-items-center text-faint hover:text-fg">
            <X className="size-3.5" />
          </button>
        ) : (
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-faint" />
        )}
      </div>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="scrollbar-thin absolute inset-x-0 z-30 mt-1 max-h-60 scroll-mb-4 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          {shown.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseEnter={() => setActive(i)}
              className={cx('flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm', i === active && 'bg-surface-2', o.value === value && 'font-semibold')}
            >
              {o.icon}
              <span className="truncate">{o.label}</span>
            </li>
          ))}
          {!shown.length && (
            <li className="px-2 py-2 text-sm text-muted" role="presentation">
              {free && query.trim() ? `Usar «${query.trim()}» (Intro)` : 'Sin resultados'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

// -------------------------------------------------------------- SpritePicker
const DEFAULT_SPRITES = [...SPECIES].filter((s) => /-mega(-[xy])?$/.test(s.slug)).slice(0, 48)

/** Choose one or two representative Pokémon by their sprite. */
export function SpritePicker({ value, onChange, max = 2 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return DEFAULT_SPRITES
    const hits = SPECIES.filter((s) => norm(s.name).includes(q) || s.slug.includes(q))
    return hits.sort((a, b) => Number(norm(b.name).startsWith(q)) - Number(norm(a.name).startsWith(q))).slice(0, 60)
  }, [query])
  const toggle = (slug: string) => onChange(value.includes(slug) ? value.filter((v) => v !== slug) : [...value, slug].slice(-max))

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: max }, (_, i) => (
          <button
            key={i}
            type="button"
            disabled={!value[i]}
            onClick={() => toggle(value[i])}
            aria-label={value[i] ? `Quitar ${slugName(value[i])}` : `Icono ${i + 1} sin elegir`}
            className={cx('grid size-12 place-items-center rounded-lg border', value[i] ? 'border-accent bg-surface' : 'border-dashed border-line-strong text-faint')}
          >
            {value[i] ? <Sprite slug={value[i]} size={40} /> : <span className="text-xs">{i + 1}</span>}
          </button>
        ))}
        <label className="relative min-w-40 flex-1">
          <span className="sr-only">Buscar Pokémon</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <input className="field pl-8" placeholder="Buscar Pokémon…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <div className="scrollbar-thin mt-3 grid max-h-48 grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-1 overflow-y-auto">
        {shown.map((s) => (
          <button
            key={s.slug}
            type="button"
            aria-pressed={value.includes(s.slug)}
            aria-label={s.name}
            title={s.name}
            onClick={() => toggle(s.slug)}
            className={cx('grid aspect-square min-h-12 place-items-center rounded-lg border transition', value.includes(s.slug) ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-surface')}
          >
            <Sprite slug={s.slug} size={38} label={s.name} />
          </button>
        ))}
        {!shown.length && <p className="col-span-full py-4 text-center text-sm text-muted">Ningún Pokémon coincide.</p>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- stats visuals
export const fmtRate = (v: number | null) => (v === null ? '—' : `${Math.round(v)} %`)

/** Win rate bar with its 50 % reference. Text carries the value; colour is only polarity. */
export function WinBar({ label, tally, hint }: { label: ReactNode; tally: Tally; hint?: string }) {
  const rate = winRate(tally)
  const n = played(tally)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1.5" title={hint}>
      <span className="flex min-w-0 items-center gap-2 text-sm">{label}</span>
      <span className="num text-right text-xs text-muted">
        {n ? recordText(tally) : 'sin datos'} <span className="ml-1.5 inline-block w-11 text-sm font-semibold text-fg">{fmtRate(rate)}</span>
      </span>
      <span className="relative col-span-2 block h-1.5 rounded-full bg-line" aria-hidden>
        {rate !== null && <span className={cx('absolute inset-y-0 left-0 rounded-full', rate >= 50 ? 'bg-sky-500' : 'bg-rose-500')} style={{ width: `${Math.max(2, rate)}%` }} />}
        <span className="absolute -inset-y-0.5 left-1/2 w-px bg-line-strong" />
      </span>
    </div>
  )
}

/** Diverging cell: blue above 50 %, red below, neutral at 50 %. */
export function heat(rate: number | null): string | undefined {
  if (rate === null) return undefined
  const d = Math.min(1, Math.abs(rate - 50) / 50)
  if (d < 0.02) return 'color-mix(in oklab, var(--line) 70%, transparent)'
  return `color-mix(in oklab, ${rate > 50 ? '#0ea5e9' : '#f43f5e'} ${Math.round(14 + d * 44)}%, transparent)`
}

export const RESULT_STYLES = {
  win: { label: 'Victoria', short: 'V', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30' },
  loss: { label: 'Derrota', short: 'D', cls: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30' },
  tie: { label: 'Empate', short: 'E', cls: 'bg-surface-2 text-muted border-line-strong' },
  bye: { label: 'Bye', short: 'B', cls: 'bg-surface-2 text-muted border-line-strong' },
} as const

export const FORMAT_LABEL = { bo1: 'BO1', bo3: 'BO3' } as const

/** Two or more big options with no default selected. */
export function Choice<T extends string>({ value, options, onChange, label, invalid }: { value: T | null; options: { value: T; label: ReactNode; hint?: string }[]; onChange: (v: T) => void; label: string; invalid?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('grid gap-2', options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition',
            value === o.value ? 'border-accent bg-accent/10 font-semibold' : invalid ? 'border-amber-500/60 bg-amber-500/5' : 'border-line bg-surface-2 hover:border-line-strong',
          )}
        >
          {o.label}
          {o.hint && <span className="block text-xs font-normal text-muted">{o.hint}</span>}
        </button>
      ))}
    </div>
  )
}
