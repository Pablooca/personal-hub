/**
 * Pure helpers for the Apple Pay webhook — no Deno/Node APIs, so they can be
 * unit-tested anywhere. iOS Shortcuts sends values formatted with the phone's
 * locale (e.g. "14,50 €", "22 nov 2026, 17:31"), so everything is lenient.
 */

// ---------------------------------------------------------------------------
// Amount
// ---------------------------------------------------------------------------

/**
 * "14,50 €" → 14.5 · "14.50" → 14.5 · "1.234,56 €" → 1234.56 · "€1,234.56" → 1234.56
 * Negative values (some banks report charges as negatives) are made positive.
 * Returns null for anything that is not a positive amount that fits numeric(10,2).
 */
export function parseAmount(input: unknown): number | null {
  if (typeof input === 'number') return valid(Math.abs(input))
  if (typeof input !== 'string') return null

  let s = input.replace(/[^\d.,-]/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  if (lastComma > -1 && lastDot > -1) {
    // Both present: whichever comes last is the decimal separator.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma > -1) {
    // "14,5" / "14,50" → decimal comma; "1,234" → thousands separator.
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" / "12.345.678" → Spanish thousands separators.
    s = s.replace(/\./g, '')
  }
  return valid(Math.abs(Number(s)))
}

function valid(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0 || n >= 100_000_000) return null
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

/** YYYY-MM-DD for "now" in the given IANA time zone (e.g. Europe/Madrid). */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().split('T')[0]
  }
}

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)
}

/**
 * Accepts ISO strings, "22/11/2026", "22-11-26", "22 nov 2026, 17:31",
 * "22 de noviembre de 2026", "Nov 22, 2026". Anything unparseable, or more
 * than a year in the past / in the future, falls back to today (in `timeZone`).
 */
export function parseDate(input: unknown, timeZone = 'Europe/Madrid', now = new Date()): string {
  const today = todayIn(timeZone, now)
  if (typeof input !== 'string' || !input.trim()) return today
  const raw = input.trim()
  const s = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

  let y = 0
  let m = 0
  let d = 0
  let match: RegExpMatchArray | null

  if ((match = s.match(/^(\d{4})-(\d{2})-(\d{2})(t\d{2}:\d{2}.*)?/))) {
    if (match[4] && /(z|[+-]\d{2}:?\d{2})$/.test(s)) {
      // Full timestamp with offset → convert to the owner's local day.
      const t = new Date(raw)
      if (!Number.isNaN(t.getTime())) return clamp(todayIn(timeZone, t), today)
    }
    ;[y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/))) {
    ;[d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = s.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\.?,?\s+(?:de\s+)?(\d{2,4})\b/))) {
    ;[d, m, y] = [Number(match[1]), MONTHS[match[2]] ?? 0, Number(match[3])]
  } else if ((match = s.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/))) {
    ;[m, d, y] = [MONTHS[match[1]] ?? 0, Number(match[2]), Number(match[3])]
  } else {
    return today
  }

  if (y < 100) y += 2000
  if (!isRealDate(y, m, d)) return today
  return clamp(`${y}-${pad(m)}-${pad(d)}`, today)
}

function clamp(date: string, today: string): string {
  const diff = daysBetween(date, today)
  return diff > 1 || diff < -366 ? today : date
}

// ---------------------------------------------------------------------------
// Auto-categorisation
// ---------------------------------------------------------------------------

export const UNCATEGORIZED = 'uncategorized'

/**
 * Ordered rules: first match wins, so more specific keywords go first
 * (e.g. "UBER EATS" → dining before "UBER" → transport).
 * Keys must match category names used in the app (see src/lib/categories.ts).
 * Extend freely — keywords are matched as whole words, case/accent-insensitive.
 */
