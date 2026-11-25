import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Empty, cx } from '../../components/ui'
import { fromDateKey } from '../../lib/dates'
import { fmtDate } from '../../lib/format'
import { missingFor, type Allocation, type Print } from '../../lib/pokemon/collection'
import { parseDeck, type ParsedDeck } from '../../lib/pokemon/deck'
import { diffLists, versionOn } from '../../lib/pokemon/season'
import { emptyTally, matchesOf, played, recordText, rivalKey, tally, winRate } from '../../lib/pokemon/stats'
import type { MatchupNote, TcgDeck } from '../../lib/types'
import { useData } from '../../state/data'
import { ARCHETYPE } from './data'
import { DeckIcons, fmtRate } from './parts'
import { RivalDeckPicker, type RivalDeck } from './RoundModal'

// ---------------------------------------------------------------- versions
export function Versions({ deck }: { deck: TcgDeck }) {
  const { data, remove } = useData()
  const versions = useMemo(() => data.deck_versions.filter((v) => v.deck_id === deck.id).sort((a, b) => b.from_date.localeCompare(a.from_date) || b.created_at.localeCompare(a.created_at)), [data.deck_versions, deck.id])
  const matches = useMemo(() => matchesOf(data.tournaments, data.tournament_rounds, data.pokemon_matches).filter((m) => m.t.deck_id === deck.id), [data.tournaments, data.tournament_rounds, data.pokemon_matches, deck.id])
  if (!versions.length) return <Empty>Cuando cambies la lista se guardará la anterior, y aquí verás qué cartas cambiaste y el winrate de cada versión.</Empty>
  return (
    <ol className="space-y-3">
      {versions.map((v, i) => {
        const before = versions[i + 1]
        const diff = before ? diffLists(parseDeck(before.list_text).cards, parseDeck(v.list_text).cards) : []
        const ms = matches.filter((m) => versionOn(versions, m.t.date)?.id === v.id)
        const t = ms.length ? tally(ms) : emptyTally()
        return (
          <li key={v.id} className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-semibold">{i === 0 ? 'Actual' : `Versión ${versions.length - i}`}</span>
                <span className="ml-2 text-xs text-muted">desde el {fmtDate(fromDateKey(v.from_date), { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <span className="num text-sm">
                {played(t) ? (
                  <>
                    <span className="font-semibold">{fmtRate(winRate(t))}</span> <span className="text-muted">{recordText(t)}</span>
                  </>
                ) : (
                  <span className="text-muted">sin partidas</span>
                )}
              </span>
            </div>
            {v.note && <p className="mt-1 text-sm">{v.note}</p>}
            {diff.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {diff.map((d) => (
                  <li key={d.name}>
                    <Badge className={d.after > d.before ? 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300'}>
                      {d.after > d.before ? '+' : '−'}
                      {Math.abs(d.after - d.before)} {d.name}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {i > 0 && (
              <button type="button" className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs text-faint hover:text-rose-600" onClick={() => void remove('deck_versions', v.id)}>
                <Trash2 className="size-3.5" /> Borrar esta versión
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Keep the history when a list changes. */
export function useSaveVersion() {
  const { data, create, update } = useData()
  return async (deck: TcgDeck, nextList: string, note: string, today: string) => {
    const same = (a: string, b: string) => diffLists(parseDeck(a).cards, parseDeck(b).cards).length === 0
    if (same(deck.list_text, nextList)) return
    const own = data.deck_versions.filter((v) => v.deck_id === deck.id)
    if (!own.length) await create('deck_versions', { deck_id: deck.id, from_date: deck.created_at.slice(0, 10), list_text: deck.list_text, note: '' })
    // Several edits in a day are one version — unless the first one started today.
    const current = own.find((v) => v.from_date === today && own.length > 1)
    if (current) await update('deck_versions', current.id, { list_text: nextList, note: note || current.note })
    else await create('deck_versions', { deck_id: deck.id, from_date: today, list_text: nextList, note })
  }
}

// ------------------------------------------------------------------- owned
export function Owned({ deck, parsed, alloc, prints }: { deck: TcgDeck; parsed: ParsedDeck; alloc: Allocation; prints: ReadonlyMap<string, Print> }) {
  const { data } = useData()
  const use = alloc.decks.find((d) => d.deck.id === deck.id)
  const lines = use ? use.lines.map((l) => ({ line: l.line, need: l.need, have: l.have, locked: [] as { deck: string; n: number }[] })) : missingFor(parsed.cards, data.owned_cards, alloc, prints).map((l) => ({ line: l.line, need: l.need, have: l.free, locked: l.lockedIn }))
  const need = lines.reduce((a, l) => a + l.need, 0)
  const have = lines.reduce((a, l) => a + l.have, 0)
  if (!data.owned_cards.length) return <Empty>Añade cartas a tu colección para ver cuáles tienes de este mazo.</Empty>
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="num text-lg font-semibold">{have}</span> de {need} cartas {deck.is_built !== false ? 'en el mazo' : 'libres en tu colección'}
        {have < need && <span className="text-rose-700 dark:text-rose-400"> · faltan {need - have}</span>}
      </p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {[...lines]
          .sort((a, b) => b.need - b.have - (a.need - a.have))
          .map((l, i) => (
            <li key={i} className="flex min-h-11 items-center gap-3 px-3 text-sm">
              <span className={cx('num w-12 font-semibold', l.have < l.need ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400')}>
                {l.have}/{l.need}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {l.line.name}
                {l.locked.length > 0 && l.have < l.need && <span className="ml-2 text-xs text-muted">{l.locked.map((u) => `${u.n} en ${u.deck}`).join(', ')}</span>}
              </span>
              <span className="num text-xs text-muted">
                {l.line.set} {l.line.number}
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------------- notes
export function MatchupNotes({ deckId }: { deckId: string }) {
  const { data, create, update, remove } = useData()
  const [adding, setAdding] = useState(false)
  const [rival, setRival] = useState<RivalDeck>({ id: '', icons: [], name: '' })
  const notes = data.matchup_notes.filter((n) => n.deck_id === deckId || n.deck_id === null).sort((a, b) => a.name.localeCompare(b.name))
  const key = rival.id ? rivalKey({ opponent_archetype: rival.id, opponent_icons: rival.icons, opponent_deck_name: rival.name }) : ''
  const exists = notes.some((n) => n.archetype === key && n.deck_id === deckId)

  async function add() {
    if (!key || exists) return
    setAdding(false)
    await create('matchup_notes', { deck_id: deckId, archetype: key, name: rival.name || 'Personalizado', icons: rival.icons, notes: '' })
    setRival({ id: '', icons: [], name: '' })
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Tu plan contra cada mazo. Aparece al registrar una ronda contra él.</p>
        <Button size="sm" variant={adding ? 'ghost' : 'primary'} onClick={() => setAdding((x) => !x)}>
          {adding ? 'Cancelar' : <><Plus className="size-3.5" /> Añadir rival</>}
        </Button>
      </div>
      {adding && (
        <div className="rounded-xl border border-line p-3">
          <RivalDeckPicker value={rival} onChange={setRival} invalid={false} />
          <Button className="mt-3" variant="primary" disabled={!key || exists || (rival.id === 'other' && !rival.icons.length)} onClick={() => void add()}>
            {exists ? 'Ya tiene notas' : 'Crear nota'}
          </Button>
        </div>
      )}
      {!notes.length && !adding && <Empty>Aún no hay notas.</Empty>}
      <ul className="space-y-2">
        {notes.map((n) => (
          <NoteRow key={n.id} note={n} onSave={(text) => void update('matchup_notes', n.id, { notes: text })} onRemove={() => void remove('matchup_notes', n.id)} />
        ))}
      </ul>
    </div>
  )
}

function NoteRow({ note, onSave, onRemove }: { note: MatchupNote; onSave: (t: string) => void; onRemove: () => void }) {
  const [text, setText] = useState(note.notes)
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center gap-2">
        <DeckIcons icons={note.icons} size={32} label={note.name} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{ARCHETYPE.get(note.archetype)?.name ?? note.name}</span>
        <button type="button" aria-label={`Borrar notas contra ${note.name}`} onClick={onRemove} className="grid size-9 place-items-center rounded-lg text-faint hover:text-rose-600">
          <Trash2 className="size-4" />
        </button>
      </div>
      <textarea className="field min-h-20 text-sm" aria-label={`Notas contra ${note.name}`} value={text} maxLength={5000} placeholder="Salir primero o segundo, cartas clave, qué evitar…" onChange={(e) => setText(e.target.value)} onBlur={() => text !== note.notes && onSave(text)} />
    </li>
  )
}

/** Shown while recording a round: the plan against that deck, editable in place. */
export function RivalNote({ deckId, rival }: { deckId: string | null; rival: RivalDeck }) {
  const { data, create, update } = useData()
  const key = rival.id ? rivalKey({ opponent_archetype: rival.id, opponent_icons: rival.icons, opponent_deck_name: rival.name }) : ''
  const note = data.matchup_notes.find((n) => n.archetype === key && n.deck_id === deckId) ?? data.matchup_notes.find((n) => n.archetype === key && n.deck_id === null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  if (!key || (rival.id === 'other' && !rival.icons.length)) return null

  async function save() {
    setEditing(false)
    if (note) await update('matchup_notes', note.id, { notes: text })
    else if (text.trim()) await create('matchup_notes', { deck_id: deckId, archetype: key, name: rival.name || 'Personalizado', icons: rival.icons, notes: text })
  }
  return (
    <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Plan contra {rival.name || 'este mazo'}</span>
        {!editing && (
          <button
            type="button"
            className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-accent hover:underline"
            onClick={() => {
              setText(note?.notes ?? '')
              setEditing(true)
            }}
          >
            <Pencil className="size-3.5" /> {note?.notes ? 'Editar' : 'Escribir'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea className="field min-h-24 text-sm" aria-label="Plan de partida" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} />
          <Button type="button" size="sm" variant="primary" onClick={() => void save()}>
            Guardar plan
          </Button>
        </div>
      ) : (
        <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{note?.notes || 'Sin notas todavía.'}</p>
      )}
    </div>
  )
}
