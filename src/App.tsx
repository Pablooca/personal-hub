import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import { supabase } from './lib/supabase'
import { createLocalRepository, createSupabaseRepository, resetDemoData, type Repository } from './data/repository'
import { DataProvider, useData } from './state/data'
import { useTheme } from './state/theme'
import { Login } from './components/Login'
import { Shell, type ViewId } from './components/Shell'
import { Button } from './components/ui'
import { Overview } from './views/Overview'
import { CalendarView } from './views/Calendar'
import { ProjectsView } from './views/Projects'
import { FinanceView } from './views/Finance'

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
    if (mode.kind === 'supabase' && supabase) await supabase.auth.signOut()
    setMode({ kind: 'login' })
  }, [mode.kind])

  const resetDemo = useCallback(() => {
    resetDemoData()
    setDemoEpoch((n) => n + 1)
  }, [])

  // ------------------------------------------------------------ repository
  const userId = mode.kind === 'supabase' ? mode.session.user.id : null
  const repo = useMemo<Repository | null>(() => {
    if (mode.kind === 'demo') return createLocalRepository()
    if (userId && supabase) return createSupabaseRepository(supabase, userId)
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

  const userLabel = mode.kind === 'supabase' ? (mode.session.user.email ?? 'Signed in') : 'demo@personal-hub.local'

  return (
    <DataProvider key={`${repo.kind}-${userId ?? 'demo'}-${demoEpoch}`} repo={repo}>
      <Workspace demo={mode.kind === 'demo'} userLabel={userLabel} theme={theme} toggleTheme={toggle} onSignOut={signOut} onResetDemo={resetDemo} />
    </DataProvider>
  )
}

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
      return v && ['overview', 'calendar', 'projects', 'finance'].includes(v) ? v : 'overview'
    } catch {
      return 'overview'
    }
  })
  const { loading, error, reload } = useData()

  const navigate = useCallback((v: ViewId) => {
    setView(v)
    window.scrollTo({ top: 0 })
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <Shell view={view} onNavigate={navigate} {...props}>
      {error ? (
        <div className="card mx-auto mt-10 max-w-lg p-6 text-sm">
          <h2 className="font-semibold">Could not load your data</h2>
          <p className="mt-2 font-mono text-xs text-rose-600 dark:text-rose-400">{error}</p>
          <p className="mt-3 text-muted">
            Make sure you ran <code className="num">supabase/schema.sql</code> in the Supabase SQL Editor.
          </p>
          <Button className="mt-4" onClick={() => void reload()}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <div className="grid h-64 place-items-center text-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <>
          {view === 'overview' && <Overview onNavigate={navigate} />}
          {view === 'calendar' && <CalendarView />}
          {view === 'projects' && <ProjectsView />}
          {view === 'finance' && <FinanceView />}
        </>
      )}
    </Shell>
  )
}
