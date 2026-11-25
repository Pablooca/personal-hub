/** GPX and TCX files from a watch → distance, time, heart rate and laps. Pure: takes the text. */
export interface Lap {
  km: number
  seconds: number
  hr: number | null
}
export interface Track {
  /** Local date of the activity, YYYY-MM-DD. */
  date: string | null
  km: number
  seconds: number
  hr: number | null
  laps: Lap[]
  /** True when the file's own laps were found (TCX); otherwise one per kilometre. */
  ownLaps: boolean
}

interface Point {
  t: number | null
  lat: number
  lon: number
  hr: number | null
  dist: number | null
}

const tag = (s: string, name: string) => s.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`, 'i'))?.[1] ?? null
const blocks = (s: string, name: string) => [...s.matchAll(new RegExp(`<(?:\\w+:)?${name}\\b([^>]*)>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'gi'))].map((m) => ({ attrs: m[1], body: m[2] }))
const num = (s: string | null | undefined) => (s === null || s === undefined || s === '' || !Number.isFinite(Number(s)) ? null : Number(s))

/** Metres between two coordinates. */
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

const localDate = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const mean = (l: (number | null)[]) => {
  const v = l.filter((x): x is number => x !== null && x > 30 && x < 250)
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
}

/** A pause longer than this between two points is not running time. */
const PAUSE_S = 30

function fromPoints(points: Point[]): Omit<Track, 'ownLaps'> {
  let metres = 0
  let seconds = 0
  const laps: Lap[] = []
  let lapM = 0
  let lapS = 0
  let lapHr: (number | null)[] = []
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]]
    const step = a.dist !== null && b.dist !== null ? Math.max(0, b.dist - a.dist) : haversine(a, b)
    const dt = a.t !== null && b.t !== null ? (b.t - a.t) / 1000 : 0
    // Stopped watch or a GPS jump (> 12 m/s).
    if (dt > PAUSE_S && step < 15) continue
    if (dt > 0 && step / dt > 12) continue
    metres += step
    seconds += dt
    lapM += step
    lapS += dt
    lapHr.push(b.hr)
    if (lapM >= 1000) {
      const over = (lapM - 1000) / (step || 1)
      laps.push({ km: 1, seconds: Math.round(lapS - dt * over), hr: mean(lapHr) })
      lapM -= 1000
      lapS = dt * over
      lapHr = []
    }
  }
  if (lapM >= 50) laps.push({ km: Math.round(lapM) / 1000, seconds: Math.round(lapS), hr: mean(lapHr) })
  return { date: points[0]?.t ? localDate(new Date(points[0].t).toISOString()) : null, km: Math.round(metres / 10) / 100, seconds: Math.round(seconds), hr: mean(points.map((p) => p.hr)), laps }
}

export function parseTrack(text: string): Track {
  if (text.length > 40_000_000) throw new Error('El archivo es demasiado grande.')
  if (/<(?:\w+:)?TrainingCenterDatabase\b/i.test(text)) return parseTcx(text)
  if (/<(?:\w+:)?gpx\b/i.test(text)) return parseGpx(text)
  throw new Error('No es un archivo GPX ni TCX.')
}

function parseGpx(text: string): Track {
  const points = blocks(text, 'trkpt').flatMap<Point>((b) => {
    const lat = num(b.attrs.match(/lat="([^"]+)"/i)?.[1])
    const lon = num(b.attrs.match(/lon="([^"]+)"/i)?.[1])
    if (lat === null || lon === null) return []
    const time = tag(b.body, 'time')
    return [{ lat, lon, t: time ? Date.parse(time) : null, hr: num(tag(b.body, 'hr')), dist: null }]
  })
  if (points.length < 2) throw new Error('El archivo no contiene ningún recorrido.')
  const t = fromPoints(points)
  if (!t.km || !t.seconds) throw new Error('El recorrido no tiene distancia o tiempo.')
  return { ...t, ownLaps: false }
}

function parseTcx(text: string): Track {
  const raw = blocks(text, 'Lap')
  if (!raw.length) throw new Error('El archivo no contiene ninguna vuelta.')
  const laps: Lap[] = raw.map(({ body }) => {
    const head = body.split(/<(?:\w+:)?Track\b/i)[0]
    const hrBlock = blocks(head, 'AverageHeartRateBpm')[0]?.body ?? ''
    return { km: Math.round((num(tag(head, 'DistanceMeters')) ?? 0)) / 1000, seconds: Math.round(num(tag(head, 'TotalTimeSeconds')) ?? 0), hr: num(tag(hrBlock, 'Value')) }
  })
  const good = laps.filter((l) => l.seconds > 0)
  const km = good.reduce((a, l) => a + l.km, 0)
  const seconds = good.reduce((a, l) => a + l.seconds, 0)
  if (!km || !seconds) throw new Error('El archivo no tiene distancia o tiempo.')
  const withHr = good.filter((l) => l.hr)
  const hr = withHr.length ? Math.round(withHr.reduce((a, l) => a + l.hr! * l.seconds, 0) / withHr.reduce((a, l) => a + l.seconds, 0)) : null
  const start = raw[0].attrs.match(/StartTime="([^"]+)"/i)?.[1] ?? tag(text, 'Id')
  return { date: localDate(start), km: Math.round(km * 100) / 100, seconds, hr, laps: good, ownLaps: good.length > 1 }
}

/** Laps that look like the main reps (same distance, ±5 %), in order. */
export function lapsForReps(laps: readonly Lap[], metres: number, max: number): number[] {
  return laps.filter((l) => Math.abs(l.km * 1000 - metres) <= metres * 0.05).slice(0, max).map((l) => l.seconds)
}