export const CATEGORY_RULES: ReadonlyArray<readonly [category: string, keywords: readonly string[]]> = [
  ['dining', ['UBER EATS', 'GLOVO', 'JUST EAT', 'DELIVEROO', 'TELEPIZZA', 'DOMINOS', 'MCDONALDS', "MCDONALD'S", 'BURGER KING', 'STARBUCKS', 'KFC', 'TGB', '100 MONTADITOS', 'RODILLA', 'VIPS', 'GOIKO', 'RESTAURANTE', 'CAFETERIA', 'BAR']],
  ['groceries', ['MERCADONA', 'CARREFOUR', 'LIDL', 'ALDI', 'DIA', 'EROSKI', 'ALCAMPO', 'HIPERCOR', 'CONSUM', 'AHORRAMAS', 'SUPERCOR', 'BONPREU', 'CAPRABO', 'GADIS', 'FROIZ', 'MAS Y MAS', 'SPAR', 'SUPERMERCADO']],
  ['transport', ['ALSA', 'RENFE', 'OUIGO', 'IRYO', 'UBER', 'CABIFY', 'BOLT', 'FREENOW', 'FREE NOW', 'BLABLACAR', 'METRO', 'EMT', 'TMB', 'BICIMAD', 'REPSOL', 'CEPSA', 'GALP', 'SHELL', 'BP', 'PLENOIL', 'BALLENOIL', 'PARKING', 'EMPARK', 'TELPARK', 'VUELING', 'IBERIA', 'RYANAIR', 'AENA']],
  ['subscriptions', ['NETFLIX', 'SPOTIFY', 'APPLE.COM', 'ICLOUD', 'HBO', 'DISNEY', 'PRIME VIDEO', 'YOUTUBE', 'DAZN', 'MOVISTAR', 'CHATGPT', 'OPENAI', 'GITHUB', 'NOTION']],
  ['health', ['FARMACIA', 'PARAFARMACIA', 'SANITAS', 'DKV', 'ADESLAS', 'CLINICA', 'DENTAL', 'OPTICA']],
  ['leisure', ['CINESA', 'YELMO', 'KINEPOLIS', 'CINE', 'TEATRO', 'TICKETMASTER', 'STEAM', 'PLAYSTATION', 'NINTENDO', 'XBOX']],
  ['education', ['UDEMY', 'COURSERA', 'CASA DEL LIBRO', 'UNIVERSIDAD', 'ACADEMIA']],
  ['shopping', ['AMAZON', 'AMZN', 'ALIEXPRESS', 'ZARA', 'PULL&BEAR', 'BERSHKA', 'MANGO', 'PRIMARK', 'H&M', 'EL CORTE INGLES', 'DECATHLON', 'IKEA', 'LEROY MERLIN', 'MEDIA MARKT', 'MEDIAMARKT', 'FNAC', 'PCCOMPONENTES', 'APPLE STORE', 'SHEIN']],
]

const normaliseText = (s: string) =>
  s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const COMPILED = CATEGORY_RULES.map(
  ([category, keywords]) =>
    [category, keywords.map((k) => new RegExp(`(^|[^A-Z0-9])${escapeRe(normaliseText(k))}([^A-Z0-9]|$)`))] as const,
)

export function categorize(merchant: string): string {
  const m = normaliseText(merchant)
  for (const [category, patterns] of COMPILED) {
    if (patterns.some((re) => re.test(m))) return category
  }
  return UNCATEGORIZED
}

/** The user's own rules (table category_rules) go first; the longest pattern wins. */
export function matchOwnRule(rules: ReadonlyArray<{ pattern: string; category: string }>, merchant: string): string | null {
  const squeeze = (s: string) => normaliseText(s).replace(/\s+/g, ' ').trim()
  const m = squeeze(merchant)
  const hit = [...rules].filter((r) => squeeze(r.pattern) && m.includes(squeeze(r.pattern))).sort((a, b) => b.pattern.length - a.pattern.length)[0]
  return hit?.category ?? null
}

/** Spanish labels for the notification text. */
const LABELS: Record<string, string> = {
  groceries: 'Supermercado',
  dining: 'Restaurantes',
  transport: 'Transporte',
  subscriptions: 'Suscripciones',
  health: 'Salud',
  leisure: 'Ocio',
  education: 'Formación',
  shopping: 'Compras',
  housing: 'Vivienda',
  other: 'Otros',
  uncategorized: 'Sin categorizar',
}
export const categoryLabel = (c: string) => LABELS[c] ?? c.replace(/_/g, ' ').replace(/^\p{L}/u, (x) => x.toUpperCase())

