import { useState } from 'react'
import { cx } from '../../components/ui'
import type { PokemonGame } from '../../lib/types'
import { useData } from '../../state/data'

/** Id of the deck (TCG) or team (VGC) something was played with. */
export const ownId = (game: PokemonGame, x: { deck_id: string | null; team_id: string | null }) => (game === 'tcg' ? x.deck_id : x.team_id) ?? 'none'

/** Filter by deck or team, offering only those used in `rows`, the most used first. */
export function useOwnFilter(game: PokemonGame, rows: readonly { deck_id: string | null; team_id: string | null }[]) {
  const { data } = useData()
  const [value, setValue] = useState('')
  const library: { id: string; name: string }[] = game === 'tcg' ? data.tcg_decks : data.vgc_teams
  const count = new Map<string, number>()
  for (const r of rows) count.set(ownId(game, r), (count.get(ownId(game, r)) ?? 0) + 1)
  const used = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)!)
  const picked = count.has(value) ? value : ''
  return {
    picked,
    setPicked: setValue,
    matches: (x: { deck_id: string | null; team_id: string | null }) => !picked || ownId(game, x) === picked,
    options: used.map((id) => ({ id, name: library.find((x) => x.id === id)?.name ?? (game === 'tcg' ? 'Sin mazo asignado' : 'Sin equipo asignado') })),
  }
}

export function OwnFilter({ game, filter, className }: { game: PokemonGame; filter: ReturnType<typeof useOwnFilter>; className?: string }) {
  return (
    <select className={cx('field h-9 w-full min-w-0 sm:w-64 pointer-coarse:h-11', className)} aria-label={game === 'tcg' ? 'Filtrar por mazo' : 'Filtrar por equipo'} value={filter.picked} onChange={(e) => filter.setPicked(e.target.value)}>
      <option value="">{game === 'tcg' ? 'Todos los mazos' : 'Todos los equipos'}</option>
      {filter.options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  )
}
