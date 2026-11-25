import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Layers, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import { Badge, Button, Empty, Field, Modal, Segmented, cx } from '../../components/ui'
import { toDateKey } from '../../lib/dates'
import { DECK_SECTIONS, DECK_SIZE, formatDeck, isBasicEnergy, parseDeck, type DeckCard, type DeckSection, type ParsedDeck } from '../../lib/pokemon/deck'
import { EXAMPLE_DECK } from '../../lib/pokemon/examples'
import { cardImage, cardSlug, cardUrl } from '../../lib/pokemon/sprites'
import { emptyTally, matchesOf, played, recordText, tally, winRate } from '../../lib/pokemon/stats'
import type { TcgDeck } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'
import { useAllocation } from './Collection'
import { MatchupNotes, Owned, Versions, useSaveVersion } from './DeckExtras'
import { KNOWN_SLUGS, META } from './data'
import { DeckIcons, Sprite, SpritePicker, fmtRate } from './parts'

const SECTION_LABEL: Record<DeckSection, string> = { pokemon: 'Pokémon', trainer: 'Entrenador', energy: 'Energía' }
const parse = (text: string) => parseDeck(text, META.aceSpecs)

/** Best two Pokémon of a list to represent it: Megas first, then "ex", then by copies. */
export function suggestIcons(deck: ParsedDeck): string[] {
  const score = (c: DeckCard) => (/^mega /i.test(c.name) ? 20 : 0) + (/ ex$/i.test(c.name) ? 5 : 0) + c.count * 3
  const out: string[] = []
  for (const c of deck.cards.filter((x) => x.section === 'pokemon').sort((a, b) => score(b) - score(a))) {
    const slug = cardSlug(c.name, KNOWN_SLUGS)
    if (KNOWN_SLUGS.has(slug) && !out.includes(slug)) out.push(slug)
    if (out.length === 2) break
  }
  return out
}