const AUTOMATIC = new Set(['', 'auto', 'automatica', 'automatico', 'automatic', 'sin categoria', 'sin categorizar'])
/** "", "Automática", "Sin categoría"… → let the rules decide. */
export const isAutomaticCategory = (input: string) =>
  AUTOMATIC.has(input.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_\s]+/g, ' ').trim())

/**
 * The category picked in the Shortcut, as one of the user's expense categories.
 * Accepts the internal name ("groceries", "gimnasio") or the label shown in the
 * app ("Supermercado", "Gimnasio"), ignoring case and accents.
 * null = automatic (empty, "Automática"…) or a name that is not one of the user's categories.
 */
export function resolveCategory(input: string, categories: ReadonlyArray<string>): string | null {
  const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_\s]+/g, ' ').trim()
  const k = key(input)
  if (isAutomaticCategory(k)) return null
  return categories.find((c) => key(c) === k || key(categoryLabel(c)) === k) ?? null
}

export const formatEuro = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })} €`

// ---------------------------------------------------------------------------
// Raw iOS Shortcuts / Wallet payloads
// ---------------------------------------------------------------------------
//
// The Shortcut can send either flat fields ({ amount, merchant, card, date },
// handy for curl) or { payload: <Shortcut Input> }, where payload may be:
//   1. an object with Spanish/English keys ("Importe", "Tarjeta o cartera"…)
//   2. that same object serialised as a JSON string (key typed as "Texto")
//   3. a plain sentence: "14,50 € en MERCADONA con DEBITO SMART"

export type PayloadSource = 'flat' | 'object' | 'json-string' | 'text' | 'none'

export interface ExtractedPayment {
  amount: unknown
  merchant: string
  card: string
  date: unknown
  /** Category chosen in the Shortcut (optional; empty = automatic). */
  category: string
  source: PayloadSource
}

/** Key aliases, most specific first. Compared after normaliseKey(). */
const KEY_ALIASES = {
  amount: ['importe', 'cantidad', 'monto', 'amount', 'total', 'price', 'precio'],
  merchant: ['comercio', 'establecimiento', 'merchant', 'name', 'nombre', 'title', 'titulo', 'description', 'descripcion'],
  card: ['tarjeta o cartera', 'tarjeta o pase', 'card or pass', 'tarjeta', 'cartera', 'card', 'pass', 'account', 'cuenta'],
  date: ['fecha', 'date', 'timestamp', 'createdat', 'created at', 'created_at'],
  category: ['categoria', 'category'],
} as const

type Field = keyof typeof KEY_ALIASES

/** "Tarjeta o Cartera " → "tarjeta o cartera"; "CreatedAt" → "createdat"; "Título" → "titulo" */
const normaliseKey = (k: string) =>
  k
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim()

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Turn any scalar into trimmed text; objects/arrays are ignored. */
const asText = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')

function pick(obj: Record<string, unknown>, field: Field): unknown {
  const index = new Map<string, unknown>()
  for (const [k, v] of Object.entries(obj)) {
    const nk = normaliseKey(k)
    if (!index.has(nk)) index.set(nk, v)
    index.set(nk.replace(/ /g, ''), v) // "created at" ⇄ "createdat"
  }
  for (const alias of KEY_ALIASES[field]) {
    const v = index.get(alias) ?? index.get(alias.replace(/ /g, ''))
    if (v !== undefined && v !== null && asText(v) !== '') return v
  }
  return undefined
}

/** JSON.parse that never throws; only accepts objects (or a one-element array of one). */
function parseJsonObject(s: string): Record<string, unknown> | null {
  const t = s.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return null
  try {
    let v: unknown = JSON.parse(t)
    if (Array.isArray(v)) v = v[0]
    if (typeof v === 'string') return parseJsonObject(v) // triple-encoded
    return isRecord(v) ? v : null
  } catch {
    return null
  }
}

// Amount next to a € sign (either side) first; otherwise any decimal number.
const AMOUNT_EUR = /(?:€\s*)(-?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)|(-?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?\b)/i
const AMOUNT_ANY = /(\d+[.,]\d{1,2})/

/**
 * Fallback for Spanish debit-card summaries:
 *   "14,50 € en MERCADONA con DEBITO SMART"
 *   "Pago de 14,50 € en MERCADONA"
 *   "DEBITO SMART: 14,50 € en MERCADONA"
 */
export function parsePlainText(text: string): { amount: string | null; merchant: string; card: string } {
  const s = text.replace(/\s+/g, ' ').trim()
  const m = s.match(AMOUNT_EUR) ?? s.match(AMOUNT_ANY)
  const amount = m ? (m[1] ?? m[2] ?? m[0]).replace(/\s/g, '') : null
  const afterAmount = m && m.index !== undefined ? s.slice(m.index + m[0].length) : s

  // Card: "<CARD>: …" prefix, or "… con <CARD>" suffix.
  let card = ''
  const prefix = s.match(/^([^:]{2,60}):\s/)
  if (prefix && !/\d/.test(prefix[1])) card = prefix[1].trim()

  let merchant = ''
  const en = afterAmount.match(/\ben\s+(.+)$/i)
  if (en) {
    const rest = en[1]
    const con = rest.match(/^(.*?)\s+con\s+(.+)$/i)
    if (con) {
      merchant = con[1]
      if (!card) card = con[2]
    } else merchant = rest
  } else {
    const con = afterAmount.match(/\bcon\s+(.+)$/i)
    if (con && !card) card = con[1]
  }
  const tidy = (x: string) => x.replace(/^[\s"'«]+|[\s"'».,;]+$/g, '').trim()
  return { amount, merchant: tidy(merchant).slice(0, 200), card: tidy(card).slice(0, 60) }
}

/**
 * Text for the 400 answer (shown as the Shortcut's notification). When iOS only
 * sent the merchant — what happens when the whole "Shortcut Input" is put in one
 * JSON field — say how to fix the Shortcut instead of a generic error.
 */
export function noAmountMessage(e: ExtractedPayment): string {
  if (e.amount === undefined && e.merchant && (e.source === 'text' || e.source === 'none')) {
    return `Solo ha llegado el comercio («${e.merchant.slice(0, 60)}»), sin importe. En el Atajo, envía «Importe» de la Entrada del atajo en la clave amount (ver README).`
  }
  const got = asText(e.amount).slice(0, 40)
  return `No se ha encontrado un importe válido (> 0) en la petición${got ? `: ${got}` : ''}`
}

/**
 * Pull amount / merchant / card / date out of whatever the Shortcut sent.
 * Flat top-level fields win (explicit curl tests); `payload` fills the gaps.
 */
export function extractPayment(body: unknown): ExtractedPayment {
  const out: ExtractedPayment = { amount: undefined, merchant: '', card: '', date: undefined, category: '', source: 'none' }
  if (!isRecord(body)) return out

  const { payload, ...flat } = body
  const fill = (obj: Record<string, unknown>) => {
    if (out.amount === undefined) out.amount = pick(obj, 'amount')
    if (!out.merchant) out.merchant = asText(pick(obj, 'merchant'))
    if (!out.card) out.card = asText(pick(obj, 'card'))
    if (out.date === undefined) out.date = pick(obj, 'date')
    if (!out.category) out.category = asText(pick(obj, 'category'))
  }

  fill(flat)
  if (out.amount !== undefined) out.source = 'flat'

  let raw = payload
  if (Array.isArray(raw)) raw = raw[0]

  if (isRecord(raw)) {
    fill(raw)
    if (out.source === 'none') out.source = 'object'
  } else if (typeof raw === 'string' && raw.trim()) {
    const obj = parseJsonObject(raw)
    if (obj) {
      fill(obj)
      if (out.source === 'none') out.source = 'json-string'
    } else {
      const t = parsePlainText(raw)
      if (out.amount === undefined && t.amount) out.amount = t.amount
      // Bare text with no amount nor "en …" is just the merchant (iOS turning the whole input into text).
      if (!out.merchant) out.merchant = t.merchant || (t.amount ? '' : raw.replace(/\s+/g, ' ').trim().slice(0, 200))
      if (!out.card) out.card = t.card
      if (out.source === 'none') out.source = 'text'
    }
  } else if (typeof raw === 'number' && out.amount === undefined) {
    out.amount = raw
    out.source = 'object'
  }
  return out
}
