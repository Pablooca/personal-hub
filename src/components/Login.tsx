import { useState, type FormEvent } from 'react'
import { ArrowRight, Loader2, Lock, Moon, Sparkles, Sun } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { Button } from './ui'
import { Logo } from './Logo'
import type { Theme } from '../state/theme'

export function Login({ onDemo, theme, toggleTheme }: { onDemo: () => void; theme: Theme; toggleTheme: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message)
  }

  return (
    <div className="relative flex min-h-full items-center justify-center px-4 py-12">
      {/* subtle grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />
      <Button variant="ghost" size="icon" className="absolute top-4 right-4" onClick={toggleTheme} aria-label="Cambiar tema">
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-11" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Personal Hub</h1>
          <p className="mt-1 text-sm text-muted">Agenda · Proyectos · Finanzas — tu centro de mando privado.</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6 shadow-xl shadow-black/[0.03]">
          <div>
            <label className="label" htmlFor="email">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="field"
              placeholder="tu@dominio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isSupabaseConfigured}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!isSupabaseConfigured}
            />
          </div>

          {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
          {!isSupabaseConfigured && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              Supabase no está configurado en esta versión. Usa la demo interactiva.
            </p>
          )}

          <Button type="submit" variant="primary" className="w-full" disabled={busy || !isSupabaseConfigured}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            Iniciar sesión
          </Button>

          <div className="flex items-center gap-3 text-[11px] text-faint uppercase">
            <span className="h-px flex-1 bg-line" />
            o
            <span className="h-px flex-1 bg-line" />
          </div>

          <Button type="button" className="group w-full" onClick={onDemo}>
            <Sparkles className="size-4 text-accent" />
            Probar demo interactiva
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Button>
        </form>

        <p className="mt-6 text-center font-mono text-[11px] text-faint">
          Row Level Security · los datos solo son visibles para su propietario
        </p>
      </div>
    </div>
  )
}
