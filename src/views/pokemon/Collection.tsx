import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check as CheckIcon, ClipboardList, Copy, Download, ExternalLink, Layers, ListPlus, Loader2, MapPin, Minus, Plus, RefreshCw, Search, Tag, Trash2 } from 'lucide-react'
import { LineChart } from '../../components/LineChart'
import { Badge, Button, Card, Empty, Field, Modal, Segmented, Stat, cx } from '../../components/ui'
import { fromDateKey, toDateKey } from '../../lib/dates'
import { downloadText } from '../../lib/download'
import { fmtDate, fmtMoney, fmtMoneyShort } from '../../lib/format'
import {
  CARD_KINDS, CONDITIONS, FINISHES, GRADERS, LANGUAGES, allocate, cardmarketUrl, collectionCsv, finishName, isReverse, isWestern, kindOf, languageOf, missingFor, missingText, signatureOf, stackKey, totals, trainerSubtype, valueOf,
  type Allocation, type CardKind,
} from '../../lib/pokemon/collection'
import { parseDeck } from '../../lib/pokemon/deck'
import { isPlayable, needsCheck } from '../../lib/pokemon/legality'
import type { NewRow, OwnedCard } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'
import { parseAmount } from '../finance/TxForms'
import { META } from './data'
import { SET_BY_ID, categoryOf, fetchByNumber, fetchCard, image, isStandard, standardPrint, priceOf, searchCards, usePrints, type ApiCard, type ApiHit } from './cards'

const today = () => toDateKey(new Date())
const ALL_LINES: never[] = []

/** Lines of every built deck, to know which cards they lock. */
export function useAllocation(): { alloc: Allocation; prints: ReturnType<typeof usePrints>['prints']; loading: boolean } {
  const { data } = useData()
  const lines = useMemo(() => (data.owned_cards.length ? data.tcg_decks.filter((d) => d.is_built !== false).flatMap((d) => parseDeck(d.list_text).cards) : ALL_LINES), [data.tcg_decks, data.owned_cards.length])
  const { prints, loading } = usePrints(lines)
  const alloc = useMemo(() => allocate(data.owned_cards, data.tcg_decks, prints), [data.owned_cards, data.tcg_decks, prints])
  return { alloc, prints, loading }
}

const NO_PLACE = '(sin indicar)'
/** Places already used, to choose instead of typing. */
function usePlaces() {
  const { data } = useData()
  return useMemo(() => [...new Set(data.owned_cards.map((c) => c.location))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })), [data.owned_cards])
}
function PlaceInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const places = usePlaces()
  const id = useId()
  return (
    <>
      <input className="field" list={id} value={value} maxLength={80} autoComplete="off" onChange={(e) => onChange(e.target.value)} placeholder="Archivador 1, caja azul…" />
      <datalist id={id}>
        {places.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  )
}

type Filter = 'all' | 'free' | 'deck' | 'sale' | 'review'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'free', label: 'Libres' },
  { value: 'deck', label: 'En mazos' },
  { value: 'sale', label: 'En venta' },
  { value: 'review', label: 'Sin precio en su idioma' },
]
type Legal = 'yes' | 'no' | 'all'
type Sort = 'value' | 'name' | 'set' | 'recent'