export function Decks({ initialId = null }: { initialId?: string | null }) {
  const { data, create } = useData()
  const [openId, setOpenId] = useState<string | null>(initialId)
  const [editing, setEditing] = useState<TcgDeck | 'new' | null>(null)
  const open = data.tcg_decks.find((d) => d.id === openId)
  const records = useMemo(() => {
    const ms = matchesOf(data.tournaments, data.tournament_rounds, data.pokemon_matches)
    return new Map(data.tcg_decks.map((d) => [d.id, tally(ms.filter((m) => m.t.deck_id === d.id))]))
  }, [data.tournaments, data.tournament_rounds, data.pokemon_matches, data.tcg_decks])

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Listas de 60 cartas en formato PTCG Live o Limitless.</p>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Nuevo mazo
        </Button>
      </div>

      {data.tcg_decks.length === 0 ? (
        <Empty icon={<Layers className="size-6 text-faint" />}>
          <p>Aún no hay mazos.</p>
          <Button className="mt-1" onClick={() => void create('tcg_decks', { ...EXAMPLE_DECK, icons: [...EXAMPLE_DECK.icons] })}>
            Cargar el mazo de ejemplo
          </Button>
        </Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.tcg_decks.map((d) => {
            const p = parse(d.list_text)
            const rec = records.get(d.id) ?? emptyTally()
            return (
              <li key={d.id} className="min-w-0">
                <button type="button" onClick={() => setOpenId(d.id)} className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-line-strong">
                  <DeckIcons icons={d.icons} size={48} label={d.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{d.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      {d.format}
                      <span className="num">
                        {p.counts.pokemon}/{p.counts.trainer}/{p.counts.energy}
                      </span>
                      {d.is_built !== false && <span>Montado</span>}
                      {p.valid ? (
                        <span className="inline-flex items-center gap-1 text-emerald-800 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" /> 60 cartas
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                          <XCircle className="size-3.5" /> {p.total} cartas
                        </span>
                      )}
                    </span>
                  </span>
                  {played(rec) > 0 && (
                    <span className="shrink-0 text-right">
                      <span className="num block text-sm font-semibold">{recordText(rec)}</span>
                      <span className="num text-xs text-muted">{fmtRate(winRate(rec))}</span>
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open && !editing && <DeckViewer deck={open} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} />}
      {editing && (
        <DeckEditor
          deck={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDeleted={() => {
            setEditing(null)
            setOpenId(null)
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------- view
function DeckProblems({ deck }: { deck: ParsedDeck }) {
  if (!deck.errors.length && !deck.warnings.length)
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-400">
        <CheckCircle2 className="size-4 shrink-0" /> Lista válida: {DECK_SIZE} cartas exactas.
      </p>
    )
  return (
    <ul className="space-y-1 text-sm">
      {deck.errors.map((e) => (
        <li key={e} className="flex items-start gap-2 text-rose-700 dark:text-rose-400">
          <XCircle className="mt-0.5 size-4 shrink-0" /> {e}
        </li>
      ))}
      {deck.warnings.map((e) => (
        <li key={e} className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {e}
        </li>
      ))}
    </ul>
  )
}

function Counters({ deck }: { deck: ParsedDeck }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DECK_SECTIONS.map((s) => (
        <Badge key={s} className="border-line-strong text-muted">
          {SECTION_LABEL[s]} <span className="num text-fg">{deck.counts[s]}</span>
        </Badge>
      ))}
      <Badge className={deck.total === DECK_SIZE ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300'}>
        Total{' '}
        <span className="num">
          {deck.total}/{DECK_SIZE}
        </span>
      </Badge>
    </div>
  )
}

function CardTile({ card }: { card: DeckCard }) {
  const [broken, setBroken] = useState(false)
  const url = card.set ? cardImage(card.set, card.number) : null
  const slug = card.section === 'pokemon' ? cardSlug(card.name, KNOWN_SLUGS) : ''
  const label = `${card.count}× ${card.name}${card.set ? ` (${card.set} ${card.number})` : ''}`
  const body = (
    <>
      <span className="relative block aspect-[245/342] w-full overflow-hidden rounded-lg border border-line bg-surface-2">
        {url && !broken ? (
          <img src={url} alt={label} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted">
            {slug && <Sprite slug={slug} size={48} label={card.name} />}
            {card.name}
          </span>
        )}
        <span className="num absolute right-1 bottom-1 grid min-w-7 place-items-center rounded-md bg-slate-950/85 px-1.5 py-0.5 text-sm font-bold text-white">×{card.count}</span>
      </span>
      <span className="mt-1 block truncate text-center font-mono text-[10px] text-faint">
        {card.set} {card.number}
      </span>
    </>
  )
  return card.set ? (
    <a href={cardUrl(card.set, card.number)} target="_blank" rel="noreferrer noopener" title={label} className="block min-w-0">
      {body}
    </a>
  ) : (
    <span title={label} className="block min-w-0">
      {body}
    </span>
  )
}

function DeckContents({ deck, mode }: { deck: ParsedDeck; mode: 'cards' | 'list' }) {
  return (
    <div className="space-y-5">
      {DECK_SECTIONS.map((s) => {
        const rows = deck.cards.filter((c) => c.section === s)
        if (!rows.length) return null
        return (
          <section key={s}>
            <h3 className="mb-2 text-sm font-semibold">
              {SECTION_LABEL[s]} <span className="num text-muted">({deck.counts[s]})</span>
            </h3>
            {mode === 'cards' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(112px,1fr))]">
                {rows.map((c, i) => (
                  <CardTile key={`${c.name}${c.set}${c.number}${i}`} card={c} />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {rows.map((c, i) => (
                  <li key={i} className="flex min-h-11 items-center gap-3 px-3 py-1 text-sm">
                    <span className="num w-5 text-right font-semibold">{c.count}</span>
                    {s === 'pokemon' && <Sprite slug={cardSlug(c.name, KNOWN_SLUGS)} size={30} label={c.name} />}
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {isBasicEnergy(c.name) && <span className="text-xs text-faint">básica</span>}
                    <span className="num text-xs text-muted">
                      {c.set} {c.number}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function DeckViewer({ deck, onClose, onEdit }: { deck: TcgDeck; onClose: () => void; onEdit: () => void }) {
  const toast = useToast()
  const { update } = useData()
  const [mode, setMode] = useState<'cards' | 'list' | 'owned' | 'versions' | 'notes'>('cards')
  const p = useMemo(() => parse(deck.list_text), [deck.list_text])
  const { alloc, prints } = useAllocation()
  async function copy() {
    try {
      await navigator.clipboard.writeText(formatDeck(p))
      toast('success', 'Lista copiada')
    } catch {
      toast('error', 'No se ha podido copiar la lista')
    }
  }
  return (
    <Modal
      open
      full
      onClose={onClose}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <DeckIcons icons={deck.icons} size={30} label={deck.name} /> <span className="truncate">{deck.name}</span>
        </span>
      }
      footer={
        <>
          <Button className="mr-auto" onClick={() => void copy()}>
            <Copy className="size-4" /> Copiar lista
          </Button>
          <Button variant="primary" onClick={onEdit}>
            <Pencil className="size-4" /> Editar
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Counters deck={p} />
          <Segmented value={mode} onChange={setMode} options={[{ value: 'cards', label: 'Cartas' }, { value: 'list', label: 'Lista' }, { value: 'owned', label: 'Tengo' }, { value: 'versions', label: 'Versiones' }, { value: 'notes', label: 'Rivales' }]} />
        </div>
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={deck.is_built !== false} onChange={(e) => void update('tcg_decks', deck.id, { is_built: e.target.checked })} /> Montado: sus cartas no están disponibles para otros mazos
        </label>
        {(!p.valid || p.warnings.length > 0) && <DeckProblems deck={p} />}
        {mode === 'owned' ? <Owned deck={deck} parsed={p} alloc={alloc} prints={prints} /> : mode === 'versions' ? <Versions deck={deck} /> : mode === 'notes' ? <MatchupNotes deckId={deck.id} /> : <DeckContents deck={p} mode={mode} />}
        {deck.notes && (mode === 'cards' || mode === 'list') && <p className="text-sm whitespace-pre-wrap text-muted">{deck.notes}</p>}
      </div>
    </Modal>
  )
}

// -------------------------------------------------------------------- editor
function DeckEditor({ deck, onClose, onDeleted }: { deck: TcgDeck | null; onClose: () => void; onDeleted: () => void }) {
  const { create, update, remove } = useData()
  const toast = useToast()
  const [name, setName] = useState(deck?.name ?? '')
  const [format, setFormat] = useState(deck?.format ?? META.format)
  const [text, setText] = useState(deck?.list_text ?? '')
  const [notes, setNotes] = useState(deck?.notes ?? '')
  const [change, setChange] = useState('')
  const saveVersion = useSaveVersion()
  const [icons, setIcons] = useState<string[]>(deck?.icons ?? [])
  const [picking, setPicking] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const p = useMemo(() => parse(text), [text])
  const auto = useMemo(() => suggestIcons(p), [p])
  const shownIcons = icons.length ? icons : auto

  async function save() {
    if (!name.trim()) return toast('error', 'Ponle un nombre al mazo.')
    if (!p.cards.length) return toast('error', 'Pega la lista del mazo.')
    const row = { name: name.trim(), format: format.trim(), list_text: text.trim(), notes, icons: shownIcons }
    onClose()
    if (deck) {
      await saveVersion(deck, row.list_text, change.trim(), toDateKey(new Date()))
      await update('tcg_decks', deck.id, row)
    } else await create('tcg_decks', { ...row, is_built: true })
    if (!p.valid) toast('error', `Guardado, pero la lista no es legal: ${p.errors[0]}`)
  }

  return (
    <Modal
      open
      full
      onClose={onClose}
      title={deck ? 'Editar mazo' : 'Nuevo mazo'}
      footer={
        <>
          {deck && (
            <Button variant="danger" className="mr-auto" onClick={() => (confirm ? (onDeleted(), void remove('tcg_decks', deck.id)) : setConfirm(true))}>
              <Trash2 className="size-4" /> {confirm ? '¿Seguro? Eliminar' : <span className="max-sm:sr-only">Eliminar</span>}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
            <Field label="Nombre">
              <input className="field" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Formato">
              <input className="field" value={format} maxLength={40} onChange={(e) => setFormat(e.target.value)} />
            </Field>
          </div>
          <div>
            <span className="label">Iconos</span>
            <button type="button" onClick={() => setPicking((x) => !x)} className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 text-sm text-muted hover:border-line-strong">
              <DeckIcons icons={shownIcons} size={36} />
              {icons.length ? 'Cambiar' : auto.length ? 'Elegidos según la lista. Cambiar' : 'Elegir'}
            </button>
            {picking && (
              <div className="mt-2">
                <SpritePicker value={shownIcons} onChange={setIcons} />
              </div>
            )}
          </div>
          <Field label="Lista (PTCG Live / Limitless)">
            <textarea
              className="field min-h-[320px] font-mono text-xs leading-relaxed"
              spellCheck={false}
              value={text}
              maxLength={10000}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Pokémon: 14\n4 Mega Kangaskhan ex MEG 104\n…\n\nTrainer: 31\n…\n\nEnergy: 15\n…'}
            />
          </Field>
          {deck && text.trim() !== deck.list_text.trim() && (
            <Field label="Qué has cambiado (opcional)">
              <input className="field" value={change} maxLength={500} onChange={(e) => setChange(e.target.value)} placeholder="Se guarda como versión nueva" />
            </Field>
          )}
          <Field label="Notas">
            <textarea className="field min-h-16" value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <div className="min-w-0 space-y-4 lg:border-l lg:border-line lg:pl-6">
          <Counters deck={p} />
          {text.trim() && <DeckProblems deck={p} />}
          {p.cards.length ? (
            <DeckContents deck={p} mode="cards" />
          ) : (
            <Empty>
              La vista previa aparecerá aquí.
              <button type="button" className={cx('inline-flex items-center gap-1 text-accent hover:underline')} onClick={() => setText(EXAMPLE_DECK.list_text)}>
                Pegar el mazo de ejemplo
              </button>
              <a className="inline-flex items-center gap-1 text-xs text-muted hover:underline" href="https://limitlesstcg.com/decks" target="_blank" rel="noreferrer noopener">
                Ver listas en Limitless <ExternalLink className="size-3" />
              </a>
            </Empty>
          )}
        </div>
      </div>
    </Modal>
  )
}
