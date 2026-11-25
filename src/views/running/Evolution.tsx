import { useMemo, useState } from 'react'
import { Footprints, Plus, Trash2, Trophy } from 'lucide-react'
import { LineChart } from '../../components/LineChart'
import { Badge, Button, Card, Empty, Field, Modal, Segmented, cx } from '../../components/ui'
import { fromDateKey } from '../../lib/dates'
import { fmtDate } from '../../lib/format'
import { RUN_TYPE_LABELS, RUN_TYPE_SHORT, fmtDuration, fmtKm, fmtPace, goalPace, parseKm } from '../../lib/running'
import { hrTrend, paceTrend, projectionTrend, records, shoeUse, type TrendPoint } from '../../lib/runstats'
import type { RaceGoal, Run, RunType, Shoe } from '../../lib/types'
import { useData } from '../../state/data'
import { useNav } from '../../state/nav'

const short = (d: string) => fmtDate(fromDateKey(d), { day: 'numeric', month: 'short' })
const toPoints = (list: TrendPoint[], detail: (r: Run) => string) => list.map((p) => ({ x: fromDateKey(p.date).getTime(), y: p.value, label: short(p.date), detail: detail(p.run) }))

export function EvolutionPanel({ goal }: { goal: RaceGoal }) {
  const { data } = useData()
  const { open } = useNav()
  const types = (['easy', 'long', 'tempo', 'interval', 'race'] as RunType[]).filter((t) => data.runs.some((r) => r.type === t))
  const [type, setType] = useState<RunType>(types.includes('easy') ? 'easy' : (types[0] ?? 'easy'))
  const projection = useMemo(() => projectionTrend(data.runs, goal.distance_km), [data.runs, goal.distance_km])
  const pace = useMemo(() => paceTrend(data.runs, type), [data.runs, type])
  const hr = useMemo(() => hrTrend(data.runs, type), [data.runs, type])
  const prs = useMemo(() => records(data.runs), [data.runs])

  if (!data.runs.length) return <Empty icon={<Footprints className="size-6 text-faint" />}>Registra entrenamientos para ver tu evolución.</Empty>
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={`Proyección para ${fmtKm(goal.distance_km)} km`}>
          {projection.length ? (
            <LineChart
              label="Proyección de marca"
              points={toPoints(projection, (r) => `${RUN_TYPE_SHORT[r.type]} de ${fmtKm(r.distance_km)} km`)}
              format={fmtDuration}
              invert
              reference={{ y: goal.target_s, label: `Objetivo ${fmtDuration(goal.target_s)}` }}
              color="#0284c7"
            />
          ) : (
            <p className="text-sm text-muted">Hace falta un esfuerzo continuo de al menos {fmtKm(Math.max(3, goal.distance_km * 0.2))} km.</p>
          )}
        </Card>
        <Card
          title="Ritmo y pulso"
          action={
            <select className="field h-9 w-44" aria-label="Tipo de sesión" value={type} onChange={(e) => setType(e.target.value as RunType)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {RUN_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          }
        >
          {pace.length ? (
            <LineChart
              label={`Ritmo de ${RUN_TYPE_LABELS[type].toLowerCase()}`}
              points={toPoints(pace, (r) => `${fmtKm(r.distance_km)} km`)}
              format={(y) => `${fmtPace(y)}/km`}
              invert
              height={hr.length > 1 ? 130 : 170}
              reference={type === 'race' ? { y: goalPace(goal), label: `Objetivo ${fmtPace(goalPace(goal))}` } : undefined}
              color="#0284c7"
            />
          ) : (
            <p className="text-sm text-muted">Sin ritmos de este tipo{type === 'interval' ? ': anota el tiempo de las series' : ''}.</p>
          )}
          {hr.length > 1 && (
            <div className="mt-3 border-t border-line pt-3">
              <LineChart label="Frecuencia cardíaca media" points={toPoints(hr, (r) => `${fmtPace(r.duration_s / r.distance_km)}/km`)} format={(y) => `${Math.round(y)} ppm`} height={110} color="#e11d48" />
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Récords personales" bodyClass="p-0">
          <ul className="divide-y divide-line">
            {prs.map((r) => {
              const body = (
                <>
                  <Trophy className="size-4 shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {r.label}
                      {r.estimated && <span className="ml-2 text-xs font-normal text-muted">estimado</span>}
                    </span>
                    <span className="block text-xs text-muted">
                      {r.id === 'week' ? `Semana del ${short(r.date)}` : fmtDate(fromDateKey(r.date), { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </span>
                  <span className="num font-semibold">{r.kind === 'km' ? `${fmtKm(r.value)} km` : fmtDuration(r.value)}</span>
                </>
              )
              return (
                <li key={r.id}>
                  {r.run ? (
                    <button type="button" className="flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2" onClick={() => open({ kind: 'run', id: r.run!.id })}>
                      {body}
                    </button>
                  ) : (
                    <div className="flex min-h-13 items-center gap-3 px-4 py-2">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">«Estimado» sale del ritmo medio de una carrera más larga.</p>
        </Card>
        <ShoesCard />
      </div>
    </div>
  )
}

function ShoesCard() {
  const { data } = useData()
  const [editing, setEditing] = useState<Partial<Shoe> | null>(null)
  const use = useMemo(() => shoeUse(data.shoes, data.runs), [data.shoes, data.runs])
  return (
    <Card
      title="Zapatillas"
      action={
        <Button size="sm" variant="ghost" onClick={() => setEditing({})}>
          <Plus className="size-3.5" /> Añadir
        </Button>
      }
    >
      {!use.length ? (
        <Empty>Añade tus zapatillas para contar sus kilómetros y saber cuándo cambiarlas.</Empty>
      ) : (
        <ul className="space-y-3">
          {use.map(({ shoe, km, runs, pct, state }) => (
            <li key={shoe.id}>
              <button type="button" onClick={() => setEditing(shoe)} className={cx('w-full text-left', shoe.retired && 'opacity-50')}>
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{shoe.name}</span>
                    {shoe.is_default && !shoe.retired && <Badge className="border-line-strong text-muted">habitual</Badge>}
                    {shoe.retired && <Badge className="border-line-strong text-muted">retiradas</Badge>}
                  </span>
                  <span className="num shrink-0 text-xs">
                    <span className="text-sm font-semibold">{fmtKm(km)}</span> <span className="text-muted">/ {fmtKm(shoe.limit_km)} km</span>
                  </span>
                </span>
                <span className="mt-1 block h-1.5 rounded-full bg-line">
                  <span className={cx('block h-full rounded-full', state === 'over' ? 'bg-rose-500' : state === 'warn' ? 'bg-amber-500' : 'bg-sky-500')} style={{ width: `${Math.min(100, pct)}%` }} />
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">
                  {runs} {runs === 1 ? 'entreno' : 'entrenos'}
                  {!shoe.retired && state === 'over' && ' · toca cambiarlas'}
                  {!shoe.retired && state === 'warn' && ` · quedan ${fmtKm(Math.max(0, shoe.limit_km - km))} km`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <ShoeModal shoe={editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

function ShoeModal({ shoe, onClose }: { shoe: Partial<Shoe>; onClose: () => void }) {
  const { data, create, update, remove } = useData()
  const [name, setName] = useState(shoe.name ?? '')
  const [start, setStart] = useState(String(shoe.start_km ?? 0).replace('.', ','))
  const [limit, setLimit] = useState(String(shoe.limit_km ?? 700).replace('.', ','))
  const [def, setDef] = useState(shoe.is_default ?? data.shoes.length === 0)
  const [retired, setRetired] = useState(shoe.retired ?? false)
  const startN = /^0*([.,]0*)?$/.test(start.trim()) ? 0 : parseKm2(start)
  const limitN = parseKm2(limit)

  async function save() {
    if (!name.trim() || startN === null || limitN === null) return
    const row = { name: name.trim(), start_km: startN, limit_km: limitN, retired, is_default: def && !retired }
    onClose()
    if (row.is_default) for (const s of data.shoes) if (s.is_default && s.id !== shoe.id) await update('shoes', s.id, { is_default: false })
    if (shoe.id) await update('shoes', shoe.id, row)
    else await create('shoes', row)
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={shoe.id ? 'Editar zapatillas' : 'Nuevas zapatillas'}
      footer={
        <>
          {shoe.id && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                onClose()
                void remove('shoes', shoe.id!)
              }}
            >
              <Trash2 className="size-4" /> Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!name.trim() || startN === null || limitN === null} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Modelo">
          <input className="field" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Marca y modelo" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Km que ya tenían">
            <input className="field num" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Cambiar a los (km)">
            <input className="field num" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </Field>
        </div>
        <Segmented
          value={retired ? 'retired' : 'active'}
          onChange={(v) => setRetired(v === 'retired')}
          options={[
            { value: 'active', label: 'En uso' },
            { value: 'retired', label: 'Retiradas' },
          ]}
        />
        {!retired && (
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={def} onChange={(e) => setDef(e.target.checked)} /> Usar por defecto en los entrenos nuevos
          </label>
        )}
      </div>
    </Modal>
  )
}

const parseKm2 = (t: string): number | null => {
  const n = Number(t.trim().replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 20000 ? n : (parseKm(t) ?? null)
}
