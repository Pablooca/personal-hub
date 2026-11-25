import { test } from 'node:test'
import assert from 'node:assert/strict'
import { haversine, lapsForReps, parseTrack } from './track.ts'
import { paceTrend, projectionTrend, records, shoeUse } from './runstats.ts'
import type { Run, Shoe } from './types.ts'

test('haversine: one degree of latitude ≈ 111.2 km', () => assert.ok(Math.abs(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - 111_195) < 10))

const gpx = (pts: [number, number, number][]) => `<?xml version="1.0"?><gpx><trk><trkseg>${pts.map(([lat, s, hr]) => `<trkpt lat="${lat}" lon="-5.9"><time>${new Date(Date.UTC(2026, 10, 25, 9, 0, s)).toISOString()}</time><extensions><gpxtpx:hr>${hr}</gpxtpx:hr></extensions></trkpt>`).join('')}</trkseg></trk></gpx>`

test('GPX: distance, time, heart rate and a lap per kilometre; pauses do not count', () => {
  // 10 m every 3 s (5:00/km) for 2.5 km
  const step = 10 / 111_195
  const pts: [number, number, number][] = Array.from({ length: 251 }, (_, i) => [37 + i * step, i * 3, 150])
  const t = parseTrack(gpx(pts))
  assert.equal(t.km, 2.5)
  assert.equal(t.seconds, 750)
  assert.deepEqual([t.hr, t.laps.length, t.ownLaps, t.date], [150, 3, false, '2026-11-25'])
  assert.ok(Math.abs(t.laps[0].seconds - 300) <= 1 && Math.abs(t.laps[2].km - 0.5) < 0.01)
  const paused = parseTrack(gpx([...pts.slice(0, 100), ...pts.slice(99).map(([a, s, h]) => [a, s + 600, h] as [number, number, number])]))
  assert.ok(Math.abs(paused.seconds - 750) < 10)
})

test('TCX: the laps of the watch, matched to the 800s', () => {
  const lap = (m: number, s: number, hr: number) => `<Lap StartTime="2026-11-25T09:00:00Z"><TotalTimeSeconds>${s}</TotalTimeSeconds><DistanceMeters>${m}</DistanceMeters><AverageHeartRateBpm><Value>${hr}</Value></AverageHeartRateBpm><Track><Trackpoint><DistanceMeters>1</DistanceMeters></Trackpoint></Track></Lap>`
  const t = parseTrack(`<TrainingCenterDatabase><Activities><Activity><Id>x</Id>${lap(750, 300, 130)}${lap(800, 270, 170)}${lap(250, 180, 140)}${lap(805, 268, 172)}${lap(700, 300, 135)}</Activity></Activities></TrainingCenterDatabase>`)
  assert.deepEqual([t.km, t.seconds, t.laps.length, t.ownLaps, t.date], [3.31, 1318, 5, true, '2026-11-25'])
  assert.deepEqual(lapsForReps(t.laps, 800, 6), [300, 270, 268].slice(1))
  assert.deepEqual(lapsForReps(t.laps, 800, 1), [270])
})

test('anything else is rejected', () => {
  for (const bad of ['hola', '<gpx></gpx>', '<TrainingCenterDatabase></TrainingCenterDatabase>']) assert.throws(() => parseTrack(bad))
})

let n = 0
const R = (date: string, type: Run['type'], km: number, s: number, o: Partial<Run> = {}): Run => ({ id: `r${++n}`, plan_id: null, date, type, distance_km: km, duration_s: s, work_pace_s: null, avg_hr: null, rpe: null, is_test: false, notes: '', blocks: [], shoe_id: null, created_at: '', ...o })

test('records: exact beats estimated only if faster; reps and weeks included', () => {
  const runs = [R('2026-11-01', 'race', 10, 2700), R('2026-11-08', 'long', 16, 16 * 330), R('2026-11-10', 'interval', 8, 1500, { blocks: [{ kind: 'main', reps: 2, reps_max: null, unit: 'm', amount: 800, recovery_s: null, target_kind: null, target_s: null, done: true, splits: [270, 265] }] })]
  const r = new Map(records(runs).map((x) => [x.id, x]))
  assert.deepEqual([r.get('10K')!.value, r.get('10K')!.estimated], [2700, false])
  assert.deepEqual([r.get('5K')!.value, r.get('5K')!.estimated], [1350, true])
  assert.equal(r.get('longest')!.value, 16)
  assert.equal(r.get('rep-800')!.value, 265)
  assert.equal(r.has('Maratón'), false)
})

test('trends', () => {
  const runs = [R('2026-10-01', 'race', 10, 2800), R('2026-11-01', 'race', 10, 2700), R('2026-11-05', 'easy', 8, 3000)]
  assert.deepEqual(paceTrend(runs, 'race').map((p) => p.value), [280, 270])
  const p = projectionTrend(runs, 10)
  assert.deepEqual(p.map((x) => x.value), [2800, 2700, 2700])
})

test('shoes: kilometres and state', () => {
  const s: Shoe = { id: 's', name: 'A', start_km: 600, limit_km: 700, retired: false, is_default: true, created_at: '' }
  const u = shoeUse([s], [R('2026-11-01', 'easy', 10, 3000, { shoe_id: 's' })])
  assert.deepEqual([u[0].km, u[0].runs, u[0].state], [610, 1, 'warn'])
})
