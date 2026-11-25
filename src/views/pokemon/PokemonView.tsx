import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Calculator as CalcIcon, Layers, Trophy, Users } from 'lucide-react'
import { PageHeader } from '../../components/Shell'
import { cx } from '../../components/ui'
import { Calculator, type CalcSeed } from './Calculator'
import { Decks } from './Decks'
import { StatsPanel } from './StatsPanel'
import { Teams } from './Teams'
import { Tournaments } from './Tournaments'
import { META, loadChampions } from './data'

/** TCG and VGC are two separate worlds; only the calculator is shared. */
type Area = 'tcg' | 'vgc' | 'calculator'
type Tab = 'tournaments' | 'library' | 'stats'

const AREAS: { id: Area; label: string }[] = [
  { id: 'tcg', label: 'TCG' },
  { id: 'vgc', label: 'VGC' },
  { id: 'calculator', label: 'Calculadora' },
]
const AREA_KEY = 'ph-pokemon-area'
const TAB_KEY = 'ph-pokemon-tab'

function initial(): { area: Area; tab: Tab } {
  try {
    const tab = localStorage.getItem(TAB_KEY)
    const area = localStorage.getItem(AREA_KEY) as Area | null
    // Values saved before TCG and VGC were separated.
    if (tab === 'calculator') return { area: 'calculator', tab: 'tournaments' }
    if (tab === 'decks') return { area: 'tcg', tab: 'library' }
    if (tab === 'teams') return { area: 'vgc', tab: 'library' }
    return { area: AREAS.some((a) => a.id === area) ? area! : 'tcg', tab: tab === 'library' || tab === 'stats' ? tab : 'tournaments' }
  } catch {
    return { area: 'tcg', tab: 'tournaments' }
  }
}

export function PokemonView() {
  const [{ area, tab }, setPlace] = useState(initial)
  const [seed, setSeed] = useState<CalcSeed | null>(null)

  // VGC data ready before it is needed (tournament venues have bad coverage).
  useEffect(() => {
    loadChampions().catch(() => {})
  }, [])

  const go = useCallback((next: { area?: Area; tab?: Tab }) => {
    setPlace((cur) => {
      const place = { ...cur, ...next }
      try {
        localStorage.setItem(AREA_KEY, place.area)
        localStorage.setItem(TAB_KEY, place.tab)
      } catch {
        /* ignore */
      }
      return place
    })
  }, [])
  const openCalculator = useCallback(
    (s: CalcSeed) => {
      setSeed(s)
      go({ area: 'calculator' })
      window.scrollTo({ top: 0 })
    },
    [go],
  )

  const game = area === 'calculator' ? null : area
  const tabs: { id: Tab; label: string; icon: typeof Trophy }[] = [
    { id: 'tournaments', label: 'Torneos', icon: Trophy },
    area === 'vgc' ? { id: 'library', label: 'Equipos', icon: Users } : { id: 'library', label: 'Mazos', icon: Layers },
    { id: 'stats', label: 'Estadísticas', icon: BarChart3 },
  ]

  return (
    <>
      <PageHeader eyebrow={area === 'vgc' ? 'Pokémon Champions' : area === 'tcg' ? META.format : 'Play! Pokémon'} title="Pokémon Competitive (TCG & VGC)" />

      <div role="group" aria-label="Juego" className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2 p-1 sm:inline-grid sm:min-w-96">
        {AREAS.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={area === a.id}
            onClick={() => go({ area: a.id })}
            className={cx(
              'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition',
              area === a.id ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
            )}
          >
            {a.id === 'calculator' && <CalcIcon className="size-4 max-sm:hidden" />}
            {a.label}
          </button>
        ))}
      </div>

      {game ? (
        <>
          <div role="tablist" aria-label={`Secciones de ${game.toUpperCase()}`} className="scrollbar-none -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                type="button"
                id={`pk-tab-${id}`}
                aria-selected={tab === id}
                aria-controls="pk-panel"
                onClick={() => go({ tab: id })}
                className={cx(
                  '-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition',
                  tab === id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                <Icon className={cx('size-4', tab === id && 'text-accent')} />
                {label}
              </button>
            ))}
          </div>
          <div id="pk-panel" role="tabpanel" aria-labelledby={`pk-tab-${tab}`}>
            {tab === 'tournaments' && <Tournaments key={game} game={game} onCalculator={openCalculator} />}
            {tab === 'library' && (game === 'tcg' ? <Decks /> : <Teams />)}
            {tab === 'stats' && <StatsPanel key={game} game={game} />}
          </div>
        </>
      ) : (
        <div className="mt-2">
          <Calculator key={seed?.key ?? 'free'} seed={seed} />
        </div>
      )}
    </>
  )
}
