import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Field, Modal } from '../../components/ui'
import { PLAN_KIND_LABELS, addDaysKey } from '../../lib/studyPlan'
import { PLAN_ITEM_KINDS, type PlanItemKind, type StudyPlan, type StudyPlanItem, type StudyPlanPhase } from '../../lib/types'
import { useData } from '../../state/data'

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

export function PlanModal({ programId, plan, onClose, onCreated }: { programId: string; plan?: StudyPlan; onClose: () => void; onCreated?: (id: string) => void }) {
  const { create, update, remove } = useData()
  const [name, setName] = useState(plan?.name ?? '')
  const [start, setStart] = useState(plan?.start_date ?? '')
  const [end, setEnd] = useState(plan?.end_date ?? '')
  const [exam, setExam] = useState(plan?.exam_date ?? '')
  const [notes, setNotes] = useState(plan?.notes ?? '')
  const [phases, setPhases] = useState<StudyPlanPhase[]>(plan?.phases ?? [])
  const [confirm, setConfirm] = useState(false)
  const phasesOk = phases.every((p) => p.name.trim() && isDate(p.start) && isDate(p.end) && p.end >= p.start)
  const valid = name.trim() && isDate(start) && isDate(end) && end >= start && (!exam || isDate(exam)) && phasesOk

  async function save() {
    if (!valid) return
    const row = { name: name.trim(), start_date: start, end_date: end, exam_date: exam || null, notes: notes.trim(), phases: phases.map((p) => ({ ...p, name: p.name.trim(), goal: p.goal.trim() })) }
    onClose()
    if (plan) await update('study_plans', plan.id, row)
    else {
      const created = await create('study_plans', { ...row, program_id: programId })
      if (created) onCreated?.(created.id)
    }
  }
  const setPhase = (i: number, patch: Partial<StudyPlanPhase>) => setPhases((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  return (
    <Modal
      open
      onClose={onClose}
      title={plan ? 'Editar plan de estudio' : 'Nuevo plan de estudio'}
      footer={
        <>
          {plan &&
            (confirm ? (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={() => {
                  onClose()
                  void remove('study_plans', plan.id)
                }}
              >
                Eliminar plan y objetivos
              </Button>
            ) : (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirm(true)} aria-label="Eliminar plan">
                <Trash2 className="size-4" />
              </Button>
            ))}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            {plan ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Exámenes de abril" maxLength={160} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Empieza">
            <input type="date" className="field num" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Termina">
            <input type="date" className="field num" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Examen">
            <input type="date" className="field num" value={exam} onChange={(e) => setExam(e.target.value)} />
          </Field>
        </div>
        <div>
          <span className="label">Fases</span>
          <div className="space-y-2">
            {phases.map((p, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-line p-2.5">
                <div className="flex gap-2">
                  <input className="field h-9 flex-1 text-sm" value={p.name} onChange={(e) => setPhase(i, { name: e.target.value })} placeholder={`Fase ${i + 1}`} maxLength={80} aria-label="Nombre de la fase" />
                  <Button size="icon" variant="danger" onClick={() => setPhases((ps) => ps.filter((_, j) => j !== i))} aria-label="Quitar fase">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className="field num h-9 text-sm" value={p.start} onChange={(e) => setPhase(i, { start: e.target.value })} aria-label="Inicio de la fase" />
                  <input type="date" className="field num h-9 text-sm" value={p.end} onChange={(e) => setPhase(i, { end: e.target.value })} aria-label="Fin de la fase" />
                </div>
                <input className="field h-9 text-sm" value={p.goal} onChange={(e) => setPhase(i, { goal: e.target.value })} placeholder="Objetivo de la fase" maxLength={300} aria-label="Objetivo de la fase" />
              </div>
            ))}
            <Button
              size="sm"
              onClick={() => {
                const from = phases.at(-1)?.end ? addDaysKey(phases.at(-1)!.end, 1) : start
                setPhases((ps) => [...ps, { name: `Fase ${ps.length + 1}`, start: from, end: from, goal: '' }])
              }}
            >
              <Plus className="size-3.5" /> Añadir fase
            </Button>
          </div>
        </div>
        <Field label="Notas">
          <textarea className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
        </Field>
      </div>
    </Modal>
  )
}

export type ItemDraft = Partial<StudyPlanItem> & { plan_id: string }

export function ItemModal({ draft, subjects, onClose }: { draft: ItemDraft; subjects: { id: string; name: string }[]; onClose: () => void }) {
  const { create, update, remove } = useData()
  const [kind, setKind] = useState<PlanItemKind>(draft.kind ?? 'goal')
  const [title, setTitle] = useState(draft.title ?? '')
  const [date, setDate] = useState(draft.date ?? '')
  const [end, setEnd] = useState(draft.end_date ?? '')
  const [subject, setSubject] = useState(draft.subject_id ?? '')
  const [notes, setNotes] = useState(draft.notes ?? '')
  const isGoal = kind === 'goal'
  const valid = title.trim() && isDate(date) && (!isGoal || !end || (isDate(end) && end >= date))

  async function save() {
    if (!valid) return
    const row = { kind, title: title.trim(), date, end_date: isGoal ? end || addDaysKey(date, 6) : null, subject_id: subject || null, notes: notes.trim() }
    onClose()
    if (draft.id) await update('study_plan_items', draft.id, row)
    else await create('study_plan_items', { ...row, plan_id: draft.plan_id, is_done: false })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={draft.id ? 'Editar' : 'Añadir al plan'}
      footer={
        <>
          {draft.id && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                onClose()
                void remove('study_plan_items', draft.id!)
              }}
              aria-label="Eliminar"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            {draft.id ? 'Guardar' : 'Añadir'}
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
        <Field label="Tipo">
          <select className="field" value={kind} onChange={(e) => setKind(e.target.value as PlanItemKind)}>
            {PLAN_ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {PLAN_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={isGoal ? 'Objetivo' : 'Qué toca'}>
          <textarea className="field min-h-16" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={isGoal ? 'Semana desde' : 'Día'}>
            <input type="date" className="field num" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {isGoal && (
            <Field label="Hasta">
              <input type="date" className="field num" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="7 días" />
            </Field>
          )}
        </div>
        <Field label="Asignatura">
          <select className="field" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Varias / general</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notas">
          <textarea className="field min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
