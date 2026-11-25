import { useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '../../components/Shell'
import { Badge, Button, Check, Empty, Field, Modal, ProgressBar, cx } from '../../components/ui'
import { COLOR_BG } from '../../lib/categories'
import { fmtGrade, gradeLabel, gradeTone, programStats, subjectGrade } from '../../lib/studies'
import { CATEGORY_COLORS, type CategoryColor, type StudyProgram, type StudySubject, type SubjectStatus } from '../../lib/types'
import { useData } from '../../state/data'
import { useFocusTarget } from '../../state/nav'
import { SubjectDetail } from './SubjectDetail'

type Route = { kind: 'list' } | { kind: 'program'; id: string } | { kind: 'subject'; programId: string; id: string }

const fmtCredits = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })

export const STATUS_LABELS: Record<SubjectStatus, string> = { in_progress: 'En curso', passed: 'Aprobada', failed: 'Suspensa' }
export const STATUS_STYLES: Record<SubjectStatus, string> = {
  in_progress: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  passed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  failed: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

/** Grade info for every subject (calculated once, reused by lists and stats). */
export function useSubjectGrades() {
  const { data } = useData()
  return useMemo(() => {
    const bySubject = new Map<string, ReturnType<typeof subjectGrade>>()
    for (const s of data.study_subjects) {
      bySubject.set(s.id, subjectGrade(s, data.study_assessments.filter((a) => a.subject_id === s.id)))
    }
    return bySubject
  }, [data.study_subjects, data.study_assessments])
}

/** What is coming, the first thing you see when opening Estudios. */
function Upcoming({ onOpen }: { onOpen: (subjectId: string) => void }) {
  const { data, update } = useData()
  const now = Date.now()
  const subjects = new Map(data.study_subjects.map((s) => [s.id, s]))
  const pending = data.study_assessments
    .filter((a) => a.due_at && !a.is_done && a.grade === null)
    .map((a) => ({ a, at: new Date(a.due_at!).getTime(), subject: subjects.get(a.subject_id) }))
    .filter((x) => x.subject)
    .sort((x, y) => x.at - y.at)
  const late = pending.filter((x) => x.at < now)
  const next = pending.filter((x) => x.at >= now).slice(0, 8)
  if (!late.length && !next.length) return null
  const left = (at: number) => {
    const h = Math.round((at - now) / 3_600_000)
    return h < 0 ? 'pasada' : h < 24 ? `en ${Math.max(1, h)} h` : `en ${Math.round(h / 24)} días`
  }
  return (
    <section className="card mb-5 overflow-hidden">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Próximas entregas y exámenes</h2>
      <ul className="divide-y divide-line">
        {[...late, ...next].map(({ a, at, subject }) => {
          const soon = at >= now && at - now < 3 * 86_400_000
          return (
            <li key={a.id} className="flex items-center gap-3 px-4">
              <Check checked={false} onChange={() => void update('study_assessments', a.id, { is_done: true })} label={`Marcar como hecho: ${a.name}`} />
              <button type="button" onClick={() => onOpen(a.subject_id)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <span className={cx('size-2 shrink-0 rounded-full', COLOR_BG[subject!.color])} />
                    <span className="truncate">
                      {a.kind === 'exam' ? 'Examen' : 'Entrega'} · {a.weight} % · {subject!.name}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={cx('num block text-sm font-semibold', at < now ? 'text-rose-700 dark:text-rose-400' : soon && 'text-amber-700 dark:text-amber-400')}>{left(at)}</span>
                  <span className="num block text-[11px] text-muted">{new Date(at).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function StudiesView() {
  const { data } = useData()
  const [route, setRoute] = useState<Route>({ kind: 'list' })
  const go = (r: Route) => {
    setRoute(r)
    window.scrollTo({ top: 0 })
  }

  useFocusTarget(['subject'], (t) => {
    const s = data.study_subjects.find((x) => x.id === t.id)
    if (s) go({ kind: 'subject', programId: s.program_id, id: s.id })
  })

  if (route.kind === 'subject') {
    const subject = data.study_subjects.find((s) => s.id === route.id)
    if (subject) return <SubjectDetail key={subject.id} subject={subject} onBack={() => go({ kind: 'program', id: route.programId })} />
  }
  if (route.kind === 'program' || route.kind === 'subject') {
    const program = data.study_programs.find((p) => p.id === (route.kind === 'program' ? route.id : route.programId))
    if (program)
      return <ProgramDetail program={program} onBack={() => go({ kind: 'list' })} onOpenSubject={(id) => go({ kind: 'subject', programId: program.id, id })} />
  }
  return <ProgramList onOpen={(id) => go({ kind: 'program', id })} onOpenSubject={(id) => {
    const s = data.study_subjects.find((x) => x.id === id)
    if (s) go({ kind: 'subject', programId: s.program_id, id })
  }} />
}

// ---------------------------------------------------------------- programs
function ProgramList({ onOpen, onOpenSubject }: { onOpen: (id: string) => void; onOpenSubject: (id: string) => void }) {
  const { data } = useData()
  const grades = useSubjectGrades()
  const [editing, setEditing] = useState<Partial<StudyProgram> | null>(null)

  return (
    <>
      <PageHeader
        eyebrow="Estudios"
        title="Programas"
        actions={
          <Button variant="primary" onClick={() => setEditing({})}>
            <Plus className="size-4" /> <span className="max-sm:sr-only">Nuevo programa</span>
          </Button>
        }
      />
      <Upcoming onOpen={onOpenSubject} />
      {data.study_programs.length === 0 ? (
        <Empty icon={<GraduationCap className="size-5" />}>
          Crea tu primer programa (p. ej. «Máster») y dentro añade las asignaturas.
          <Button size="sm" variant="primary" onClick={() => setEditing({ name: 'Máster' })}>
            <Plus className="size-3.5" /> Crear programa
          </Button>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.study_programs.map((p) => {
            const subjects = data.study_subjects.filter((s) => s.program_id === p.id)
            const stats = programStats(subjects, subjects.map((s) => grades.get(s.id)?.effective ?? null))
            const total = p.total_credits ?? stats.creditsTotal
            return (
              <article
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => e.key === 'Enter' && onOpen(p.id)}
                className="cursor-pointer rounded-xl border border-line bg-surface p-4 transition hover:-translate-y-px hover:border-line-strong hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="truncate text-xs text-muted">{[p.institution, p.academic_year].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <div className="text-right">
                    <div className={cx('num text-2xl font-semibold', gradeTone(stats.average))}>{fmtGrade(stats.average)}</div>
                    <div className="text-[10px] text-faint uppercase">media</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <ProgressBar value={total ? (stats.creditsPassed / total) * 100 : 0} tone="emerald" />
                  <span className="num shrink-0 text-[11px] text-muted">
                    {fmtCredits(stats.creditsPassed)}/{fmtCredits(total)} ECTS
                  </span>
                </div>
                <div className="mt-2 text-xs text-muted">{subjects.length} asignaturas</div>
              </article>
            )
          })}
        </div>
      )}
      {editing && <ProgramModal program={editing} onClose={() => setEditing(null)} onCreated={onOpen} />}
    </>
  )
}

function ProgramModal({ program, onClose, onCreated }: { program: Partial<StudyProgram>; onClose: () => void; onCreated?: (id: string) => void }) {
  const { create, update } = useData()
  const [name, setName] = useState(program.name ?? '')
  const [institution, setInstitution] = useState(program.institution ?? '')
  const [year, setYear] = useState(program.academic_year ?? '')
  const [credits, setCredits] = useState(program.total_credits?.toString() ?? '')
  const editing = Boolean(program.id)

  async function save() {
    if (!name.trim()) return
    const total = credits.trim() ? Number(credits.replace(',', '.')) : null
    const row = { name: name.trim(), institution: institution.trim(), academic_year: year.trim(), total_credits: total !== null && Number.isFinite(total) ? total : null }
    onClose()
    if (editing && program.id) await update('study_programs', program.id, row)
    else {
      const created = await create('study_programs', row)
      if (created) onCreated?.(created.id)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Editar programa' : 'Nuevo programa'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
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
        <Field label="Nombre">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Máster en …" maxLength={120} />
        </Field>
        <Field label="Universidad / centro">
          <input className="field" value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Curso">
            <input className="field num" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026/2027" maxLength={20} />
          </Field>
          <Field label="Créditos totales">
            <input className="field num" inputMode="decimal" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="60" />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------- program detail
function ProgramDetail({ program, onBack, onOpenSubject }: { program: StudyProgram; onBack: () => void; onOpenSubject: (id: string) => void }) {
  const { data, remove, deleteStudyFiles } = useData()
  const grades = useSubjectGrades()
  const [editingProgram, setEditingProgram] = useState(false)
  const [newSubject, setNewSubject] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const subjects = data.study_subjects.filter((s) => s.program_id === program.id)
  const stats = programStats(subjects, subjects.map((s) => grades.get(s.id)?.effective ?? null))
  const total = program.total_credits ?? stats.creditsTotal

  async function deleteProgram() {
    const ids = new Set(subjects.map((s) => s.id))
    // Storage objects first: the rows go with the cascade.
    await deleteStudyFiles(data.study_files.filter((f) => ids.has(f.subject_id)))
    onBack()
    await remove('study_programs', program.id)
  }

  return (
    <>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Programas
      </button>
      <PageHeader
        eyebrow={[program.institution, program.academic_year].filter(Boolean).join(' · ') || 'Programa'}
        title={program.name}
        actions={
          <>
            <Button onClick={() => setEditingProgram(true)}>
              <Pencil className="size-4" /> <span className="max-sm:sr-only">Editar</span>
            </Button>
            {confirmDelete ? (
              <>
                <Button variant="danger" onClick={deleteProgram}>
                  Eliminar todo
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} aria-label="Eliminar programa">
                <Trash2 className="size-4" />
              </Button>
            )}
            <Button variant="primary" onClick={() => setNewSubject(true)}>
              <Plus className="size-4" /> <span className="max-sm:sr-only">Nueva asignatura</span>
            </Button>
          </>
        }
      />
      {confirmDelete && <p className="-mt-3 mb-4 text-xs text-rose-700 dark:text-rose-400">Se borrarán sus {subjects.length} asignaturas, notas y apuntes PDF.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="eyebrow">Media ponderada</div>
          <div className={cx('num mt-2 text-2xl font-semibold', gradeTone(stats.average))}>{fmtGrade(stats.average)}</div>
          <div className="mt-1 text-xs text-muted">{stats.average !== null ? `${gradeLabel(stats.average)} · por créditos ECTS` : 'Aún sin notas finales'}</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Créditos aprobados</div>
          <div className="num mt-2 text-2xl font-semibold">
            {fmtCredits(stats.creditsPassed)}
            <span className="text-base text-muted">/{fmtCredits(total)}</span>
          </div>
          <ProgressBar className="mt-2" value={total ? (stats.creditsPassed / total) * 100 : 0} tone="emerald" />
        </div>
        <div className="card p-4">
          <div className="eyebrow">Asignaturas</div>
          <div className="num mt-2 text-2xl font-semibold">{subjects.length}</div>
          <div className="mt-1 text-xs text-muted">{subjects.filter((s) => s.status === 'in_progress').length} en curso</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Apuntes</div>
          <div className="num mt-2 text-2xl font-semibold">{data.study_files.filter((f) => subjects.some((s) => s.id === f.subject_id)).length}</div>
          <div className="mt-1 text-xs text-muted">PDF guardados</div>
        </div>
      </div>

      {subjects.length === 0 ? (
        <div className="mt-4">
          <Empty icon={<BookOpen className="size-5" />}>
            Añade la primera asignatura.
            <Button size="sm" variant="primary" onClick={() => setNewSubject(true)}>
              <Plus className="size-3.5" /> Nueva asignatura
            </Button>
          </Empty>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((s) => (
            <SubjectCard key={s.id} s={s} files={data.study_files.filter((f) => f.subject_id === s.id).length} onOpen={() => onOpenSubject(s.id)} />
          ))}
        </div>
      )}

      {editingProgram && <ProgramModal program={program} onClose={() => setEditingProgram(false)} />}
      {newSubject && <SubjectModal programId={program.id} onClose={() => setNewSubject(false)} onCreated={onOpenSubject} />}
    </>
  )
}

function SubjectCard({ s, files, onOpen }: { s: StudySubject; files: number; onOpen: () => void }) {
  const g = useSubjectGrades().get(s.id)
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="relative cursor-pointer overflow-hidden rounded-xl border border-line bg-surface p-4 pl-5 transition hover:-translate-y-px hover:border-line-strong hover:shadow-sm"
    >
      <span className={cx('absolute inset-y-0 left-0 w-1', COLOR_BG[s.color])} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="leading-snug font-semibold">{s.name}</h3>
          <p className="text-xs text-muted">{[`${s.credits.toLocaleString('es-ES')} ECTS`, s.semester].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="text-right">
          <div className={cx('num text-xl font-semibold', g?.effective !== null && g?.effective !== undefined ? gradeTone(g.effective) : 'text-fg')}>
            {fmtGrade(g?.effective ?? g?.points ?? null)}
          </div>
          <div className="text-[10px] text-faint">{g?.effective !== null && g?.effective !== undefined ? (s.final_grade !== null ? 'nota oficial' : 'nota final') : 'puntos'}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <ProgressBar value={g?.evaluatedWeight ?? 0} />
        <span className="num shrink-0 text-[11px] text-muted">{g?.evaluatedWeight ?? 0}% evaluado</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
        <Badge className={STATUS_STYLES[s.status]}>{STATUS_LABELS[s.status]}</Badge>
        {g && g.effective === null && g.neededStatus === 'reachable' && (
          <span className="text-muted">
            necesitas <span className="num font-semibold text-fg">{fmtGrade(g.needed)}</span> para un {fmtGrade(s.target_grade)}
          </span>
        )}
        {g && g.effective === null && g.neededStatus === 'impossible' && <span className="text-rose-700 dark:text-rose-400">el {fmtGrade(s.target_grade)} ya no es alcanzable</span>}
        {g && g.effective === null && g.neededStatus === 'reached' && <span className="text-emerald-700 dark:text-emerald-400">{fmtGrade(s.target_grade)} asegurado</span>}
        {!g?.weightsOk && (g?.totalWeight ?? 0) > 0 && <span className="text-amber-700 dark:text-amber-400">pesos: {g?.totalWeight}%</span>}
        {files > 0 && <span className="ml-auto font-mono text-faint">{files} PDF</span>}
      </div>
    </article>
  )
}

// ---------------------------------------------------------------- subject modal
export function SubjectModal({
  programId,
  subject,
  onClose,
  onCreated,
}: {
  programId: string
  subject?: StudySubject
  onClose: () => void
  onCreated?: (id: string) => void
}) {
  const { create, update } = useData()
  const [name, setName] = useState(subject?.name ?? '')
  const [code, setCode] = useState(subject?.code ?? '')
  const [credits, setCredits] = useState(subject ? String(subject.credits).replace('.', ',') : '6')
  const [semester, setSemester] = useState(subject?.semester ?? '')
  const [professor, setProfessor] = useState(subject?.professor ?? '')
  const [color, setColor] = useState<CategoryColor>(subject?.color ?? 'violet')
  const creditsNum = Number(credits.replace(',', '.'))
  const valid = name.trim() && Number.isFinite(creditsNum) && creditsNum >= 0 && creditsNum <= 999

  async function save() {
    if (!valid) return
    const row = { name: name.trim(), code: code.trim(), credits: creditsNum, semester: semester.trim(), professor: professor.trim(), color }
    onClose()
    if (subject) await update('study_subjects', subject.id, row)
    else {
      const created = await create('study_subjects', { ...row, program_id: programId, status: 'in_progress', final_grade: null, target_grade: 5 })
      if (created) onCreated?.(created.id)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={subject ? 'Editar asignatura' : 'Nueva asignatura'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            {subject ? 'Guardar' : 'Crear'}
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
        <Field label="Nombre">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Créditos ECTS">
            <input className="field num" inputMode="decimal" value={credits} onChange={(e) => setCredits(e.target.value)} />
          </Field>
          <Field label="Código">
            <input className="field num" value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} />
          </Field>
          <Field label="Cuatrimestre">
            <input className="field" value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="1º cuatrimestre" maxLength={40} />
          </Field>
          <Field label="Profesor/a">
            <input className="field" value={professor} onChange={(e) => setProfessor(e.target.value)} maxLength={120} />
          </Field>
        </div>
        <div>
          <span className="label">Color</span>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cx('size-6 rounded-md', COLOR_BG[c], color === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'opacity-70 hover:opacity-100')}
                aria-label={c}
                aria-pressed={color === c}
              />
            ))}
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
