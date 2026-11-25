import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  CloudOff,
  Database,
  Footprints,
  GraduationCap,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Swords,
  CalendarDays,
  Clock,
  FolderKanban,
  FlaskConical,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Sun,
  Wallet,
} from 'lucide-react'
import { Logo } from './Logo'
import { useData } from '../state/data'
import { DataModal } from './DataModal'
import { QuickAdd } from './QuickAdd'
import { SearchPalette } from './SearchPalette'
import { Button, Modal, cx } from './ui'
import type { Theme } from '../state/theme'

export type ViewId = 'overview' | 'calendar' | 'projects' | 'tasks' | 'studies' | 'hours' | 'finance' | 'running' | 'pokemon'

export const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'calendar', label: 'Agenda', icon: CalendarDays },
  { id: 'projects', label: 'Proyectos', icon: FolderKanban },
  { id: 'tasks', label: 'Tareas', icon: KanbanSquare },
  { id: 'studies', label: 'Estudios', icon: GraduationCap },
  { id: 'hours', label: 'Horas', icon: Clock },
  { id: 'finance', label: 'Finanzas', icon: Wallet },
  { id: 'running', label: 'Running', icon: Footprints },
  { id: 'pokemon', label: 'Pokémon', icon: Swords },
]

/** One hue per module: active icon and page header. Text never depends on it. */
export const MODULE_COLORS: Record<ViewId, string> = {
  overview: '#0284c7', calendar: '#7c3aed', projects: '#0d9488', tasks: '#2563eb', studies: '#9333ea', hours: '#d97706', finance: '#059669', running: '#e11d48', pokemon: '#ca8a04',
}

/** Shortcuts of the phone bar (the rest live behind "Más"). Each person picks theirs. */
const DEFAULT_BAR: ViewId[] = ['overview', 'calendar', 'tasks', 'finance']
const BAR_KEY = 'ph-mobile-bar'
function readBar(): ViewId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BAR_KEY) ?? 'null') as unknown
    const ok = Array.isArray(raw) ? (raw.filter((v) => NAV.some((n) => n.id === v)) as ViewId[]) : []
    return ok.length === 4 ? ok : DEFAULT_BAR
  } catch {
    return DEFAULT_BAR
  }
}

interface Props {
  view: ViewId
  onNavigate: (v: ViewId) => void
  demo: boolean
  userLabel: string
  theme: Theme
  toggleTheme: () => void
  onSignOut: () => void
  onResetDemo: () => void
  children: ReactNode
}

const COLLAPSE_KEY = 'ph-sidebar-collapsed'

