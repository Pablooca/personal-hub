import { useMemo, useState } from 'react'
import { ChevronDown, Trophy } from 'lucide-react'
import { cx } from '../../components/ui'
import { SEASON, cpSeason } from '../../lib/pokemon/season'
import type { PokemonGame } from '../../lib/types'
import { useData } from '../../state/data'

const TARGET_KEY = 'ph-cp-target'
function readTarget(game: PokemonGame): number | null {
  try {
    const v = Number((JSON.parse(localStorage.getItem(TARGET_KEY) ?? '{}') as Record<string, unknown>)[game])
    return v > 0 ? v : null
  } catch {
    return null
  }
}

/** Championship Points of the season with best-finish limits. */
export function CpCard({ game }: { game: PokemonGame }) {
  const { data } = useData()
  const s = useMemo(() => cpSeason(data.tournaments, game), [data.tournaments, game])
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<number | null>(() => readTarget(game))
  function saveTarget(v: string) {
    const n = Math.max(0, Math.floor(Number(v.replace(/\D/g, '')) || 0)) || null
    setTarget(n)
    try {
      localStorage.setItem(TARGET_KEY, JSON.stringify({ ...(JSON.parse(localStorage.getItem(TARGET_KEY) ?? '{}') as object), [game]: n }))
    } catch {
      /* ignore */
    }
  }
  if (!s.raw) return null
  return (
    <section className="card mb-4 p-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen((x) => !x)} className="flex w-full items-center gap-3 text-left">
        <Trophy className="size-5 shrink-0 text-amber-500" />
        <span className="min-w-0 flex-1">
          <span className="num text-xl font-semibold">{s.total} CP</span> <span className="text-sm text-muted">temporada {SEASON.name}{target ? ` · objetivo ${target}` : ''}</span>
          {target && (
            <span className="mt-1.5 block h-1.5 rounded-full bg-line">
              <span className="block h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, (s.total / target) * 100)}%` }} />
            </span>
          )}
        </span>
        <ChevronDown className={cx('size-4 shrink-0 text-faint transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-4 border-t border-line pt-3">
          <ul className="space-y-3">
            {s.groups.map((g) => (
              <li key={g.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{g.label}</span>
                  <span className="num">
                    <span className="font-semibold">{g.points}</span>{' '}
                    <span className="text-xs text-muted">
                      {g.counted.length}/{g.limit} resultados
                    </span>
                  </span>
                </div>
                {g.counted.length > 0 && (
                  <div className="mt-0.5 text-xs text-muted">
                    {g.counted.map((t) => t.cp).join(' + ')}
                    {g.dropped.length > 0 && ` · no cuentan: ${g.dropped.map((t) => t.cp).join(', ')}`}
                    {g.toBeat !== null && ` · un resultado nuevo suma si supera ${g.toBeat} CP`}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <label className="mt-4 flex items-center gap-3 text-sm">
            <span className="text-muted">Mi objetivo de CP</span>
            <input className="field num w-28" inputMode="numeric" value={target ?? ''} placeholder="—" onChange={(e) => saveTarget(e.target.value)} />
          </label>
        </div>
      )}
    </section>
  )
}
