import { useId, useMemo, useState } from 'react'
import { cx } from './ui'

export interface ChartPoint {
  x: number
  y: number
  label: string
  detail: string
}

/**
 * One series over time: thin line, round markers, crosshair on hover or touch.
 * `invert` puts small values on top (paces: lower is better).
 */
export function LineChart({
  points,
  format,
  invert,
  reference,
  height = 170,
  color = 'var(--chart, #0284c7)',
  label,
}: {
  points: ChartPoint[]
  format: (y: number) => string
  invert?: boolean
  reference?: { y: number; label: string }
  height?: number
  color?: string
  label: string
}) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const W = 600
  const pad = { l: 78, r: 14, t: 12, b: 24 }
  const g = useMemo(() => {
    const xs = points.map((p) => p.x)
    const ys = [...points.map((p) => p.y), ...(reference ? [reference.y] : [])]
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
    let [y0, y1] = [Math.min(...ys), Math.max(...ys)]
    const span = y1 - y0 || Math.max(1, y1 * 0.05)
    y0 -= span * 0.12
    y1 += span * 0.12
    const sx = (x: number) => pad.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (W - pad.l - pad.r)
    const sy = (y: number) => {
      const k = (y - y0) / (y1 - y0)
      return pad.t + (invert ? k : 1 - k) * (height - pad.t - pad.b)
    }
    const ticks = [0.12, 0.5, 0.88].map((k) => y0 + (y1 - y0) * k)
    return { sx, sy, ticks }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, reference?.y, invert, height])
  if (!points.length) return null
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${g.sx(p.x).toFixed(1)},${g.sy(p.y).toFixed(1)}`).join('')
  const active = hover === null ? points.length - 1 : hover
  const a = points[active]
  const dates = points.length > 1 ? [points[0], points[points.length - 1]] : [points[0]]

  function move(clientX: number, rect: DOMRect) {
    const x = ((clientX - rect.left) / rect.width) * W
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(g.sx(p.x) - x) < Math.abs(g.sx(points[best].x) - x)) best = i
    })
    setHover(best)
  }

  return (
    <figure className="min-w-0" aria-label={label}>
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm" aria-live="polite">
        <span className="num text-lg font-semibold">{format(a.y)}</span>
        <span className="text-xs text-muted">
          {a.label}
          {a.detail && ` · ${a.detail}`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="block w-full touch-pan-y select-none"
        role="img"
        aria-labelledby={id}
        onPointerMove={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
      >
        <title id={id}>{`${label}: ${points.length} valores, de ${format(points[0].y)} a ${format(points[points.length - 1].y)}`}</title>
        {g.ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={g.sy(t)} y2={g.sy(t)} stroke="var(--line)" />
            <text x={pad.l - 8} y={g.sy(t) + 4} textAnchor="end" fontSize="12" fill="var(--muted)" fontFamily="var(--font-mono)">
              {format(t)}
            </text>
          </g>
        ))}
        {reference && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={g.sy(reference.y)} y2={g.sy(reference.y)} stroke="var(--fg)" strokeDasharray="5 4" strokeWidth="1.5" />
            <text x={W - pad.r} y={g.sy(reference.y) - 6} textAnchor="end" fontSize="12" fill="var(--fg)">
              {reference.label}
            </text>
          </g>
        )}
        <line x1={g.sx(a.x)} x2={g.sx(a.x)} y1={pad.t} y2={height - pad.b} stroke="var(--line-strong)" className={cx(hover === null && 'opacity-0')} />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={g.sx(p.x)} cy={g.sy(p.y)} r={i === active ? 6 : 4} fill={color} stroke="var(--surface)" strokeWidth="2" />
        ))}
        {dates.map((p, i) => (
          <text key={i} x={g.sx(p.x)} y={height - 6} textAnchor={dates.length === 1 ? 'middle' : i ? 'end' : 'start'} fontSize="12" fill="var(--muted)">
            {p.label}
          </text>
        ))}
      </svg>
    </figure>
  )
}
