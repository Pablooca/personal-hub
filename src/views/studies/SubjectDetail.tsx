import { useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { AlertTriangle, ArrowLeft, CalendarPlus, ExternalLink, FileText, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { Button, Card, Check, Empty, cx } from '../../components/ui'
import { COLOR_BG } from '../../lib/categories'
import { combineDateTime, toDateKey, toTimeValue } from '../../lib/dates'
import { fmtDate } from '../../lib/format'
import { MAX_PDF_BYTES, fmtBytes, fmtGrade, gradeLabel, gradeTone, subjectGrade } from '../../lib/studies'
import { SUBJECT_STATUSES, type AssessmentKind, type StudyAssessment, type StudyFile, type StudySubject, type SubjectStatus } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'
import { STATUS_LABELS, STATUS_STYLES, SubjectModal } from './StudiesView'

/** "7,5" / "7.5" → 7.5 ; '' → null ; invalid → undefined */
function parseNum(raw: string, min: number, max: number): number | null | undefined {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : undefined
}
const show = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

const KIND_LABEL: Record<AssessmentKind, string> = { delivery: 'Entrega', exam: 'Examen' }
const KIND_DEFAULT_TIME: Record<AssessmentKind, string> = { delivery: '23:59', exam: '09:00' }
const KIND_REMINDERS: Record<AssessmentKind, string> = {
  delivery: '1 día, 3 h, 1 h, 30 min y 5 min antes de la entrega',
  exam: '1 mes, 2 semanas, 1 semana, 2 días, 1 día, 3 h y 1 h antes del examen',
}

function KindToggle({ a }: { a: StudyAssessment }) {
  const { update } = useData()
  const exam = a.kind === 'exam'
  return (
    <button
      type="button"
      onClick={() => update('study_assessments', a.id, { kind: exam ? 'delivery' : 'exam' })}
      title="Cambiar entre entrega y examen"
      className={cx(
        'shrink-0 self-start rounded-md border px-1.5 py-0.5 text-[10px] leading-none font-semibold',
        exam ? 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      )}
    >
      {KIND_LABEL[a.kind]}
    </button>
  )
}

/** ISO → "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
const toLocalInput = (iso: string | null) => (iso ? `${toDateKey(new Date(iso))}T${toTimeValue(new Date(iso))}` : '')
/** "YYYY-MM-DDTHH:mm" (local) → ISO, or null. */
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

export function SubjectDetail({ subject, onBack }: { subject: StudySubject; onBack: () => void }) {
  const { data, update, remove, deleteStudyFiles } = useData()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const program = data.study_programs.find((p) => p.id === subject.program_id)
  const assessments = useMemo(
    () => data.study_assessments.filter((a) => a.subject_id === subject.id).sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') || a.created_at.localeCompare(b.created_at)),
    [data.study_assessments, subject.id],
  )
  const files = useMemo(() => data.study_files.filter((f) => f.subject_id === subject.id), [data.study_files, subject.id])
  const g = subjectGrade(subject, assessments)

  async function deleteSubject() {
    await deleteStudyFiles(files)
    onBack()
    await remove('study_subjects', subject.id)
    toast('success', 'Asignatura eliminada')
  }

  return (
    <>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> {program?.name ?? 'Programa'}
      </button>

      {/* Title takes the full width on phones; actions wrap onto their own row. */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={cx('mt-2 size-3 shrink-0 rounded', COLOR_BG[subject.color])} />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">{subject.name}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {[`${subject.credits.toLocaleString('es-ES')} ECTS`, subject.semester, subject.code, subject.professor].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-6 sm:pl-0">
        <select
          className={cx('h-8 rounded-md border px-2 text-xs font-medium', STATUS_STYLES[subject.status])}
          value={subject.status}
          onChange={(e) => update('study_subjects', subject.id, { status: e.target.value as SubjectStatus })}
          aria-label="Estado"
        >
          {SUBJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" /> Editar
        </Button>
        {confirmDelete ? (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="danger" onClick={deleteSubject}>
              Eliminar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} aria-label="Eliminar asignatura">
            <Trash2 className="size-3.5" />
          </Button>
        )}
        </div>
      </div>
      {confirmDelete && <p className="-mt-3 mb-4 text-xs text-rose-600 dark:text-rose-400">Se borrarán sus notas y {files.length} PDF.</p>}

      {/* ---------------------------------------------------- grade summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="eyebrow">{g.effective !== null ? (subject.final_grade !== null ? 'Nota oficial' : 'Nota final') : 'Puntos acumulados'}</div>
          <div className={cx('num mt-2 text-2xl font-semibold', g.effective !== null ? gradeTone(g.effective) : 'text-fg')}>{fmtGrade(g.effective ?? g.points)}</div>
          <div className="mt-1 text-xs text-muted">{g.effective !== null ? gradeLabel(g.effective) : `sobre 10 · ${g.evaluatedWeight}% evaluado`}</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Media hasta ahora</div>
          <div className={cx('num mt-2 text-2xl font-semibold', gradeTone(g.average))}>{fmtGrade(g.average)}</div>
          <div className="mt-1 text-xs text-muted">de lo ya evaluado</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow flex items-center gap-1">
            Necesitas para un
            <input
              key={subject.target_grade}
              className="num w-10 rounded border border-line bg-surface-2 px-1 text-center text-[11px] text-fg"
              defaultValue={show(subject.target_grade)}
              aria-label="Nota objetivo"
              onBlur={(e) => {
                const v = parseNum(e.target.value, 0, 10)
                if (v !== null && v !== undefined && v !== subject.target_grade) void update('study_subjects', subject.id, { target_grade: v })
                else e.target.value = show(subject.target_grade)
              }}
            />
          </div>
          <div
            className={cx(
              'num mt-2 text-2xl font-semibold',
              g.neededStatus === 'reached' ? 'text-emerald-600 dark:text-emerald-400' : g.neededStatus === 'impossible' ? 'text-rose-600 dark:text-rose-400' : 'text-fg',
            )}
          >
            {g.neededStatus === 'reached' ? '✓' : g.neededStatus === 'nothing-left' ? '—' : fmtGrade(g.needed)}
          </div>
          <div className="mt-1 text-xs text-muted">
            {g.neededStatus === 'reached'
              ? 'objetivo asegurado'
              : g.neededStatus === 'impossible'
                ? 'no alcanzable con lo que queda'
                : g.neededStatus === 'nothing-left'
                  ? 'no queda nada por evaluar'
                  : `de media en el ${Math.round((100 - g.evaluatedWeight) * 100) / 100}% restante`}
          </div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Nota oficial (acta)</div>
          <input
            key={String(subject.final_grade)}
            className="field num mt-2 h-9 text-lg font-semibold"
            inputMode="decimal"
            placeholder={g.calculated !== null ? fmtGrade(g.calculated) : '—'}
            defaultValue={show(subject.final_grade)}
            aria-label="Nota oficial"
            onBlur={(e) => {
              const v = parseNum(e.target.value, 0, 10)
              if (v === undefined) {
                e.target.value = show(subject.final_grade)
                return
              }
              if (v !== subject.final_grade)
                void update('study_subjects', subject.id, { final_grade: v, ...(v !== null ? { status: v >= 5 ? 'passed' : 'failed' } : {}) })
            }}
          />
          <div className="mt-1 text-xs text-muted">opcional · sustituye a la calculada</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Assessments subject={subject} assessments={assessments} totalWeight={g.totalWeight} weightsOk={g.weightsOk} />
        <Files subject={subject} files={files} />
      </div>

      {editing && <SubjectModal programId={subject.program_id} subject={subject} onClose={() => setEditing(false)} />}
    </>
  )
}

// ---------------------------------------------------------------- assessments
function Assessments({ subject, assessments, totalWeight, weightsOk }: { subject: StudySubject; assessments: StudyAssessment[]; totalWeight: number; weightsOk: boolean }) {
  const { create, update, remove } = useData()
  const toast = useToast()
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('')
  const [grade, setGrade] = useState('')
  const [date, setDate] = useState('')
  const [kind, setKind] = useState<AssessmentKind>('delivery')
  const [time, setTime] = useState(KIND_DEFAULT_TIME.delivery)
  const [timeTouched, setTimeTouched] = useState(false)
  const chooseKind = (k: AssessmentKind) => {
    setKind(k)
    if (!timeTouched) setTime(KIND_DEFAULT_TIME[k])
    if (k === 'exam' && !name.trim()) setName('Examen')
  }
  const [toAgenda, setToAgenda] = useState(true)

  const w = parseNum(weight, 0.01, 100)
  const gr = parseNum(grade, 0, 10)
  const valid = name.trim() && typeof w === 'number' && gr !== undefined

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const dueAt = date ? combineDateTime(date, time || KIND_DEFAULT_TIME[kind]) : null
    const ok = await create('study_assessments', {
      subject_id: subject.id,
      name: name.trim(),
      weight: w as number,
      grade: gr ?? null,
      due_at: dueAt,
      kind,
      is_done: gr !== null && gr !== undefined,
    })
    if (ok && date && toAgenda) {
      // All-day agenda entry (event reminders skip all-day; the deadline has its own reminders).
      await create('events', {
        title:
          kind === 'exam'
            ? `Examen: ${name.trim()} · ${subject.name} (${time || KIND_DEFAULT_TIME.exam})`
            : `${name.trim()} · ${subject.name} (hasta las ${time || KIND_DEFAULT_TIME.delivery})`,
        description: `${KIND_LABEL[kind]} (${w}% de la nota)`,
        start_at: combineDateTime(date, '00:00'),
        end_at: combineDateTime(date, '23:59'),
        category: 'master',
        is_completed: false,
        all_day: true,
        series_id: null,
      })
      toast('success', 'Añadido también a la Agenda')
    }
    setName('')
    setWeight('')
    setGrade('')
    setDate('')
    setKind('delivery')
    setTime(KIND_DEFAULT_TIME.delivery)
    setTimeTouched(false)
  }

  const patch = (a: StudyAssessment, field: 'name' | 'weight' | 'grade' | 'due_at', raw: string) => {
    if (field === 'name') {
      const v = raw.trim()
      if (v && v !== a.name) void update('study_assessments', a.id, { name: v })
      return v ? null : a.name
    }
    if (field === 'due_at') {
      const iso = fromLocalInput(raw)
      if (iso !== a.due_at) void update('study_assessments', a.id, { due_at: iso })
      return null
    }
    const v = parseNum(raw, field === 'weight' ? 0.01 : 0, field === 'weight' ? 100 : 10)
    if (v === undefined || (field === 'weight' && v === null)) return show(a[field]) // revert invalid input
    // A grade means it's been delivered/sat: stop the reminders.
    if (v !== a[field]) void update('study_assessments', a.id, { [field]: v, ...(field === 'grade' && v !== null ? { is_done: true } : {}) })
    return null
  }

  return (
    <Card
      title="Evaluación"
      action={
        <span className={cx('num text-xs', weightsOk ? 'text-muted' : 'text-amber-600 dark:text-amber-400')}>
          {!weightsOk && totalWeight > 0 && <AlertTriangle className="mr-1 inline size-3.5" />}
          pesos {totalWeight}%{!weightsOk && totalWeight > 0 ? ' (deberían sumar 100)' : ''}
        </span>
      }
      bodyClass="p-0"
    >
      {assessments.length === 0 ? (
        <div className="p-4">
          <Empty>Añade las partes de la nota (examen, prácticas…) con su porcentaje.</Empty>
        </div>
      ) : (
        <>
        {/* Phones: one card per assessment, full name visible, fields in two columns. */}
        <ul className="divide-y divide-line md:hidden">
          {assessments.map((a) => (
            <li key={`m-${a.id}-${a.weight}-${a.grade}-${a.due_at}-${a.name}`} className={cx('space-y-2.5 p-4', a.is_done && 'opacity-75')}>
              <div className="flex items-start gap-3">
                <div className="pt-1.5">
                  <Check checked={a.is_done} onChange={(v) => update('study_assessments', a.id, { is_done: v })} label={`${a.name} entregada`} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <KindToggle a={a} />
                <input
                  className="field h-9 font-medium"
                  defaultValue={a.name}
                  onBlur={(e) => {
                    const r = patch(a, 'name', e.target.value)
                    if (r !== null) e.target.value = r
                  }}
                  aria-label="Nombre de la evaluación"
                />
                </div>
                <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => remove('study_assessments', a.id)} aria-label={`Eliminar ${a.name}`}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 pl-[30px]">
                <label className="block">
                  <span className="label">Peso %</span>
                  <input
                    className="field num text-right"
                    inputMode="decimal"
                    defaultValue={show(a.weight)}
                    onBlur={(e) => {
                      const r = patch(a, 'weight', e.target.value)
                      if (r !== null) e.target.value = r
                    }}
                  />
                </label>
                <label className="block">
                  <span className="label">Nota</span>
                  <input
                    className={cx('field num text-right font-semibold', gradeTone(a.grade))}
                    inputMode="decimal"
                    placeholder="—"
                    defaultValue={show(a.grade)}
                    onBlur={(e) => {
                      const r = patch(a, 'grade', e.target.value)
                      if (r !== null) e.target.value = r
                    }}
                  />
                </label>
                <div>
                  <span className="label">Aporta</span>
                  <div className="num flex h-9 items-center justify-end text-sm text-muted">{a.grade !== null ? fmtGrade((a.weight * a.grade) / 100) : '—'}</div>
                </div>
                <label className="col-span-3 block">
                  <span className="label">{a.kind === 'exam' ? 'Fecha del examen' : 'Fecha límite de entrega'}</span>
                  <input
                    type="datetime-local"
                    className={cx('field num', !a.is_done && a.due_at && new Date(a.due_at) < new Date() && 'text-rose-600 dark:text-rose-400')}
                    defaultValue={toLocalInput(a.due_at)}
                    onBlur={(e) => patch(a, 'due_at', e.target.value)}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
        <div className="scrollbar-thin hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-surface-2 text-left">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:tracking-wider [&>th]:text-muted [&>th]:uppercase">
                <th>Evaluación</th>
                <th className="w-20">Peso %</th>
                <th className="w-20">Nota</th>
                <th className="w-44">Fecha y hora</th>
                <th className="w-16 text-center">Hecha</th>
                <th className="w-20 text-right">Aporta</th>
                <th className="w-9" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {assessments.map((a) => (
                <tr key={`${a.id}-${a.weight}-${a.grade}-${a.due_at}-${a.name}`} className={cx('group', a.is_done && 'opacity-70')}>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                    <KindToggle a={a} />
                    <input
                      className="h-8 w-full rounded bg-transparent px-1 outline-none focus:bg-surface-2 focus:ring-1 focus:ring-line"
                      defaultValue={a.name}
                      onBlur={(e) => {
                        const r = patch(a, 'name', e.target.value)
                        if (r !== null) e.target.value = r
                      }}
                      aria-label="Nombre de la evaluación"
                    />
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="num h-8 w-full rounded bg-transparent px-1 text-right outline-none focus:bg-surface-2 focus:ring-1 focus:ring-line"
                      inputMode="decimal"
                      defaultValue={show(a.weight)}
                      onBlur={(e) => {
                        const r = patch(a, 'weight', e.target.value)
                        if (r !== null) e.target.value = r
                      }}
                      aria-label="Peso"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={cx('num h-8 w-full rounded bg-transparent px-1 text-right font-semibold outline-none focus:bg-surface-2 focus:ring-1 focus:ring-line', gradeTone(a.grade))}
                      inputMode="decimal"
                      placeholder="—"
                      defaultValue={show(a.grade)}
                      onBlur={(e) => {
                        const r = patch(a, 'grade', e.target.value)
                        if (r !== null) e.target.value = r
                      }}
                      aria-label="Nota"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="datetime-local"
                      className={cx(
                        'num h-8 w-full rounded bg-transparent px-1 text-xs outline-none focus:bg-surface-2 focus:ring-1 focus:ring-line',
                        !a.is_done && a.due_at && new Date(a.due_at) < new Date() && 'text-rose-600 dark:text-rose-400',
                      )}
                      defaultValue={toLocalInput(a.due_at)}
                      onBlur={(e) => patch(a, 'due_at', e.target.value)}
                      aria-label="Fecha y hora de entrega"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-center">
                      <Check checked={a.is_done} onChange={(v) => update('study_assessments', a.id, { is_done: v })} label={`${a.name} entregada`} />
                    </div>
                  </td>
                  <td className="num px-3 py-1.5 text-right text-xs text-muted">{a.grade !== null ? fmtGrade((a.weight * a.grade) / 100) : '—'}</td>
                  <td className="px-1 py-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-60"
                      onClick={() => remove('study_assessments', a.id)}
                      aria-label={`Eliminar ${a.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <form onSubmit={add} className="space-y-2 border-t border-line bg-surface-2 p-3">
        <div className="flex gap-1.5" role="radiogroup" aria-label="Tipo de evaluación">
          {(['delivery', 'exam'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => chooseKind(k)}
              className={cx('h-7 rounded-md border px-3 text-xs font-medium transition', kind === k ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted hover:text-fg')}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_72px_72px_136px_110px_auto]">
          <input className="field col-span-2 md:col-span-1" placeholder="Nueva evaluación (p. ej. Examen final)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          <input className={cx('field num', weight && w === undefined && 'border-rose-500')} inputMode="decimal" placeholder="Peso %" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <input className={cx('field num', grade && gr === undefined && 'border-rose-500')} inputMode="decimal" placeholder="Nota" value={grade} onChange={(e) => setGrade(e.target.value)} />
          <input type="date" className="field num" value={date} onChange={(e) => setDate(e.target.value)} aria-label={kind === 'exam' ? 'Fecha del examen' : 'Fecha de entrega'} />
          <input
            type="time"
            className="field num"
            value={time}
            onChange={(e) => {
              setTime(e.target.value)
              setTimeTouched(true)
            }}
            aria-label={kind === 'exam' ? 'Hora del examen' : 'Hora de entrega'}
            disabled={!date}
          />
          <Button type="submit" variant="primary" className="col-span-2 md:col-span-1" disabled={!valid}>
            <Plus className="size-4" /> Añadir
          </Button>
        </div>
        {date && (
          <p className="text-xs text-muted">🔔 Telegram te avisará {KIND_REMINDERS[kind]}.</p>
        )}
        {date && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <Check checked={toAgenda} onChange={setToAgenda} label="Añadir a la Agenda" />
            <CalendarPlus className="size-3.5" /> Añadir también a la Agenda (categoría Máster)
          </label>
        )}
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------- PDF notes
function Files({ subject, files }: { subject: StudySubject; files: StudyFile[] }) {
  const { source, uploadStudyFile, openStudyFile, deleteStudyFiles } = useData()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const m = new Map<string, StudyFile[]>()
    for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))) {
      const k = f.topic || 'Sin tema'
      m.set(k, [...(m.get(k) ?? []), f])
    }
    return [...m.entries()].sort(([a], [b]) => (a === 'Sin tema' ? 1 : b === 'Sin tema' ? -1 : a.localeCompare(b, 'es', { numeric: true })))
  }, [files])
  const totalSize = files.reduce((a, f) => a + f.size_bytes, 0)

  async function upload(list: FileList | File[]) {
    const all = [...list]
    const pdfs = all.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
    if (pdfs.length < all.length) toast('error', 'Solo se admiten archivos PDF')
    for (const f of pdfs) {
      if (f.size > MAX_PDF_BYTES) {
        toast('error', `«${f.name}» pesa ${fmtBytes(f.size)}; el máximo es 50 MB`)
        continue
      }
      setBusy(f.name)
      if (await uploadStudyFile(subject.id, f, topic)) toast('success', `«${f.name}» subido`)
    }
    setBusy(null)
    if (input.current) input.current.value = ''
  }

  async function open(f: StudyFile) {
    // Open the tab synchronously (inside the click) so iOS Safari doesn't block it.
    const tab = window.open('', '_blank')
    const url = await openStudyFile(f.storage_path)
    if (!url) {
      tab?.close()
      return
    }
    if (tab) tab.location.href = url
    else window.location.href = url
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    if (e.dataTransfer.files.length) void upload(e.dataTransfer.files)
  }

  return (
    <Card title="Apuntes" action={<span className="num text-xs text-muted">{files.length} PDF · {fmtBytes(totalSize)}</span>} className="xl:self-start">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cx('rounded-lg border-2 border-dashed p-3 transition', drag ? 'border-accent bg-accent/5' : 'border-line')}
      >
        <div className="flex gap-2">
          <input className="field h-9 text-xs" placeholder="Tema (opcional), p. ej. Tema 3" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} />
          <Button onClick={() => input.current?.click()} disabled={busy !== null}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Subir PDF
          </Button>
        </div>
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        <p className="mt-2 text-center text-[11px] text-faint">
          {busy ? `Subiendo «${busy}»…` : 'o arrastra aquí los PDF · máx. 50 MB cada uno'}
        </p>
        {source === 'local' && <p className="mt-1 text-center text-[11px] text-amber-600 dark:text-amber-400">En el modo demo no se pueden subir ni abrir archivos.</p>}
      </div>

      {files.length === 0 ? (
        <p className="mt-4 text-center text-sm text-muted">Aún no hay apuntes.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {grouped.map(([t, list]) => (
            <div key={t}>
              <div className="eyebrow mb-1.5">{t}</div>
              <ul className="space-y-1">
                {list.map((f) => (
                  <li key={f.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    <FileText className="size-4 shrink-0 text-rose-500" />
                    <button onClick={() => open(f)} className="min-w-0 flex-1 text-left" title="Abrir">
                      <div className="truncate text-sm">{f.name}</div>
                      <div className="num text-[11px] text-faint">
                        {fmtBytes(f.size_bytes)} · {fmtDate(new Date(f.created_at), { day: '2-digit', month: 'short', year: '2-digit' })}
                      </div>
                    </button>
                    <Button variant="ghost" size="icon" onClick={() => open(f)} aria-label={`Abrir ${f.name}`}>
                      <ExternalLink className="size-3.5" />
                    </Button>
                    {confirmId === f.id ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          setConfirmId(null)
                          await deleteStudyFiles([f])
                        }}
                      >
                        Borrar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-60"
                        onClick={() => setConfirmId(f.id)}
                        aria-label={`Eliminar ${f.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

