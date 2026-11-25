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

type Tab = 'tournaments' | 'calculator' | 'decks' | 'teams' | 'stats'
const TABS: { id: Tab; label: string; icon: typeof Trophy }[] = [
  { id: 'tournaments', label: 'Torneos', icon: Trophy },
  { id: 'calculator', label: 'Calculadora', icon: CalcIcon },
  { id: 'decks', label: 'Mazos TCG', icon: Layers },
  { id: 'teams', label: 'Equipos VGC', icon: Users },
  { id: 'stats', label: 'Estadísticas', icon: BarChart3 },
]
const TAB_KEY = 'ph-pokemon-tab'

export function PokemonView() {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const t = localStorage.getItem(TAB_KEY) as Tab | null
      return TABS.some((x) => x.id === t) ? t! : 'tournaments'
    } catch {
      return 'tournaments'
    }
  })
  const [seed, setSeed] = useState<CalcSeed | null>(null)

  // VGC data ready before it is needed (tournament venues have bad coverage).
  useEffect(() => {
    loadChampions().catch(() => {})
  }, [])

  const go = useCallback((t: Tab) => {
    setTab(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      /* ignore */
    }
  }, [])
  const openCalculator = useCallback(
    (s: CalcSeed) => {
      setSeed(s)
      go('calculator')
      window.scrollTo({ top: 0 })
    },
    [go],
  )

  return (
    <>
      <PageHeader eyebrow={`TCG ${META.format} · VGC Pokémon Champions`} title="Pokémon Competitive (TCG & VGC)" />
      <div role="tablist" aria-label="Secciones de Pokémon" className="scrollbar-none -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            id={`pk-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="pk-panel"
            onClick={() => go(id)}
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
        {tab === 'tournaments' && <Tournaments onCalculator={openCalculator} />}
        {tab === 'calculator' && <Calculator key={seed?.key ?? 'free'} seed={seed} />}
        {tab === 'decks' && <Decks />}
        {tab === 'teams' && <Teams />}
        {tab === 'stats' && <StatsPanel />}
      </div>
    </>
  )
}