export function Shell({ view, onNavigate, demo, userLabel, theme, toggleTheme, onSignOut, onResetDemo, children }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const { offline, pending } = useData()
  const [showData, setShowData] = useState(false)
  const [more, setMore] = useState(false)
  const [bar, setBar] = useState(readBar)
  const [editBar, setEditBar] = useState(false)
  const [adding, setAdding] = useState(false)
  const [searching, setSearching] = useState(false)
  const inMore = !bar.includes(view)
  const current = NAV.find((n) => n.id === view) ?? NAV[0]
  const syncLabel = offline ? 'Sin conexión' : `${pending} sin enviar`
  const waiting = offline || pending > 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function saveBar(next: ViewId[]) {
    setBar(next)
    try {
      localStorage.setItem(BAR_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  return (
    <div className="flex min-h-full flex-col" style={{ '--module': MODULE_COLORS[view] } as CSSProperties}>
      {demo && (
        <div className="sticky top-0 z-40 flex items-center justify-center gap-3 border-b border-amber-500/25 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <FlaskConical className="size-3.5 shrink-0" />
          <span className="truncate">
            <span className="font-semibold">Modo demo</span>
            <span className="hidden sm:inline"> — Los cambios se guardan localmente</span>
          </span>
          <button onClick={onResetDemo} className="inline-flex items-center gap-1 underline-offset-2 hover:underline" title="Restablecer datos de la demo">
            <RotateCcw className="size-3" />
            <span className="max-sm:sr-only">Restablecer</span>
          </button>
          <button onClick={onSignOut} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
            Salir al login
          </button>
        </div>
      )}

      <div className="flex flex-1">
        {/* ---------------------------------------------- desktop sidebar */}
        <aside
          className={cx(
            'sticky hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 md:flex',
            demo ? 'top-[29px] h-[calc(100dvh-29px)]' : 'top-0 h-dvh',
            collapsed ? 'w-[60px]' : 'w-56',
          )}
        >
          <div className={cx('flex h-14 items-center gap-2.5 border-b border-line', collapsed ? 'justify-center' : 'px-4')}>
            <Logo />
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <div className="text-sm font-semibold">Personal Hub</div>
                <div className="font-mono text-[10px] text-faint">LIFE OS</div>
              </div>
            )}
          </div>

          <div className={cx('flex gap-1.5 p-2 pb-0', collapsed && 'flex-col items-center')}>
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label="Añadir"
              title="Añadir"
              className={cx('flex h-9 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-fg transition hover:brightness-110', collapsed ? 'w-9' : 'flex-1')}
            >
              <Plus className="size-4" /> {!collapsed && 'Añadir'}
            </button>
            <button type="button" onClick={() => setSearching(true)} aria-label="Buscar" title="Buscar (⌘K)" className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-muted transition hover:bg-surface-2 hover:text-fg">
              <Search className="size-4" />
            </button>
          </div>
          <nav aria-label="Secciones" className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto p-2">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                title={collapsed ? label : undefined}
                aria-label={collapsed ? label : undefined}
                aria-current={view === id ? 'page' : undefined}
                className={cx(
                  'flex h-9 w-full items-center gap-2.5 rounded-lg text-sm transition',
                  collapsed ? 'justify-center' : 'px-3',
                  view === id ? 'bg-surface-2 font-semibold text-fg ring-1 ring-line' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <Icon className="size-4 shrink-0" style={view === id ? { color: MODULE_COLORS[id] } : undefined} />
                {!collapsed && label}
              </button>
            ))}
          </nav>

          <div className="space-y-1 border-t border-line p-2">
            {!collapsed && (
              <div className="truncate px-3 pt-1 pb-2 font-mono text-[11px] text-faint" title={userLabel}>
                {userLabel}
              </div>
            )}
            {waiting && (
              <button type="button" onClick={() => setShowData(true)} title={syncLabel} className={cx('flex w-full items-center gap-2 rounded-lg bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200', collapsed ? 'h-8 justify-center' : 'px-3 py-1.5')}>
                <CloudOff className="size-3.5 shrink-0" /> {!collapsed && syncLabel}
              </button>
            )}
            <div className={cx('flex gap-1', collapsed ? 'flex-col items-center' : 'items-center')}>
              <Button variant="ghost" size="icon" onClick={() => setShowData(true)} aria-label="Datos: exportar e importar" title="Exportar e importar datos">
                <Database className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Cambiar tema" title="Cambiar tema">
                {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Cerrar sesión" title={demo ? 'Salir de la demo' : 'Cerrar sesión'}>
                <LogOut className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cx(!collapsed && 'ml-auto')}
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
                title={collapsed ? 'Expandir' : 'Contraer'}
              >
                {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </Button>
            </div>
          </div>
        </aside>

        {/* ---------------------------------------------- main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* mobile top bar */}
          <header className="flex min-h-12 items-center justify-between border-b border-line bg-surface px-4 pt-[env(safe-area-inset-top)] md:hidden">
            <div className="flex items-center gap-2">
              <Logo className="size-6" />
              <span className="text-sm font-semibold">{current.label}</span>
            </div>
            <div className="flex items-center gap-1">
              {waiting && (
                <button type="button" onClick={() => setShowData(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <CloudOff className="size-3.5" /> {syncLabel}
                </button>
              )}
              <button type="button" onClick={() => setSearching(true)} aria-label="Buscar" className="grid size-10 place-items-center rounded-lg text-muted">
                <Search className="size-5" />
              </button>
              <button type="button" onClick={() => setAdding(true)} aria-label="Añadir" className="grid size-9 place-items-center rounded-lg bg-accent text-accent-fg">
                <Plus className="size-5" />
              </button>
            </div>
          </header>

          <main key={view} className="view-in mx-auto w-full max-w-[1400px] flex-1 px-4 pt-5 pb-28 sm:px-6 md:pb-10 lg:px-8">{children}</main>
        </div>
      </div>

      {/* ---------------------------------------------- mobile bottom nav */}
      <nav aria-label="Secciones" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5">
          {bar.map((id) => NAV.find((n) => n.id === id)!).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              aria-current={view === id ? 'page' : undefined}
              className={cx('flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium', view === id ? 'text-accent' : 'text-muted')}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
          <button
            onClick={() => setMore(true)}
            aria-haspopup="dialog"
            aria-label={inMore ? `${current.label}: más secciones` : 'Más secciones'}
            className={cx('flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium', inMore ? 'text-accent' : 'text-muted')}
          >
            {inMore ? <current.icon className="size-5" /> : <MoreHorizontal className="size-5" />}
            {inMore ? current.label : 'Más'}
          </button>
        </div>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="Más">
        <div className="grid grid-cols-3 gap-2">
          {NAV.filter((n) => !bar.includes(n.id)).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMore(false)
                onNavigate(id)
              }}
              className={cx('flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-sm font-medium', view === id ? 'border-accent bg-accent/10' : 'border-line bg-surface-2')}
            >
              <Icon className={cx('size-6', view === id ? 'text-accent' : 'text-muted')} /> {label}
            </button>
          ))}
        </div>
        <ul className="mt-4 divide-y divide-line border-t border-line pb-[env(safe-area-inset-bottom)]">
          {(
            [
              [SlidersHorizontal, 'Elegir los accesos de la barra', () => setEditBar(true)],
              [Database, 'Exportar e importar datos', () => setShowData(true)],
              [theme === 'dark' ? Sun : Moon, theme === 'dark' ? 'Tema claro' : 'Tema oscuro', toggleTheme],
              [LogOut, demo ? 'Salir de la demo' : 'Cerrar sesión', onSignOut],
            ] as const
          ).map(([Icon, label, action]) => (
            <li key={label}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 text-left text-sm"
                onClick={() => {
                  setMore(false)
                  action()
                }}
              >
                <Icon className="size-4 text-muted" /> {label}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
      {editBar && <BarEditor value={bar} onSave={saveBar} onClose={() => setEditBar(false)} />}
      {adding && <QuickAdd onClose={() => setAdding(false)} />}
      {searching && <SearchPalette onClose={() => setSearching(false)} />}
      {showData && <DataModal onClose={() => setShowData(false)} />}
    </div>
  )
}

function BarEditor({ value, onSave, onClose }: { value: ViewId[]; onSave: (v: ViewId[]) => void; onClose: () => void }) {
  const [list, setList] = useState<ViewId[]>(value)
  return (
    <Modal
      open
      onClose={onClose}
      title="Accesos de la barra"
      footer={
        <>
          <span className="mr-auto text-sm text-muted">{list.length} de 4</span>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={list.length !== 4}
            onClick={() => {
              onSave(list)
              onClose()
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">Elige cuatro, en el orden en que quieres verlos. El resto queda en «Más».</p>
      <div className="grid grid-cols-3 gap-2">
        {NAV.map(({ id, label, icon: Icon }) => {
          const at = list.indexOf(id)
          return (
            <button
              key={id}
              type="button"
              aria-pressed={at >= 0}
              disabled={at < 0 && list.length >= 4}
              onClick={() => setList((l) => (at >= 0 ? l.filter((x) => x !== id) : [...l, id]))}
              className={cx('relative flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-sm font-medium disabled:opacity-40', at >= 0 ? 'border-accent bg-accent/10' : 'border-line bg-surface-2')}
            >
              {at >= 0 && <span className="num absolute top-1.5 right-2 text-xs text-accent">{at + 1}</span>}
              <Icon className="size-5 text-muted" /> {label}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

/** On phones the eyebrow is hidden (the top bar already names the section) unless `keep` is set. */
export function PageHeader({ eyebrow, title, actions, keep }: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode; keep?: boolean }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
      <div className="min-w-0">
        {eyebrow && (
          <div className={cx('eyebrow mb-1 flex items-center gap-2', !keep && 'max-sm:hidden')}>
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--module)]" aria-hidden />
            {eyebrow}
          </div>
        )}
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
