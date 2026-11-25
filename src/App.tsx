import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import { supabase } from './lib/supabase'
import { clearLocalCopy, createHybridRepository } from './data/hybrid'
import { createLocalRepository, createSupabaseRepository, resetDemoData, type Repository } from './data/repository'
import { DataProvider, useData } from './state/data'
import { NavProvider } from './state/nav'
import { useTheme } from './state/theme'
import { Login } from './components/Login'
import { GlobalDialogs } from './components/GlobalDialogs'
import { NAV, Shell, type ViewId } from './components/Shell'
import { Button } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Overview } from './views/Overview'

// Each section is downloaded the first time it is opened.
const load = {
  calendar: () => import('./views/Calendar'),
  projects: () => import('./views/Projects'),
  finance: () => import('./views/finance/FinanceView'),
  tasks: () => import('./views/Tasks'),
  hours: () => import('./views/Hours'),
  studies: () => import('./views/studies/StudiesView'),
  running: () => import('./views/running/RunningView'),
  pokemon: () => import('./views/pokemon/PokemonView'),
}
const CalendarView = lazy(() => load.calendar().then((m) => ({ default: m.CalendarView })))
const ProjectsView = lazy(() => load.projects().then((m) => ({ default: m.ProjectsView })))
const FinanceView = lazy(() => load.finance().then((m) => ({ default: m.FinanceView })))
const TasksView = lazy(() => load.tasks().then((m) => ({ default: m.TasksView })))
const HoursView = lazy(() => load.hours().then((m) => ({ default: m.HoursView })))
const StudiesView = lazy(() => load.studies().then((m) => ({ default: m.StudiesView })))
const RunningView = lazy(() => load.running().then((m) => ({ default: m.RunningView })))
const PokemonView = lazy(() => load.pokemon().then((m) => ({ default: m.PokemonView })))

type Mode = { kind: 'loading' } | { kind: 'login' } | { kind: 'demo' } | { kind: 'supabase'; session: Session }

const MODE_KEY = 'ph-mode'
const VIEW_KEY = 'ph-view'

const readDemoFlag = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'demo'
  } catch {
    return false
  }
}

