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
  uncategorized: 'Sin categorizar',
}
export const categoryLabel = (c: string) => LABELS[c] ?? c

export const formatEuro = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })} €`
