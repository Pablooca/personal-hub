import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Target } from '../lib/agenda'
import type { ViewId } from '../components/Shell'

/** Opening anything from anywhere: dialogs open on top, pages are navigated to. */
interface NavApi {
  open(t: Target): void
  go(v: ViewId): void
  /** What the global dialogs are showing. */
  dialog: Target | null
  closeDialog(): void
  /** Page target waiting for its view to pick it up. */
  focus: Target | null
  clearFocus(): void
}

const Ctx = createContext<NavApi | null>(null)

const PAGE: Partial<Record<Target['kind'], ViewId>> = { project: 'projects', subject: 'studies', tournament: 'pokemon', deck: 'pokemon', team: 'pokemon', card: 'pokemon', match: 'pokemon' }

export function NavProvider({ onNavigate, children }: { onNavigate: (v: ViewId) => void; children: ReactNode }) {
  const [dialog, setDialog] = useState<Target | null>(null)
  const [focus, setFocus] = useState<Target | null>(null)

  const open = useCallback(
    (t: Target) => {
      const view = PAGE[t.kind]
      if (!view) return setDialog(t)
      setDialog(null)
      setFocus(t)
      onNavigate(view)
    },
    [onNavigate],
  )
  const closeDialog = useCallback(() => setDialog(null), [])
  const clearFocus = useCallback(() => setFocus(null), [])
  const value = useMemo<NavApi>(() => ({ open, go: onNavigate, dialog, closeDialog, focus, clearFocus }), [open, onNavigate, dialog, closeDialog, focus, clearFocus])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNav(): NavApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useNav must be used inside <NavProvider>')
  return v
}

/** Run `onFocus` once when this view is asked to show one of `kinds`. */
export function useFocusTarget(kinds: readonly Target['kind'][], onFocus: (t: Target) => void) {
  const { focus, clearFocus } = useNav()
  useEffect(() => {
    if (!focus || !kinds.includes(focus.kind)) return
    onFocus(focus)
    clearFocus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])
}