export default function App() {
  const { theme, toggle } = useTheme()
  const [mode, setMode] = useState<Mode>(() => (readDemoFlag() ? { kind: 'demo' } : supabase ? { kind: 'loading' } : { kind: 'login' }))
  const [demoEpoch, setDemoEpoch] = useState(0)

  // ------------------------------------------------------------ auth wiring
  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setMode((m) => (m.kind === 'demo' ? m : data.session ? { kind: 'supabase', session: data.session } : { kind: 'login' }))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setMode((m) => {
        if (m.kind === 'demo') return m
        if (!session) return { kind: 'login' }
        // Keep the same object identity for token refreshes of the same user.
        if (m.kind === 'supabase' && m.session.user.id === session.user.id) return m
        return { kind: 'supabase', session }
      })
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const enterDemo = useCallback(() => {
    try {
      localStorage.setItem(MODE_KEY, 'demo')
    } catch {
      /* ignore */
    }
    setMode({ kind: 'demo' })
  }, [])

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem(MODE_KEY)
    } catch {
      /* ignore */
    }
    if (mode.kind === 'supabase' && supabase) {
      clearLocalCopy(mode.session.user.id)
      await supabase.auth.signOut()
      clearLocalCopy(mode.session.user.id)
    }
    setMode({ kind: 'login' })
  }, [mode])

  const resetDemo = useCallback(() => {
    resetDemoData()
    setDemoEpoch((n) => n + 1)
  }, [])

  // ------------------------------------------------------------ repository
  const userId = mode.kind === 'supabase' ? mode.session.user.id : null
  const repo = useMemo<Repository | null>(() => {
    if (mode.kind === 'demo') return createLocalRepository()
    if (userId && supabase) return createHybridRepository(createSupabaseRepository(supabase, userId), userId)
    return null
    // demoEpoch forces a fresh local repository after a reset.
  }, [mode.kind, userId, demoEpoch])

  if (mode.kind === 'loading') {
    return (
      <div className="grid h-full place-items-center text-muted">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (!repo) return <Login onDemo={enterDemo} theme={theme} toggleTheme={toggle} />

  const userLabel = mode.kind === 'supabase' ? (mode.session.user.email ?? 'Sesión iniciada') : 'demo@personal-hub.local'

  return (
    <DataProvider key={`${repo.kind}-${userId ?? 'demo'}-${demoEpoch}`} repo={repo}>
      <Workspace demo={mode.kind === 'demo'} userLabel={userLabel} theme={theme} toggleTheme={toggle} onSignOut={signOut} onResetDemo={resetDemo} />
    </DataProvider>
  )
}

const Spinner = () => (
  <div className="grid h-64 place-items-center text-muted" role="status" aria-label="Cargando">
    <Loader2 className="size-5 animate-spin" />
  </div>
)

function Workspace(props: {
  demo: boolean
  userLabel: string
  theme: ReturnType<typeof useTheme>['theme']
  toggleTheme: () => void
  onSignOut: () => void
  onResetDemo: () => void
}) {
  const [view, setView] = useState<ViewId>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY) as ViewId | null
      return v && NAV.some((n) => n.id === v) ? v : 'overview'
    } catch {
      return 'overview'
    }
  })
  const { loading, error, reload, missingTables } = useData()
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)

  const navigate = useCallback((v: ViewId) => {
    setView(v)
    window.scrollTo({ top: 0 })
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignore */
    }
  }, [])

  const openProject = useCallback(
    (id: string) => {
      setOpenProjectId(id)
      navigate('projects')
    },
    [navigate],
  )
  useEffect(() => {
    document.title = `${NAV.find((n) => n.id === view)?.label ?? 'Personal Hub'} · Personal Hub`
  }, [view])

  // Once idle, fetch the rest so switching is instant (and works if the connection drops).
  useEffect(() => {
    const t = setTimeout(() => Object.values(load).forEach((get) => get().catch(() => {})), 3000)
    return () => clearTimeout(t)
  }, [])

  const clearOpenProject = useCallback(() => setOpenProjectId(null), [])

  return (
    <NavProvider onNavigate={navigate}>
    <Shell view={view} onNavigate={navigate} {...props}>
      {error ? (
        <div className="card mx-auto mt-10 max-w-lg p-6 text-sm">
          <h2 className="font-semibold">No se han podido cargar tus datos</h2>
          <p className="mt-2 font-mono text-xs text-rose-700 dark:text-rose-400">{error}</p>
          <p className="mt-3 text-muted">
            Comprueba que has ejecutado <code className="num">supabase/schema.sql</code> en el SQL Editor de Supabase.
          </p>
          <Button className="mt-4" onClick={() => void reload()}>
            Reintentar
          </Button>
        </div>
      ) : loading ? (
        <Spinner />
      ) : (
        <>
          {missingTables.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              <strong>Falta actualizar la base de datos.</strong> No existen todavía:{' '}
              <span className="font-mono text-xs">{missingTables.join(', ')}</span>. Vuelve a ejecutar{' '}
              <code className="font-mono text-xs">supabase/schema.sql</code> en el SQL Editor de Supabase y pulsa{' '}
              <button className="font-semibold underline" onClick={() => void reload()}>
                recargar
              </button>
              .
            </div>
          )}
          <ErrorBoundary resetKey={view}>
            <Suspense fallback={<Spinner />}>
            {view === 'overview' && <Overview onNavigate={navigate} onOpenProject={openProject} />}
            {view === 'calendar' && <CalendarView />}
            {view === 'projects' && <ProjectsView openProjectId={openProjectId} onOpenHandled={clearOpenProject} />}
            {view === 'tasks' && <TasksView onOpenProject={openProject} />}
            {view === 'studies' && <StudiesView />}
            {view === 'hours' && <HoursView />}
            {view === 'finance' && <FinanceView />}
            {view === 'running' && <RunningView />}
            {view === 'pokemon' && <PokemonView />}
            </Suspense>
          </ErrorBoundary>
        </>
      )}
    </Shell>
    {!loading && !error && <GlobalDialogs />}
    </NavProvider>
  )
}
