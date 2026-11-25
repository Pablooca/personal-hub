import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { search, type SearchHit } from '../lib/agenda'
import { useData } from '../state/data'
import { useNav } from '../state/nav'
import { NAV, type ViewId } from './Shell'
import { Modal, cx } from './ui'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type Row = { key: string; group: string; title: string; detail: string; run: () => void }

/** ⌘K: jump to a section or open anything by name. */
export function SearchPalette({ onClose }: { onClose: () => void }) {
  const { data } = useData()
  const { open, go } = useNav()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  const rows = useMemo<Row[]>(() => {
    const q = fold(deferred.trim())
    const sections = NAV.filter((n) => !q || fold(n.label).includes(q)).map((n) => ({
      key: `nav-${n.id}`, group: 'Ir a', title: n.label, detail: '', run: () => go(n.id as ViewId),
    }))
    const hits = search(data, deferred).map((h: SearchHit) => ({ key: `${h.group}-${h.key}-${h.title}`, group: h.group, title: h.title, detail: h.detail, run: () => open(h.target) }))
    return q ? [...sections, ...hits] : sections
  }, [data, deferred, go, open])

  useEffect(() => setActive(0), [deferred])
  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function choose(r: Row | undefined) {
    if (!r) return
    onClose()
    r.run()
  }

  return (
    <Modal open wide onClose={onClose} title="Buscar">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <input
          autoFocus
          className="field h-11 pl-9"
          role="combobox"
          aria-expanded
          aria-controls="search-results"
          aria-label="Buscar en todo"
          placeholder="Tareas, movimientos, eventos, mazos, apuntes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, rows.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(rows[active])
            }
          }}
        />
      </div>
      <div id="search-results" ref={list} role="listbox" aria-label="Resultados" className="mt-3 min-h-64">
        {rows.map((r, i) => (
          <div key={r.key}>
            {(i === 0 || rows[i - 1].group !== r.group) && <div className="eyebrow px-2 pt-3 pb-1">{r.group}</div>}
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              data-i={i}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(r)}
              className={cx('flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left', i === active && 'bg-surface-2')}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{r.title}</span>
                {r.detail && <span className="block truncate text-xs text-muted">{r.detail}</span>}
              </span>
              <ArrowRight className={cx('size-4 shrink-0 text-faint', i !== active && 'opacity-0')} />
            </button>
          </div>
        ))}
        {!rows.length && <p className="px-2 py-8 text-center text-sm text-muted">Nada coincide con «{query}».</p>}
      </div>
    </Modal>
  )
}
