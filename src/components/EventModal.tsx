import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { combineDateTime, toDateKey, toTimeValue } from '../lib/dates'
import { CATEGORY_STYLES } from '../lib/theme'
import { EVENT_CATEGORIES, type CalendarEvent, type EventCategory } from '../lib/types'
import { useData } from '../state/data'
import { useToast } from '../state/toast'
import { Button, Check, Field, Modal, cx } from './ui'

export type EventDraft = Partial<CalendarEvent> & { dateKey?: string }

export function EventModal({ draft, onClose }: { draft: EventDraft | null; onClose: () => void }) {
  const { create, update, remove } = useData()
  const toast = useToast()
  const editing = Boolean(draft?.id)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(toDateKey(new Date()))
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [category, setCategory] = useState<EventCategory>('personal')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!draft) return
    const s = draft.start_at ? new Date(draft.start_at) : null
    const e = draft.end_at ? new Date(draft.end_at) : null
    setTitle(draft.title ?? '')
    setDescription(draft.description ?? '')
    setDate(s ? toDateKey(s) : (draft.dateKey ?? toDateKey(new Date())))
    setStart(s ? toTimeValue(s) : '09:00')
    setEnd(e ? toTimeValue(e) : '10:00')
    setCategory(draft.category ?? 'personal')
    setDone(draft.is_completed ?? false)
  }, [draft])

  const invalid = !title.trim() || end < start

  async function save() {
    if (invalid) return
    const payload = {
      title: title.trim(),
      description,
      start_at: combineDateTime(date, start),
      end_at: combineDateTime(date, end),
      category,
      is_completed: done,
    }
    onClose()
    if (editing && draft?.id) {
      await update('events', draft.id, payload)
    } else if (await create('events', payload)) {
      toast('success', 'Evento creado')
    }
  }

  async function del() {
    if (!draft?.id) return
    onClose()
    await remove('events', draft.id)
    toast('success', 'Evento eliminado')
  }

  return (
    <Modal
      open={draft !== null}
      onClose={onClose}
      title={editing ? 'Editar evento' : 'Nuevo evento'}
      footer={
        <>
          {editing && (
            <Button variant="danger" className="mr-auto" onClick={del}>
              <Trash2 className="size-4" /> Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={invalid}>
            {editing ? 'Guardar' : 'Crear'}
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
        <Field label="Título">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="¿Qué tienes?" maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Fecha" className="col-span-2 sm:col-span-1">
            <input type="date" className="field num" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Inicio">
            <input type="time" className="field num" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Fin">
            <input type="time" className="field num" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {end < start && <p className="-mt-2 text-xs text-rose-500">La hora de fin debe ser posterior a la de inicio.</p>}

        <div>
          <span className="label">Categoría</span>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCategory(c)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition',
                  category === c ? CATEGORY_STYLES[c].chip : 'border-line text-muted hover:text-fg',
                )}
              >
                <span className={cx('size-2 rounded-full', CATEGORY_STYLES[c].dot)} />
                {CATEGORY_STYLES[c].label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Descripción">
          <textarea className="field" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notas, orden del día, enlaces…" />
        </Field>

        <label className="flex items-center gap-2.5 text-sm">
          <Check checked={done} onChange={setDone} label="Completado" />
          Marcar como completado
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
