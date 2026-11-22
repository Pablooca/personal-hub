import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'

type Toast = { id: number; kind: 'success' | 'error'; message: string }

const ToastCtx = createContext<(kind: Toast['kind'], message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 2600)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm shadow-lg shadow-black/5"
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-500" />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              className="text-faint hover:text-fg"
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
              aria-label="Descartar"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
