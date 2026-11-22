import { useEffect, useState, type ReactNode } from 'react'
import {
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
import { Button, cx } from './ui'
import type { Theme } from '../state/theme'

export type ViewId = 'overview' | 'calendar' | 'projects' | 'tasks' | 'hours' | 'finance'

export const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'calendar', label: 'Agenda', icon: CalendarDays },
  { id: 'projects', label: 'Proyectos', icon: FolderKanban },
  { id: 'tasks', label: 'Tareas', icon: KanbanSquare },
  { id: 'hours', label: 'Horas', icon: Clock },
  { id: 'finance', label: 'Finanzas', icon: Wallet },
]

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
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  return (
    <div className="flex min-h-full flex-col">
      {demo && (
        <div className="sticky top-0 z-40 flex items-center justify-center gap-3 border-b border-amber-500/25 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <FlaskConical className="size-3.5 shrink-0" />
          <span className="truncate">
            <span className="font-semibold">Modo demo</span>
            <span className="hidden sm:inline"> — Los cambios se guardan localmente</span>
          </span>
          <button onClick={onResetDemo} className="inline-flex items-center gap-1 underline-offset-2 hover:underline" title="Restablecer datos de la demo">
            <RotateCcw className="size-3" />
            <span className="hidden sm:inline">Restablecer</span>
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

          <nav className="flex-1 space-y-0.5 p-2">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                title={collapsed ? label : undefined}
                className={cx(
                  'flex h-9 w-full items-center gap-2.5 rounded-lg text-sm transition',
                  collapsed ? 'justify-center' : 'px-3',
                  view === id ? 'bg-surface-2 font-semibold text-fg ring-1 ring-line' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <Icon className={cx('size-4 shrink-0', view === id && 'text-accent')} />
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
            <div className={cx('flex gap-1', collapsed ? 'flex-col items-center' : 'items-center')}>
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
          <header className="flex h-12 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
            <div className="flex items-center gap-2">
              <Logo className="size-6" />
              <span className="text-sm font-semibold">{NAV.find((n) => n.id === view)?.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Cambiar tema">
                {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Cerrar sesión">
                <LogOut className="size-4" />
              </Button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-5 pb-28 sm:px-6 md:pb-10 lg:px-8">{children}</main>
        </div>
      </div>

      {/* ---------------------------------------------- mobile bottom nav */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-md md:hidden">
        <div className="grid grid-cols-6">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={cx('flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-medium', view === id ? 'text-accent' : 'text-muted')}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
