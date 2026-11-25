import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Field, Modal } from '../../components/ui'
import { uid } from '../../lib/format'
import { DISTANCES, fmtDuration, fmtPace, parseDuration, parseKm } from '../../lib/running'
import type { RaceGoal } from '../../lib/types'
import { useData } from '../../state/data'

export function GoalModal({ goal, onClose, onSaved }: { goal: RaceGoal | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { data, create, update, remove } = useData()
  const known = goal ? DISTANCES.find((d) => Math.abs(d.km - goal.distance_km) < 0.01) : DISTANCES[1]
  const [name, setName] = useState(goal?.name ?? '')
  const [date, setDate] = useState(goal?.date ?? '')
  const [preset, setPreset] = useState(known ? String(known.km) : 'custom')
  const [custom, setCustom] = useState(goal && !known ? String(goal.distance_km).replace('.', ',') : '')
  const [target, setTarget] = useState(goal ? fmtDuration(goal.target_s) : '')
  const [best, setBest] = useState(goal?.previous_best_s ? fmtDuration(goal.previous_best_s) : '')
  const [notes, setNotes] = useState(goal?.notes ?? '')
  const [confirm, setConfirm] = useState(false)

  const km = preset === 'custom' ? parseKm(custom) : Number(preset)
  const targetS = parseDuration(target)
  const bestS = best.trim() ? parseDuration(best) : null
  const ok = Boolean(name.trim() && date && km && targetS && (!best.trim() || bestS))
  const planned = goal ? data.run_plan.filter((p) => p.goal_id === goal.id).length : 0

  async function save() {
    if (!ok) return
    const row = { name: name.trim(), date, distance_km: km!, target_s: targetS!, previous_best_s: bestS, notes }
    onClose()
    if (goal) await update('race_goals', goal.id, row)
    else {
      const id = uid()
      onSaved(id)
      await create('race_goals', { ...row, id })
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={goal ? 'Editar carrera' : 'Nueva carrera objetivo'}
      footer={
        <>
          {goal && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                if (!confirm) return setConfirm(true)
                onClose()
                void remove('race_goals', goal.id)
              }}
            >
              <Trash2 className="size-4" /> {confirm ? `¿Seguro? Se borran ${planned} sesiones` : 'Eliminar'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!ok} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Carrera">
          <input className="field" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Media Maratón de Sevilla" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fecha">
            <input type="date" className="field num" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Distancia">
            <select className="field" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {DISTANCES.map((d) => (
                <option key={d.km} value={d.km}>
                  {d.label} ({String(d.km).replace('.', ',')} km)
                </option>
              ))}
              <option value="custom">Personalizada</option>
            </select>
          </Field>
          {preset === 'custom' && (
            <Field label="Kilómetros">
              <input className="field num" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="15" />
            </Field>
          )}
          <Field label="Tiempo objetivo">
            <input className="field num" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1:35:00" />
          </Field>
          <Field label="Marca personal previa (opcional)">
            <input className="field num" value={best} onChange={(e) => setBest(e.target.value)} placeholder="1:39:00" />
          </Field>
        </div>
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm" aria-live="polite">
          {km && targetS ? (
            <>
              Ritmo objetivo: <span className="num font-semibold">{fmtPace(targetS / km)} min/km</span>
              {bestS && bestS > 0 && (
                <span className="text-muted">
                  {' '}
                  · {targetS < bestS ? `${fmtDuration(bestS - targetS)} menos que tu marca` : targetS > bestS ? `${fmtDuration(targetS - bestS)} más que tu marca` : 'igual que tu marca'}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted">Escribe el tiempo como h:mm:ss o mm:ss para calcular el ritmo.</span>
          )}
        </p>
        <Field label="Notas">
          <textarea className="field min-h-16" value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
