import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// --------------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 shadow-sm',
  secondary: 'border border-line bg-surface hover:bg-surface-2 text-fg',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'text-rose-700 dark:text-rose-400 hover:bg-rose-500/10',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'icon' }) {
  return (
    <button
      {...props}
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-2.5 text-xs',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'icon' && 'size-8',
        VARIANTS[variant],
        className,
      )}
    />
  )
}

// ---------------------------------------------------------------------- Card
export function Card({
  title,
  action,
  children,
  className,
  bodyClass,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
}) {
  return (
    <section className={cx('card flex flex-col', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={cx('flex-1', bodyClass ?? 'p-4')}>{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------- ProgressBar
export function ProgressBar({ value, className, tone = 'accent', label = 'Progreso' }: { value: number; className?: string; tone?: 'accent' | 'emerald'; label?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-line', className)} role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cx('h-full rounded-full transition-[width] duration-500', tone === 'emerald' || v === 100 ? 'bg-emerald-500' : 'bg-accent')}
        style={{ width: `${v}%` }}
      />
    </div>
  )
}

// ----------------------------------------------------------------- Segmented
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cx('scrollbar-none inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition pointer-coarse:h-9',
            o.value === value ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// --------------------------------------------------------------------- Badge
export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none', className)}>
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------- Modal
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  full,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** Full screen on phones; almost full screen (96 % × 94 %) on desktop. */
  full?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Parents usually pass an inline function: keep the latest without re-running
  // the effect (which would steal the focus on every parent render).
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    const focusable = () =>
      [...(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? [])].filter((el) => el.offsetParent !== null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close.current()
      if (e.key !== 'Tab') return
      // Keep the keyboard inside the dialog.
      const els = focusable()
      if (!els.length) return
      const first = els[0]
      const last = els[els.length - 1]
      const inside = panel.current?.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // On touch screens focusing a field would pop the keyboard up straight away.
    const field = panel.current?.querySelector<HTMLElement>('input:not([type=file]):not([role=combobox]), textarea, select')
    if (field && window.matchMedia('(pointer: fine)').matches) field.focus()
    else panel.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      before?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className={cx('fixed inset-0 z-50 flex justify-center bg-black/40 backdrop-blur-[2px]', full ? 'items-stretch sm:items-center sm:p-4' : 'items-end sm:items-center sm:p-6')}
      onMouseDown={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          'flex w-full flex-col border-line bg-surface shadow-2xl outline-none',
          full
            ? 'h-dvh sm:h-[94dvh] sm:max-w-[min(1600px,96vw)] sm:rounded-2xl sm:border'
            : cx('max-h-[92dvh] rounded-t-2xl border sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md'),
        )}
      >
        <header className={cx('flex items-center justify-between gap-3 border-b border-line px-5 py-3.5', full && 'pt-[max(0.875rem,env(safe-area-inset-top))]')}>
          <h2 id={titleId} className="min-w-0 text-sm font-semibold">
            {title}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="size-4" />
          </Button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- EmptyState
export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
      {icon}
      {children}
    </div>
  )
}

// --------------------------------------------------------------------- Stat
export function Stat({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: string
  icon?: ReactNode
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <span className="text-faint">{icon}</span>
      </div>
      <div className={cx('num mt-2 text-xl font-semibold sm:text-2xl', tone)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- Checkbox
export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={cx(
        'grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition',
        checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-line-strong hover:border-accent',
      )}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.5l2.2 2.2 4.8-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
    </label>
  )
}
