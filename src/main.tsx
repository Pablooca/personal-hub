import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ToastProvider } from './state/toast'

// A tab opened before a deploy asks for files that no longer exist: reload once to get the new version.
window.addEventListener('vite:preloadError', (e) => {
  if (!navigator.onLine) return
  try {
    const last = Number(sessionStorage.getItem('ph-reloaded') ?? 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem('ph-reloaded', String(Date.now()))
  } catch {
    return
  }
  e.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
