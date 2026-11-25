import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from './ui'

/**
 * Keeps one broken view from blanking the whole app. Reset it by changing `resetKey`
 * (e.g. the current view id) or with the "Reintentar" button.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: Error | null; key?: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card mx-auto mt-10 max-w-lg p-6 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="size-4 text-rose-500" /> Algo ha fallado en esta sección
        </h2>
        <p className="mt-2 font-mono text-xs break-words text-rose-700 dark:text-rose-400">{this.state.error.message}</p>
        <p className="mt-3 text-muted">El resto de la app sigue funcionando. Prueba a reintentar o a recargar la página.</p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => this.setState({ error: null })}>
            <RotateCcw className="size-4" /> Reintentar
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Recargar página
          </Button>
        </div>
      </div>
    )
  }
}
