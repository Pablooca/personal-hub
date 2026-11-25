import { useEffect, useRef, useState } from 'react'
import { Maximize2, Pause, Play, RotateCcw } from 'lucide-react'
import { Button, Card, Modal, cx } from '../../components/ui'
import type { MatchFormat } from '../../lib/types'

interface State {
  /** Epoch ms when it ends (running) or null. */
  end: number | null
  /** Seconds left while paused. */
  left: number
  total: number
}
/** Play! Pokémon minimums: 30 min (BO1) and 50 min (BO3). */
const MINUTES: Record<MatchFormat, number> = { bo1: 30, bo3: 50 }

const fmt = (s: number) => `${s < 0 ? '+' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s)) % 60).padStart(2, '0')}`

function beep() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g)
      g.connect(ctx.destination)
      o.frequency.value = 880
      g.gain.setValueAtTime(0.25, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.3)
    })
    setTimeout(() => void ctx.close(), 1500)
  } catch {
    /* no audio */
  }
  navigator.vibrate?.([300, 150, 300])
}

/** Round clock. It keeps counting if you leave the page (the end time is stored). */
export function RoundTimer({ id, format }: { id: string; format: MatchFormat }) {
  const key = `ph-timer-${id}`
  const fresh = (): State => ({ end: null, left: MINUTES[format] * 60, total: MINUTES[format] * 60 })
  const [s, setS] = useState<State>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as State | null
      return raw && typeof raw.left === 'number' ? raw : fresh()
    } catch {
      return fresh()
    }
  })
  const [, tick] = useState(0)
  const [big, setBig] = useState(false)
  const rang = useRef(false)
  const left = s.end ? (s.end - Date.now()) / 1000 : s.left
  const running = s.end !== null

  function save(next: State) {
    setS(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [running])
  useEffect(() => {
    if (running && left <= 0 && !rang.current) {
      rang.current = true
      if (left > -5) beep()
    }
    if (left > 0) rang.current = false
  })
  // Keep the screen on while the big clock is open.
  useEffect(() => {
    if (!big || !running) return
    let lock: { release(): Promise<void> } | undefined
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => (lock = l), () => {})
    return () => void lock?.release()
  }, [big, running])

  const start = () => save({ ...s, end: Date.now() + Math.max(0, left) * 1000 })
  const pause = () => save({ ...s, end: null, left: Math.max(0, left) })
  const setMinutes = (m: number) => save({ end: null, left: m * 60, total: m * 60 })
  const tone = left <= 0 ? 'text-rose-700 dark:text-rose-400' : left <= 300 ? 'text-amber-700 dark:text-amber-400' : ''

  const controls = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="primary" onClick={running ? pause : start} disabled={!running && left <= 0}>
        {running ? <Pause className="size-4" /> : <Play className="size-4" />} {running ? 'Pausar' : 'Iniciar'}
      </Button>
      <Button onClick={() => save({ ...fresh(), left: s.total, total: s.total })} aria-label="Reiniciar">
        <RotateCcw className="size-4" />
      </Button>
      {[30, 50, 75].map((m) => (
        <button key={m} type="button" onClick={() => setMinutes(m)} aria-pressed={s.total === m * 60} className={cx('num min-h-9 rounded-lg border px-2.5 text-xs', s.total === m * 60 ? 'border-accent bg-accent/10 font-semibold' : 'border-line text-muted')}>
          {m}
        </button>
      ))}
    </div>
  )
  return (
    <Card
      title="Reloj de ronda"
      className="mb-4"
      action={
        <Button size="icon" variant="ghost" aria-label="Ver el reloj a pantalla completa" onClick={() => setBig(true)}>
          <Maximize2 className="size-4" />
        </Button>
      }
    >
      <div className={cx('num mb-3 text-center text-4xl font-semibold', tone)} role="timer">
        {fmt(left)}
      </div>
      {controls}
      <Modal open={big} full onClose={() => setBig(false)} title="Reloj de ronda">
        <div className="flex min-h-full flex-col items-center justify-center gap-8">
          <div className={cx('num text-[26vw] leading-none font-semibold sm:text-[20vw]', tone)}>{fmt(left)}</div>
          {controls}
        </div>
      </Modal>
    </Card>
  )
}