export function Collection({ initialId = null }: { initialId?: string | null }) {
  const { data, update, create } = useData()
  const toast = useToast()
  const { alloc } = useAllocation()
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query)
  const [legal, setLegal] = useState<Legal>('yes')
  const [kind, setKind] = useState<CardKind | ''>('')
  const [filter, setFilter] = useState<Filter>('all')
  const [lang, setLang] = useState('')
  const [setCode, setSetCode] = useState('')
  const [placeChoice, setPlace] = useState('')
  const places = usePlaces()
  const place = placeChoice === NO_PLACE || places.includes(placeChoice) ? placeChoice : ''
  const [sort, setSort] = useState<Sort>('value')
  const [limit, setLimit] = useState(60)
  const [openId, setOpenId] = useState<string | null>(initialId)
  const [dialog, setDialog] = useState<'add' | 'list' | 'missing' | 'prices' | null>(null)
  const [busy, setBusy] = useState(false)
  const day = today()
  const t = useMemo(() => totals(data.owned_cards, day), [data.owned_cards, day])
  const total = t.confirmed + t.estimated
  const open = data.owned_cards.find((c) => c.id === openId)

  // ---- daily reference prices (Cardmarket guide)
  async function refresh(force: boolean) {
    const ids = [...new Set(data.owned_cards.filter((c) => force || c.ref_date !== day).map((c) => `${isWestern(c.language) ? 'en' : c.language}|${c.tcgdex_id}`))].slice(0, 300)
    if (!ids.length) return
    setBusy(true)
    let i = 0
    let bad = 0
    await Promise.all(
      Array.from({ length: 5 }, async () => {
        while (i < ids.length) {
          const [l, id] = ids[i++].split('|')
          try {
            const c = await fetchCard(l, id)
            if (!c) continue
            const p = priceOf(c)
            for (const row of data.owned_cards.filter((x) => x.tcgdex_id === id && (isWestern(x.language) ? 'en' : x.language) === l)) {
              const low = isReverse(row.finish) ? (p.lowHolo ?? p.low) : p.low
              const trend = isReverse(row.finish) ? (p.trendHolo ?? p.trend) : p.trend
              if (row.ref_low !== low || row.ref_trend !== trend || row.ref_date !== day || row.cm_product !== p.cm) await update('owned_cards', row.id, { ref_low: low, ref_trend: trend, ref_date: day, cm_product: p.cm ?? row.cm_product })
            }
          } catch {
            bad++
          }
        }
      }),
    )
    setBusy(false)
    if (bad) toast('error', `${bad} precios no se han podido actualizar.`)
    else if (force) toast('success', 'Precios de referencia actualizados')
  }
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !data.owned_cards.length || !navigator.onLine) return
    started.current = true
    void refresh(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.owned_cards.length])

  // ---- legality in Standard: new cards at once, the rest every week
  const checking = useRef(new Set<string>())
  const pending = data.owned_cards.filter((c) => needsCheck(c, day) && !checking.current.has(c.id)).length
  useEffect(() => {
    if (!pending || !navigator.onLine) return
    const rows = data.owned_cards.filter((c) => needsCheck(c, day) && !checking.current.has(c.id)).slice(0, 300)
    for (const c of rows) checking.current.add(c.id)
    const ids = [...new Set(rows.map((c) => c.tcgdex_id))]
    let i = 0
    const worker = async () => {
      while (i < ids.length) {
        const id = ids[i++]
        try {
          const en = await fetchCard('en', id)
          if (!en) continue
          const standard = await isStandard(en)
          for (const c of rows) if (c.tcgdex_id === id) await update('owned_cards', c.id, { standard, standard_date: day })
        } catch {
          /* next time the collection is opened */
        }
      }
    }
    void Promise.all([worker(), worker(), worker(), worker()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, day])

  // ---- kind of trainer of the cards added before it was kept
  const kindless = data.owned_cards.filter((c) => c.category === 'trainer' && !c.subtype).length
  const asked = useRef(new Set<string>())
  useEffect(() => {
    if (!kindless || !navigator.onLine) return
    const rows = data.owned_cards.filter((c) => c.category === 'trainer' && !c.subtype)
    const keys = [...new Set(rows.map((c) => `${isWestern(c.language) ? 'en' : c.language}|${c.tcgdex_id}`))].filter((k) => !asked.current.has(k)).slice(0, 300)
    for (const k of keys) asked.current.add(k)
    let i = 0
    const worker = async () => {
      while (i < keys.length) {
        const key = keys[i++]
        const [l, id] = key.split('|')
        try {
          const c = await fetchCard(l, id)
          if (!c) continue
          for (const row of rows) if (row.tcgdex_id === id && (isWestern(row.language) ? 'en' : row.language) === l) await update('owned_cards', row.id, { subtype: trainerSubtype(c.trainerType) })
        } catch {
          asked.current.delete(key)
        }
      }
    }
    void Promise.all([worker(), worker(), worker(), worker()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindless])

  // ---- one point a day for the value chart
  useEffect(() => {
    if (!data.owned_cards.length || busy) return
    const id = setTimeout(() => {
      const snap = data.collection_snapshots.find((s) => s.date === day)
      const value = Math.round(total * 100) / 100
      if (!snap) void create('collection_snapshots', { date: day, total: value, cards: t.cards })
      else if (Math.abs(snap.total - value) >= 0.01 || snap.cards !== t.cards) void update('collection_snapshots', snap.id, { total: value, cards: t.cards })
    }, 4000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, t.cards, busy, day])

  const usedSets = useMemo(() => [...new Set(data.owned_cards.map((c) => c.set_code))].filter(Boolean).sort(), [data.owned_cards])
  const usedLangs = useMemo(() => [...new Set(data.owned_cards.map((c) => c.language))], [data.owned_cards])
  const legalCount = useMemo(() => {
    const yes = data.owned_cards.filter(isPlayable).reduce((a, c) => a + c.quantity, 0)
    return { yes, no: data.owned_cards.reduce((a, c) => a + c.quantity, 0) - yes }
  }, [data.owned_cards])
  const found = useMemo(() => {
    const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const words = fold(q).split(/\s+/).filter(Boolean)
    return data.owned_cards
      .filter((c) => {
        const v = valueOf(c, day)
        if (kind && kindOf(c) !== kind) return false
        if (lang && c.language !== lang) return false
        if (setCode && c.set_code !== setCode) return false
        if (place && (place === NO_PLACE ? c.location !== '' : c.location !== place)) return false
        if (filter === 'free' && !(alloc.free.get(c.id) ?? 0)) return false
        if (filter === 'deck' && !alloc.usedIn.has(c.id)) return false
        if (filter === 'sale' && !c.for_sale) return false
        if (filter === 'review' && v.source === 'own' && !v.stale) return false
        if (!words.length) return true
        const hay = fold(`${c.name} ${c.name_en} ${c.set_code} ${c.number} ${c.set_name} ${c.rarity} ${c.location} ${c.notes}`)
        return words.every((w) => hay.includes(w))
      })
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name)
        if (sort === 'set') return a.set_code.localeCompare(b.set_code) || Number.parseInt(a.number) - Number.parseInt(b.number)
        if (sort === 'recent') return b.created_at.localeCompare(a.created_at)
        return (valueOf(b, day).unit ?? -1) * b.quantity - (valueOf(a, day).unit ?? -1) * a.quantity || a.name.localeCompare(b.name)
      })
  }, [data.owned_cards, q, kind, lang, setCode, place, filter, sort, alloc, day])
  const list = useMemo(() => (legal === 'all' ? found : found.filter((c) => isPlayable(c) === (legal === 'yes'))), [found, legal])
  const snaps = data.collection_snapshots.filter((s) => s.total > 0).sort((a, b) => a.date.localeCompare(b.date))
  /** The oldest one: what is shown is at least this recent. */
  const refDate = data.owned_cards.reduce<string | null>((a, c) => (c.ref_date && (!a || c.ref_date < a) ? c.ref_date : a), null)
  const inDecks = [...alloc.usedIn.values()].flat().reduce((a, u) => a + u.n, 0)

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setDialog('add')}>
          <Plus className="size-4" /> Añadir carta
        </Button>
        <Button onClick={() => setDialog('list')}>
          <ListPlus className="size-4" /> Añadir lista
        </Button>
        <Button onClick={() => setDialog('missing')}>
          <ClipboardList className="size-4" /> ¿Qué me falta?
        </Button>
        {data.owned_cards.length > 0 && (
          <>
            <Button onClick={() => setDialog('prices')}>
              <Tag className="size-4" /> Poner precios{t.toReview > 0 && ` (${t.toReview})`}
            </Button>
            <Button onClick={() => void refresh(true)} disabled={busy} title="Actualizar los precios de referencia">
              <RefreshCw className={cx('size-4', busy && 'animate-spin')} /> <span className="max-sm:sr-only">Referencia</span>
            </Button>
            <Button onClick={() => downloadText(`coleccion-${day}.csv`, collectionCsv(data.owned_cards, day), 'text/csv')} title="Exportar CSV">
              <Download className="size-4" /> <span className="max-sm:sr-only">CSV</span>
            </Button>
          </>
        )}
      </div>

      {data.owned_cards.length === 0 ? (
        <Empty icon={<Layers className="size-6 text-faint" />}>
          <p>Aún no hay cartas. Busca una por su nombre o número, o pega una lista entera.</p>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Valor" value={fmtMoney(total)} hint={t.estimated > 0 ? `${fmtMoney(t.confirmed)} en su idioma · ${fmtMoney(t.estimated)} estimado` : 'todo con precio en su idioma'} />
            <Stat label="Cartas" value={t.cards} hint={`${t.unique} distintas · ${inDecks} en mazos`} />
            <Stat label="En venta" value={fmtMoney(t.forSale)} hint={`${data.owned_cards.filter((c) => c.for_sale).reduce((a, c) => a + c.quantity, 0)} cartas`} />
            <Stat label="Coste" value={t.paid ? fmtMoney(t.paid) : '—'} hint={t.paid ? `${total >= t.paid ? '+' : '−'}${fmtMoney(Math.abs(total - t.paid))} sobre lo pagado` : 'sin precio de compra'} />
          </div>
          {refDate && (
            <p className="mt-2 text-xs text-muted">
              Precios de referencia de Cardmarket: {refDate === day ? 'actualizados hoy' : `actualizados el ${fmtDate(fromDateKey(refDate), { day: 'numeric', month: 'short' })}`}. Se renuevan solos cada día a las 9:00.
            </p>
          )}
          {snaps.length > 1 && (
            <Card className="mt-3" title="Valor de la colección">
              <LineChart label="Valor de la colección" height={120} points={snaps.map((s) => ({ x: fromDateKey(s.date).getTime(), y: s.total, label: fmtDate(fromDateKey(s.date), { day: 'numeric', month: 'short' }), detail: `${s.cards} cartas` }))} format={fmtMoneyShort} />
            </Card>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Buscar en la colección</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
              <input className="field pl-8" placeholder="Nombre, MEG 104, archivador…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <select className="field w-auto" aria-label="Expansión" value={setCode} onChange={(e) => setSetCode(e.target.value)}>
              <option value="">Todas las expansiones</option>
              {usedSets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {usedLangs.length > 1 && (
              <select className="field w-auto" aria-label="Idioma" value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="">Todos los idiomas</option>
                {usedLangs.map((l) => (
                  <option key={l} value={l}>
                    {languageOf(l)[1]}
                  </option>
                ))}
              </select>
            )}
            {places.length > 0 && (
              <select className="field w-auto max-w-48" aria-label="Dónde está" value={place} onChange={(e) => setPlace(e.target.value)}>
                <option value="">En cualquier sitio</option>
                {places.map((x) => (
                  <option key={x}>{x}</option>
                ))}
                <option value={NO_PLACE}>Sin indicar</option>
              </select>
            )}
            <select className="field w-auto" aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="value">Más valiosas</option>
              <option value="name">Nombre</option>
              <option value="set">Expansión</option>
              <option value="recent">Últimas añadidas</option>
            </select>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Segmented
              value={legal}
              onChange={setLegal}
              options={[
                { value: 'yes', label: `Jugables (${legalCount.yes})` },
                { value: 'no', label: `No jugables (${legalCount.no})` },
                { value: 'all', label: 'Todas' },
              ]}
            />
            <Segmented value={kind} onChange={setKind} options={[{ value: '', label: 'Todos los tipos' }, ...CARD_KINDS.map(([value, label]) => ({ value, label }))]} />
            <Segmented value={filter} onChange={setFilter} options={FILTERS} />
          </div>

          <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {list.slice(0, limit).map((c) => (
              <CardRow key={c.id} c={c} alloc={alloc} day={day} onOpen={() => setOpenId(c.id)} />
            ))}
          </ul>
          {!list.length && (
            <Empty>
              <p>{found.length ? `Ninguna carta ${legal === 'yes' ? 'jugable' : 'no jugable'} coincide.` : 'Ninguna carta coincide.'}</p>
              {found.length > 0 && (
                <button type="button" className="mt-1 min-h-9 text-sm font-medium text-accent hover:underline" onClick={() => setLegal('all')}>
                  Ver también las {legal === 'yes' ? 'no jugables' : 'jugables'} ({found.length})
                </button>
              )}
            </Empty>
          )}
          {list.length > limit && (
            <button type="button" className="mt-3 min-h-11 w-full text-sm font-medium text-accent hover:underline" onClick={() => setLimit((l) => l + 120)}>
              Ver más ({list.length - limit})
            </button>
          )}
        </>
      )}

      {open && <CardModal key={open.id} card={open} alloc={alloc} onClose={() => setOpenId(null)} />}
      {dialog === 'add' && <AddCard onClose={() => setDialog(null)} />}
      {dialog === 'list' && <AddList onClose={() => setDialog(null)} />}
      {dialog === 'missing' && <MissingModal alloc={alloc} onClose={() => setDialog(null)} />}
      {dialog === 'prices' && <PriceQueue onClose={() => setDialog(null)} />}
    </>
  )
}

function Thumb({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [src])
  return (
    <span className={cx('block aspect-[245/342] shrink-0 overflow-hidden rounded-md border border-line bg-surface-2', className)}>
      {src && !bad ? (
        <img src={src} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setBad(true)} />
      ) : (
        <span className="grid size-full place-items-center p-1 text-center text-[9px] leading-tight text-muted">{name}</span>
      )}
    </span>
  )
}

const LangBadge = ({ code }: { code: string }) => <Badge className="border-line-strong text-muted">{languageOf(code)[3]}</Badge>

function CardRow({ c, alloc, day, onOpen }: { c: OwnedCard; alloc: Allocation; day: string; onOpen: () => void }) {
  const v = valueOf(c, day)
  const free = alloc.free.get(c.id) ?? c.quantity
  const used = alloc.usedIn.get(c.id)
  return (
    <li className="min-w-0">
      <button type="button" onClick={onOpen} className="card flex w-full items-center gap-3 p-2.5 text-left transition hover:border-line-strong">
        <Thumb src={image(c.image)} name={c.name} className="w-12" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            <span className="num mr-1 text-muted">{c.quantity}×</span>
            {c.name}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <span className="num">
              {c.set_code} {c.number}
            </span>
            <LangBadge code={c.language} />
            <span>{c.condition}</span>
            {c.finish !== 'normal' && c.finish !== 'holo' && <span>{finishName(c.finish)}</span>}
            {c.grade_company && (
              <span>
                {c.grade_company} {c.grade}
              </span>
            )}
            {!isPlayable(c) && <Badge className="border-line-strong text-muted">No jugable</Badge>}
            {c.for_sale && <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">Venta</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted" title={used?.map((u) => `${u.n} en ${u.deck}`).join(', ')}>
            {c.location && (
              <>
                <MapPin className="mr-0.5 inline size-3 align-[-2px]" aria-label="Está en" />
                {c.location} ·{' '}
              </>
            )}
            {used ? `${free} libres · ${used.map((u) => `${u.n} en ${u.deck}`).join(', ')}` : 'Libre'}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={cx('num block text-sm font-semibold', v.source !== 'own' && 'text-muted')}>
            {v.unit === null ? '—' : `${v.source === 'ref' ? '≈ ' : ''}${fmtMoney(v.unit)}`}
          </span>
          {v.unit !== null && c.quantity > 1 && <span className="num block text-[11px] text-muted">{fmtMoney(v.unit * c.quantity)}</span>}
          {v.stale && <span className="block text-[10px] text-amber-800 dark:text-amber-300">antiguo</span>}
        </span>
      </button>
    </li>
  )
}

// ----------------------------------------------------------------- one card
function CardModal({ card: c, alloc, onClose }: { card: OwnedCard; alloc: Allocation; onClose: () => void }) {
  const { update, remove } = useData()
  const [f, setF] = useState(c)
  const [own, setOwn] = useState(c.own_price === null ? '' : String(c.own_price).replace('.', ','))
  const [paid, setPaid] = useState(c.paid === null ? '' : String(c.paid).replace('.', ','))
  const [info, setInfo] = useState<ApiCard | null>(null)
  const set = <K extends keyof OwnedCard>(k: K, v: OwnedCard[K]) => setF((x) => ({ ...x, [k]: v }))
  const used = alloc.usedIn.get(c.id)

  useEffect(() => {
    let live = true
    fetchCard(c.language, c.tcgdex_id).then((x) => live && setInfo(x), () => {})
    return () => {
      live = false
    }
  }, [c.language, c.tcgdex_id])

  const price = own.trim() ? parseAmount(own) : null
  const cost = paid.trim() ? parseAmount(paid) : null
  const ok = f.quantity >= 1 && (!own.trim() || price !== null) && (!paid.trim() || cost !== null)

  async function save() {
    if (!ok) return
    onClose()
    const { id: _i, user_id: _u, created_at: _c, ...row } = f
    row.location = row.location.trim()
    if (f.language !== c.language) {
      // Another language: its own name and scan, and the old price no longer applies.
      const local = await fetchCard(f.language, c.tcgdex_id).catch(() => null)
      if (local) Object.assign(row, { name: local.name, image: local.image ?? c.image, rarity: local.rarity ?? c.rarity })
      if (price === c.own_price) {
        await update('owned_cards', c.id, { ...row, paid: cost, own_price: null, own_price_date: null })
        return
      }
    }
    await update('owned_cards', c.id, { ...row, paid: cost, own_price: price, own_price_date: price === null ? null : price !== c.own_price ? today() : (c.own_price_date ?? today()) })
  }

  return (
    <Modal
      open
      full
      onClose={onClose}
      title={c.name}
      footer={
        <>
          <Button
            variant="danger"
            className="mr-auto"
            onClick={() => {
              onClose()
              void remove('owned_cards', c.id)
            }}
          >
            <Trash2 className="size-4" /> <span className="max-sm:sr-only">Eliminar</span>
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!ok} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <div className="mx-auto w-44 md:w-full">
          <Thumb src={image(c.image, 'high') ?? image(info?.image, 'high')} name={c.name} className="w-full rounded-xl" />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label={`Mínimo en ${languageOf(f.language)[1].toLowerCase()} (€)`} className="min-w-40 flex-1">
                <input className={cx('field num', own.trim() && price === null && 'border-rose-500')} inputMode="decimal" value={own} onChange={(e) => setOwn(e.target.value)} placeholder={c.ref_low ? `≈ ${String(c.ref_low).replace('.', ',')} en cualquier idioma` : '—'} />
              </Field>
              <a href={cardmarketUrl(f)} target="_blank" rel="noreferrer noopener" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-surface-2">
                Ver en Cardmarket <ExternalLink className="size-4" />
              </a>
            </div>
            <p className="mt-2 text-xs text-muted">
              Es el precio al que puedes venderla. Referencia diaria de Cardmarket (cualquier idioma): mínimo {c.ref_low === null ? '—' : fmtMoney(c.ref_low)} · tendencia {c.ref_trend === null ? '—' : fmtMoney(c.ref_trend)}
              {c.own_price_date && ` · anotado el ${fmtDate(fromDateKey(c.own_price_date), { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Cantidad">
              <Quantity value={f.quantity} onChange={(n) => set('quantity', n)} />
            </Field>
            <Field label="Idioma">
              <select className="field" value={f.language} onChange={(e) => set('language', e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l[0]} value={l[0]}>
                    {l[1]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estado">
              <select className="field" value={f.condition} onChange={(e) => set('condition', e.target.value)}>
                {CONDITIONS.map((x) => (
                  <option key={x[0]} value={x[0]}>
                    {x[0]} · {x[1]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Acabado">
              <select className="field" value={f.finish} onChange={(e) => set('finish', e.target.value)}>
                {FINISHES.map((x) => (
                  <option key={x[0]} value={x[0]}>
                    {x[1]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dónde está">
              <PlaceInput value={f.location} onChange={(v) => set('location', v)} />
            </Field>
            <Field label="Pagado (€/u.)">
              <input className={cx('field num', paid.trim() && cost === null && 'border-rose-500')} inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} />
            </Field>
            <Field label="Gradeada por">
              <select className="field" value={f.grade_company} onChange={(e) => setF((x) => ({ ...x, grade_company: e.target.value, grade: e.target.value ? x.grade : '' }))}>
                <option value="">Sin gradear</option>
                {GRADERS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            {f.grade_company && (
              <Field label="Nota">
                <input className="field num" value={f.grade} maxLength={10} onChange={(e) => set('grade', e.target.value)} placeholder="10" />
              </Field>
            )}
            <Field label="Conseguida el">
              <input type="date" className="field num" value={f.acquired_at ?? ''} onChange={(e) => set('acquired_at', e.target.value || null)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {(
              [
                ['for_sale', 'En venta'],
                ['first_edition', 'Primera edición'],
                ['signed', 'Firmada'],
                ['altered', 'Alterada'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={f[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
              </label>
            ))}
          </div>
          <Field label="Notas">
            <textarea className="field min-h-16" value={f.notes} maxLength={2000} onChange={(e) => set('notes', e.target.value)} />
          </Field>
          <p className="text-sm text-muted">{used ? `En mazos: ${used.map((u) => `${u.n} en ${u.deck}`).join(', ')} · ${alloc.free.get(c.id) ?? 0} libres` : 'No está en ningún mazo montado.'}</p>
        </div>

        <CardInfo card={c} info={info} />
      </div>
    </Modal>
  )
}

function Quantity({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span className="flex items-center rounded-lg border border-line bg-surface-2">
      <button type="button" aria-label="Una menos" disabled={value <= 1} onClick={() => onChange(value - 1)} className="grid size-9 place-items-center disabled:opacity-30">
        <Minus className="size-4" />
      </button>
      <input className="num w-full min-w-0 bg-transparent text-center outline-none" aria-label="Cantidad" inputMode="numeric" value={value} onChange={(e) => onChange(Math.min(9999, Math.max(1, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 1))))} />
      <button type="button" aria-label="Una más" onClick={() => onChange(Math.min(9999, value + 1))} className="grid size-9 place-items-center">
        <Plus className="size-4" />
      </button>
    </span>
  )
}

/** Everything printed on the card, in its language. */
function CardInfo({ card: c, info }: { card: OwnedCard; info: ApiCard | null }) {
  const set = SET_BY_ID.get(info?.set.id ?? '')
  const rows: [string, string | undefined | null][] = [
    ['Expansión', `${c.set_name} (${c.set_code})`],
    ['Número', set?.official ? `${c.number}/${set.official}` : c.number],
    ['Rareza', info?.rarity ?? c.rarity],
    ['Regulación', info?.regulationMark],
    ['Tipo', info?.types?.join(', ') ?? info?.trainerType ?? info?.energyType],
    ['PS', info?.hp ? String(info.hp) : null],
    ['Fase', info?.stage && `${info.stage}${info.evolveFrom ? ` (de ${info.evolveFrom})` : ''}`],
    ['Debilidad', info?.weaknesses?.map((w) => `${w.type} ${w.value ?? ''}`).join(', ')],
    ['Resistencia', info?.resistances?.map((w) => `${w.type} ${w.value ?? ''}`).join(', ')],
    ['Retirada', info?.category && categoryOf(info) === 'pokemon' ? String(info.retreat ?? 0) : null],
    ['Ilustrador', info?.illustrator],
    ['Legal', [isPlayable(c) && c.standard && 'Estándar', info?.legal?.expanded && isWestern(c.language) && 'Expandido'].filter(Boolean).join(', ') || (c.standard == null && isWestern(c.language) ? null : 'No')],
  ]
  return (
    <div className="min-w-0 space-y-3 text-sm md:col-span-2 xl:col-span-1 xl:border-l xl:border-line xl:pl-6">
      <dl className="space-y-1.5">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
      </dl>
      {info?.abilities?.map((a) => (
        <div key={a.name} className="border-t border-line pt-2">
          <div className="font-medium">
            {a.type ?? 'Habilidad'}: {a.name}
          </div>
          <p className="text-xs text-muted">{a.effect}</p>
        </div>
      ))}
      {info?.attacks?.map((a) => (
        <div key={a.name} className="border-t border-line pt-2">
          <div className="flex justify-between gap-2 font-medium">
            <span>
              {a.name} <span className="text-xs font-normal text-muted">{a.cost?.join(' ')}</span>
            </span>
            <span className="num">{a.damage}</span>
          </div>
          {a.effect && <p className="text-xs text-muted">{a.effect}</p>}
        </div>
      ))}
      {info?.effect && <p className="border-t border-line pt-2 text-xs text-muted">{info.effect}</p>}
    </div>
  )
}

// --------------------------------------------------------------------- add
interface Defaults {
  language: string
  condition: string
  finish: string
  location: string
}
const DEF_KEY = 'ph-card-defaults'
function readDefaults(): Defaults {
  try {
    return { language: 'es', condition: 'NM', finish: 'auto', location: '', ...(JSON.parse(localStorage.getItem(DEF_KEY) ?? '{}') as Partial<Defaults>) }
  } catch {
    return { language: 'es', condition: 'NM', finish: 'auto', location: '' }
  }
}
const writeDefaults = (d: Defaults) => {
  try {
    localStorage.setItem(DEF_KEY, JSON.stringify(d))
  } catch {
    /* ignore */
  }
}

/** Build a collection row from the card in its language plus the English one (for matching and prices). */
export function buildRow(local: ApiCard, en: ApiCard | null, d: Defaults, quantity: number): NewRow<'owned_cards'> {
  const set = SET_BY_ID.get(local.set.id)
  const ref = en ?? local
  const p = priceOf(ref)
  const v = ref.variants ?? local.variants
  const finish = d.finish !== 'auto' ? d.finish : v?.holo && !v?.normal ? 'holo' : 'normal'
  return {
    tcgdex_id: local.id, set_code: set?.code || local.set.id.toUpperCase(), set_name: (d.language === 'es' ? set?.es : set?.en) ?? local.set.name, number: local.localId.replace(/^0+(?=\d)/, ''), name: local.name, name_en: en?.name ?? local.name,
    category: categoryOf(ref), signature: en ? signatureOf(en) : `x|${local.id}`, rarity: local.rarity ?? en?.rarity ?? '', image: local.image ?? en?.image ?? null, language: d.language, condition: d.condition, finish,
    first_edition: false, signed: false, altered: false, grade_company: '', grade: '', quantity, location: d.location.trim(), for_sale: false, paid: null, acquired_at: today(),
    cm_product: p.cm, ref_low: isReverse(finish) ? (p.lowHolo ?? p.low) : p.low, ref_trend: isReverse(finish) ? (p.trendHolo ?? p.trend) : p.trend, ref_date: today(), standard: en && standardPrint(en) ? true : null, standard_date: en && standardPrint(en) ? today() : null, own_price: null, own_price_date: null, subtype: categoryOf(ref) === 'trainer' ? trainerSubtype(ref.trainerType) : '', notes: '',
  }
}

/** Add to an existing identical stack or create it. */
function useAddRows() {
  const { data, createMany, update } = useData()
  return async (rows: NewRow<'owned_cards'>[]) => {
    // Without a place it joins the stack you have; with one, the stack in that place.
    const key = (c: NewRow<'owned_cards'>) => `${stackKey(c)}|${c.location}`
    const fresh = new Map<string, NewRow<'owned_cards'>>()
    for (const r of rows) {
      const k = key(r)
      const old = data.owned_cards.find((c) => (r.location ? key(c) === k : stackKey(c) === stackKey(r)))
      if (old) await update('owned_cards', old.id, { quantity: old.quantity + r.quantity })
      else if (fresh.has(k)) fresh.get(k)!.quantity += r.quantity
      else fresh.set(k, { ...r })
    }
    if (fresh.size) return (await createMany('owned_cards', [...fresh.values()])) !== null
    return true
  }
}

function DefaultsBar({ value, onChange }: { value: Defaults; onChange: (d: Defaults) => void }) {
  const set = (patch: Partial<Defaults>) => {
    const next = { ...value, ...patch }
    writeDefaults(next)
    onChange(next)
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Field label="Idioma">
        <select className="field" value={value.language} onChange={(e) => set({ language: e.target.value })}>
          {LANGUAGES.map((l) => (
            <option key={l[0]} value={l[0]}>
              {l[1]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Estado">
        <select className="field" value={value.condition} onChange={(e) => set({ condition: e.target.value })}>
          {CONDITIONS.map((x) => (
            <option key={x[0]} value={x[0]}>
              {x[0]} · {x[1]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Acabado">
        <select className="field" value={value.finish} onChange={(e) => set({ finish: e.target.value })}>
          <option value="auto">El habitual de la carta</option>
          {FINISHES.map((x) => (
            <option key={x[0]} value={x[0]}>
              {x[1]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Dónde está">
        <PlaceInput value={value.location} onChange={(location) => set({ location })} />
      </Field>
    </div>
  )
}

function AddCard({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const addRows = useAddRows()
  const [d, setD] = useState(readDefaults)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ApiHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Record<string, number>>({})

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setHits(null)
      return
    }
    let live = true
    const id = setTimeout(async () => {
      setBusy(true)
      try {
        let list = await searchCards(d.language, q)
        // The name may be known only in English.
        if (!list.length && d.language !== 'en') list = await searchCards('en', q)
        if (live) setHits(list)
      } catch {
        if (live) toast('error', 'No se ha podido buscar. Comprueba la conexión.')
      } finally {
        if (live) setBusy(false)
      }
    }, 350)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [query, d.language, toast])

  async function add(h: ApiHit) {
    setAdding(h.id)
    try {
      const [local, en] = await Promise.all([fetchCard(d.language, h.id), isWestern(d.language) ? fetchCard('en', h.id) : Promise.resolve(null)])
      const base = local ?? en
      if (!base) throw new Error('not found')
      if (await addRows([buildRow(base, en, d, 1)])) setAdded((a) => ({ ...a, [h.id]: (a[h.id] ?? 0) + 1 }))
    } catch {
      toast('error', 'No se han podido leer los datos de la carta.')
    } finally {
      setAdding(null)
    }
  }
  const setOf = (id: string) => SET_BY_ID.get(id.slice(0, id.lastIndexOf('-')))

  return (
    <Modal open full onClose={onClose} title="Añadir cartas" footer={<Button variant="primary" onClick={onClose}>Listo</Button>}>
      <div className="mx-auto max-w-5xl space-y-4">
        <DefaultsBar value={d} onChange={setD} />
        <label className="relative block">
          <span className="sr-only">Buscar carta</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input className="field h-11 pl-9" placeholder="Nombre de la carta, o código y número: MEG 104" value={query} onChange={(e) => setQuery(e.target.value)} />
          {busy && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-faint" />}
        </label>
        {hits && !hits.length && !busy && <Empty>Ninguna carta coincide en {languageOf(d.language)[1].toLowerCase()} ni en inglés.</Empty>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
          {hits?.slice(0, 80).map((h) => (
            <button key={h.id} type="button" onClick={() => void add(h)} disabled={adding !== null} className="relative min-w-0 text-left disabled:opacity-60" aria-label={`Añadir ${h.name} ${setOf(h.id)?.code ?? ''} ${h.localId}`}>
              <Thumb src={image(h.image)} name={h.name} className="w-full" />
              <span className="mt-1 block truncate text-xs">{h.name}</span>
              <span className="num block truncate text-[10px] text-muted">
                {setOf(h.id)?.code ?? ''} {h.localId}
              </span>
              {adding === h.id && <Loader2 className="absolute top-2 right-2 size-5 animate-spin rounded-full bg-surface p-0.5" />}
              {added[h.id] && adding !== h.id && (
                <span className="num absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">
                  <CheckIcon className="size-3" /> {added[h.id]}
                </span>
              )}
            </button>
          ))}
        </div>
        {hits && hits.length > 0 && <p className="text-xs text-muted">Cada toque añade una copia con el idioma, estado y acabado de arriba.</p>}
      </div>
    </Modal>
  )
}

function AddList({ onClose }: { onClose: () => void }) {
  const { data } = useData()
  const toast = useToast()
  const addRows = useAddRows()
  const [d, setD] = useState(readDefaults)
  const [text, setText] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [failed, setFailed] = useState<string[]>([])
  const cards = useMemo(() => parseDeck(text).cards, [text])
  const total = cards.reduce((a, c) => a + c.count, 0)

  async function save() {
    setFailed([])
    setProgress(0)
    const rows: NewRow<'owned_cards'>[] = []
    const bad: string[] = []
    let i = 0
    let done = 0
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (i < cards.length) {
          const line = cards[i++]
          try {
            if (!line.set) throw new Error('no set')
            const en = await fetchByNumber('en', line.set, line.number)
            if (!en) throw new Error('not found')
            const local = d.language === 'en' ? en : ((await fetchCard(d.language, en.id)) ?? en)
            rows.push(buildRow(local, en, d, line.count))
          } catch {
            bad.push([line.count, line.name, line.set, line.number].filter(Boolean).join(' '))
          }
          setProgress(++done)
        }
      }),
    )
    if (rows.length) await addRows(rows)
    setProgress(null)
    setFailed(bad)
    toast(bad.length ? 'error' : 'success', bad.length ? bad.length === 1 ? 'Una línea no se ha encontrado' : `${bad.length} líneas no se han encontrado` : `${total} cartas añadidas`)
    if (!bad.length) onClose()
    else setText(bad.join('\n'))
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Añadir una lista"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!total || progress !== null} onClick={() => void save()}>
            {progress !== null ? `${progress} de ${cards.length}…` : `Añadir ${total || ''} cartas`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <DefaultsBar value={d} onChange={setD} />
        {data.tcg_decks.length > 0 && (
          <Field label="Desde un mazo">
            <select className="field" value="" onChange={(e) => setText(data.tcg_decks.find((x) => x.id === e.target.value)?.list_text ?? text)}>
              <option value="">Elegir mazo…</option>
              {data.tcg_decks.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Lista (una carta por línea, con código y número)">
          <textarea className="field min-h-56 font-mono text-xs" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder={'4 Mega Kangaskhan ex MEG 104\n2 Latias ex SSP 76'} />
        </Field>
        {failed.length > 0 && <p className="text-sm text-rose-700 dark:text-rose-400">No se han encontrado estas líneas; corrígelas y vuelve a probar. El resto ya está añadido.</p>}
      </div>
    </Modal>
  )
}

// ----------------------------------------------------------------- missing
function MissingModal({ alloc, onClose }: { alloc: Allocation; onClose: () => void }) {
  const { data } = useData()
  const toast = useToast()
  const [text, setText] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(true)
  const deferred = useDeferredValue(text)
  const parsed = useMemo(() => parseDeck(deferred, META.aceSpecs), [deferred])
  const { prints, loading, failed } = usePrints(parsed.cards)
  const lines = useMemo(() => missingFor(parsed.cards, data.owned_cards, alloc, prints), [parsed, data.owned_cards, alloc, prints])
  const missing = lines.reduce((a, l) => a + l.missing, 0)
  const cost = lines.reduce((a, l) => a + l.missing * (l.print?.low ?? 0), 0)
  const unknown = lines.filter((l) => l.unverified && l.missing > 0).length
  const shown = onlyMissing ? lines.filter((l) => l.missing > 0) : lines

  async function copy() {
    try {
      await navigator.clipboard.writeText(missingText(lines))
      toast('success', 'Lista de lo que falta copiada')
    } catch {
      toast('error', 'No se ha podido copiar')
    }
  }

  return (
    <Modal
      open
      full
      onClose={onClose}
      title="¿Qué me falta?"
      footer={
        <>
          <Button className="mr-auto" disabled={!missing} onClick={() => void copy()}>
            <Copy className="size-4" /> Copiar lo que falta
          </Button>
          <Button variant="primary" onClick={onClose}>
            Cerrar
          </Button>
        </>
      }
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Field label="Desde un mazo guardado">
            <select className="field" value="" onChange={(e) => setText(data.tcg_decks.find((x) => x.id === e.target.value)?.list_text ?? text)}>
              <option value="">Elegir mazo…</option>
              {data.tcg_decks.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="…o pega una lista">
            <textarea className="field min-h-72 font-mono text-xs" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder={'4 Dragapult ex TWM 130\n4 Dreepy TWM 128\n…'} />
          </Field>
          <p className="text-xs text-muted">Solo cuentan tus cartas libres: las que están en mazos montados no se tocan. Las reimpresiones de la misma carta valen igual.</p>
        </div>
        <div className="min-w-0 lg:border-l lg:border-line lg:pl-6">
          {!parsed.cards.length ? (
            <Empty>Pega una lista para ver qué te falta.</Empty>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-3 gap-3">
                <Stat label="Faltan" value={missing} hint={`de ${parsed.total}`} />
                <Stat label="Tengo libres" value={parsed.total - missing} />
                <Stat label="Coste" value={`≈ ${fmtMoney(cost)}`} hint="mínimo, cualquier idioma" />
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Segmented value={onlyMissing ? 'missing' : 'all'} onChange={(v) => setOnlyMissing(v === 'missing')} options={[{ value: 'missing', label: 'Solo lo que falta' }, { value: 'all', label: 'Toda la lista' }]} />
                {loading && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <Loader2 className="size-3.5 animate-spin" /> Comprobando reimpresiones…
                  </span>
                )}
              </div>
              {(failed || (unknown > 0 && !loading)) && (
                <p className="mb-3 text-xs text-amber-800 dark:text-amber-300">{failed ? 'No se han podido consultar todas las cartas: sin conexión solo se compara la edición exacta.' : `${unknown} cartas no se han podido identificar: solo se ha comparado su edición exacta.`}</p>
              )}
              <ul className="divide-y divide-line rounded-lg border border-line">
                {shown.map((l, i) => (
                  <li key={i} className="flex min-h-14 items-center gap-3 px-3 py-1.5">
                    <Thumb src={image(l.print?.image)} name={l.line.name} className="w-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {l.line.name}{' '}
                        <span className="num text-xs text-muted">
                          {l.line.set} {l.line.number}
                        </span>
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        Pide {l.need} · libres {l.free}
                        {l.lockedIn.length > 0 && ` · ${l.lockedIn.map((u) => `${u.n} en ${u.deck}`).join(', ')}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {l.missing > 0 ? (
                        <>
                          <span className="num block text-sm font-semibold text-rose-700 dark:text-rose-400">Faltan {l.missing}</span>
                          {l.print?.low && <span className="num block text-[11px] text-muted">≈ {fmtMoney(l.print.low * l.missing)}</span>}
                        </>
                      ) : (
                        <CheckIcon className="size-4 text-emerald-600" aria-label="Completa" />
                      )}
                    </span>
                  </li>
                ))}
                {!shown.length && <li className="p-4 text-sm">¡Tienes todas las cartas libres para esta lista!</li>}
              </ul>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ prices
/** One card after another: open Cardmarket filtered by language, type the lowest price, next. */
function PriceQueue({ onClose }: { onClose: () => void }) {
  const { data, update } = useData()
  const day = today()
  const [queue] = useState(() =>
    data.owned_cards
      .filter((c) => {
        const v = valueOf(c, day)
        return v.source !== 'own' || v.stale
      })
      .sort((a, b) => (b.ref_trend ?? b.ref_low ?? 0) * b.quantity - (a.ref_trend ?? a.ref_low ?? 0) * a.quantity)
      .map((c) => c.id),
  )
  const [at, setAt] = useState(0)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const c = data.owned_cards.find((x) => x.id === queue[at])
  const price = parseAmount(text)

  async function save() {
    if (!c || price === null) return
    const id = c.id
    setText('')
    setAt((i) => i + 1)
    input.current?.focus()
    await update('owned_cards', id, { own_price: price, own_price_date: day })
  }

  return (
    <Modal open wide onClose={onClose} title={`Poner precios · ${Math.min(at + 1, queue.length)} de ${queue.length}`} footer={<Button onClick={onClose}>Cerrar</Button>}>
      {!c ? (
        <Empty>{queue.length ? '¡Hecho! Todas tienen precio en su idioma.' : 'Todas tus cartas tienen un precio reciente en su idioma.'}</Empty>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Thumb src={image(c.image)} name={c.name} className="w-20" />
            <div className="min-w-0">
              <div className="font-semibold">{c.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span className="num">
                  {c.set_code} {c.number}
                </span>
                <LangBadge code={c.language} /> {c.condition} · {finishName(c.finish)} · {c.quantity} {c.quantity === 1 ? 'copia' : 'copias'}
              </div>
              <div className="mt-1 text-xs text-muted">
                Referencia: mínimo {c.ref_low === null ? '—' : fmtMoney(c.ref_low)} · tendencia {c.ref_trend === null ? '—' : fmtMoney(c.ref_trend)}
                {c.own_price !== null && ` · antes ${fmtMoney(c.own_price)}`}
              </div>
            </div>
          </div>
          <a href={cardmarketUrl(c)} target="_blank" rel="noreferrer noopener" className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 text-sm font-medium hover:border-line-strong">
            Abrir en Cardmarket ({languageOf(c.language)[1]}) <ExternalLink className="size-4" />
          </a>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <input ref={input} autoFocus className="field num h-11" inputMode="decimal" aria-label="Precio mínimo en su idioma" placeholder={`Mínimo en ${languageOf(c.language)[1].toLowerCase()} (€)`} value={text} onChange={(e) => setText(e.target.value)} />
            <Button type="submit" variant="primary" className="h-11" disabled={price === null}>
              Guardar y siguiente
            </Button>
          </form>
          <div className="flex justify-between text-sm">
            <button type="button" className="min-h-9 text-muted hover:text-fg disabled:opacity-40" disabled={at === 0} onClick={() => setAt((i) => i - 1)}>
              ← Anterior
            </button>
            <button type="button" className="min-h-9 text-muted hover:text-fg" onClick={() => setAt((i) => i + 1)}>
              Saltar →
            </button>
          </div>
          <p className="text-xs text-muted">Cardmarket no ofrece a otras aplicaciones el precio por idioma, así que se anota a mano. Empieza por las más valiosas.</p>
        </div>
      )}
    </Modal>
  )
}

