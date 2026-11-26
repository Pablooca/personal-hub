import { useMemo, useState } from 'react'
import { BookOpenCheck, ClipboardList, ExternalLink, FileText, Plus, Trash2 } from 'lucide-react'
import { Button, Card, Empty, Field, Modal, cx } from '../../components/ui'
import { COLOR_BG } from '../../lib/categories'
import { toDateKey } from '../../lib/dates'
import { LEVEL_LABELS, fmtDay, recordScore, testState, testStats, topicStage, STAGE_LABELS, type TestState } from '../../lib/studyPlan'
import { fmtGrade } from '../../lib/studies'
import { TEST_KINDS, type StudySubject, type StudyTest, type StudyTopic, type TestKind } from '../../lib/types'
import { useData } from '../../state/data'

/** Opens a private PDF (path may end in "#page=N"). The tab is opened inside the click so iOS doesn't block it. */
export function useOpenPdf() {
  const { openStudyFile } = useData()
  return async (path: string) => {
    const [file, frag] = path.split('#')
    const tab = window.open('', '_blank')
    const url = await openStudyFile(file)
    if (!url) {
      tab?.close()
      return
    }
    const full = frag ? `${url}#${frag}` : url
    if (tab) tab.location.href = full
    else window.location.href = full
  }
}

/** A stored file (not a free-text path)? */
export const isStored = (path: string) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf(#.*)?$/.test(path)

export const STATE_STYLES: Record<TestState, string> = {
  pending: 'border-line text-faint hover:border-line-strong hover:text-fg',
  failed: 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300',
  passed: 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300',
  mastered: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
}
const STATE_LABELS: Record<TestState, string> = { pending: 'sin hacer', failed: 'suspenso', passed: 'aprobado', mastered: 'dominado (≥ 8)' }
const KIND_LABELS: Record<TestKind, string> = { topic: 'De un tema', global: 'Global (todo el temario)', mock: 'Simulacro de examen' }

/** One test as a small chip: level + last grade, coloured by state. */
export function TestChip({ t, onOpen, label }: { t: StudyTest; onOpen: (t: StudyTest) => void; label?: string }) {
  const s = testState(t)
  return (
    <button
      type="button"
      onClick={() => onOpen(t)}
      title={`${t.name} · ${STATE_LABELS[s]}${t.attempts ? ` · ${t.attempts} ${t.attempts === 1 ? 'intento' : 'intentos'}` : ''}`}
      className={cx('num inline-flex h-7 min-w-10 shrink-0 items-center justify-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition pointer-coarse:h-8', STATE_STYLES[s])}
    >
      {label ?? (t.level ? `N${t.level}` : t.name)}
      {t.score !== null && <span className="font-semibold">{fmtGrade(t.score).replace(',00', '')}</span>}
    </button>
  )
}

/** Grade a test or edit its data. */
export function TestModal({ test, subject, topics, onClose }: { test: Partial<StudyTest> & { subject_id: string }; subject?: StudySubject; topics: StudyTopic[]; onClose: () => void }) {
  const { data, create, update, remove } = useData()
  const openPdf = useOpenPdf()
  const solPage = test.notes?.match(/soluciones[^.]*pág\. (\d+)/i)?.[1]
  const solutions = solPage ? data.study_files.find((f) => f.subject_id === test.subject_id && /soluciones/i.test(f.name)) : undefined
  const today = toDateKey(new Date())
  const editingData = !test.id
  const [edit, setEdit] = useState(editingData)
  const [score, setScore] = useState('')
  const [name, setName] = useState(test.name ?? '')
  const [kind, setKind] = useState<TestKind>(test.kind ?? 'topic')
  const [topic, setTopic] = useState(test.topic_id ?? '')
  const [level, setLevel] = useState(test.level?.toString() ?? '')
  const [questions, setQuestions] = useState(test.questions?.toString() ?? '')
  const [minutes, setMinutes] = useState(test.minutes?.toString() ?? '')
  const [path, setPath] = useState(test.path ?? '')
  const [notes, setNotes] = useState(test.notes ?? '')
  const n = Number(score.replace(',', '.'))
  const scoreOk = score.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 10
  const int = (v: string) => (v.trim() && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null)

  async function saveScore() {
    if (!test.id || !scoreOk) return
    onClose()
    await update('study_tests', test.id, { ...recordScore({ best: test.best ?? null, attempts: test.attempts ?? 0 }, Math.round(n * 100) / 100, today), notes })
  }
  async function saveData() {
    if (!name.trim()) return
    const row = { name: name.trim(), kind, topic_id: kind === 'topic' ? topic || null : null, level: int(level), questions: int(questions), minutes: int(minutes), path: path.trim(), notes }
    onClose()
    if (test.id) await update('study_tests', test.id, row)
    else await create('study_tests', { ...row, subject_id: test.subject_id, position: test.position ?? 0, score: null, best: null, attempts: 0, last_done: null })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={test.id ? test.name : 'Nuevo test'}
      footer={
        <>
          {test.id && (
            <Button
              variant="danger"
              className="mr-auto"
              aria-label="Eliminar test"
              onClick={() => {
                onClose()
                void remove('study_tests', test.id!)
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {edit ? (
            <Button variant="primary" onClick={saveData} disabled={!name.trim()}>
              Guardar
            </Button>
          ) : (
            <Button variant="primary" onClick={saveScore} disabled={!scoreOk}>
              Guardar nota
            </Button>
          )}
        </>
      }
    >
      {!edit && test.id ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void saveScore()
          }}
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-line p-2">
              <div className="text-[11px] text-muted">Última</div>
              <div className="num text-lg font-semibold">{fmtGrade(test.score)}</div>
            </div>
            <div className="rounded-lg border border-line p-2">
              <div className="text-[11px] text-muted">Mejor</div>
              <div className="num text-lg font-semibold">{fmtGrade(test.best)}</div>
            </div>
            <div className="rounded-lg border border-line p-2">
              <div className="text-[11px] text-muted">Intentos</div>
              <div className="num text-lg font-semibold">{test.attempts ?? 0}</div>
            </div>
          </div>
          <p className="text-xs text-muted">
            {[subject?.name, test.level && `Nivel ${test.level} · ${LEVEL_LABELS[test.level] ?? ''}`, test.questions && `${test.questions} preguntas`, test.minutes && `${test.minutes} min cronometrado`, test.last_done && `último intento ${fmtDay(test.last_done)}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {test.path && isStored(test.path) ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void openPdf(test.path!)}>
                <ExternalLink className="size-4" /> Abrir test
              </Button>
              {solutions && (
                <Button onClick={() => void openPdf(`${solutions.storage_path}#page=${solPage}`)}>
                  <BookOpenCheck className="size-4" /> Ver soluciones
                </Button>
              )}
            </div>
          ) : (
            test.path && (
              <p className="flex items-start gap-1.5 rounded-md bg-surface-2 px-2 py-1.5 font-mono text-[11px] break-all text-muted">
                <FileText className="mt-0.5 size-3 shrink-0" /> {test.path}
              </p>
            )
          )}
          <Field label="Nota de hoy (sobre 10)">
            <input className="field num text-lg" inputMode="decimal" autoFocus value={score} onChange={(e) => setScore(e.target.value)} placeholder="7,5" />
          </Field>
          <Field label="Fallos y trampas de este test">
            <textarea className="field min-h-20 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
          </Field>
          <button type="button" className="text-xs text-muted underline" onClick={() => setEdit(true)}>
            Editar los datos del test
          </button>
          <button type="submit" hidden />
        </form>
      ) : (
        <div className="space-y-4">
          <Field label="Nombre">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder="Test UA1 T01 · Nivel 1" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select className="field" value={kind} onChange={(e) => setKind(e.target.value as TestKind)}>
                {TEST_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nivel">
              <input className="field num" inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value.replace(/\D/g, ''))} placeholder="1–4" />
            </Field>
          </div>
          {kind === 'topic' && (
            <Field label="Tema">
              <select className="field" value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="">—</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preguntas">
              <input className="field num" inputMode="numeric" value={questions} onChange={(e) => setQuestions(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Minutos (cronometrado)">
              <input className="field num" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <Field label="Archivo (ruta dentro de la carpeta de la asignatura)">
            <input className="field font-mono text-xs" value={path} onChange={(e) => setPath(e.target.value)} maxLength={400} placeholder="tests/pdf/…" />
          </Field>
        </div>
      )}
    </Modal>
  )
}

/** Checklist: every topic with its study stage and its tests, plus whole-syllabus tests and mock exams. */
export function TestsInventory({ subjects }: { subjects: StudySubject[] }) {
  const { data } = useData()
  const [open, setOpen] = useState<(Partial<StudyTest> & { subject_id: string }) | null>(null)
  const ids = new Set(subjects.map((s) => s.id))
  const tests = useMemo(() => data.study_tests.filter((t) => ids.has(t.subject_id)).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [data.study_tests, subjects]) // eslint-disable-line react-hooks/exhaustive-deps
  const all = testStats(tests)
  const subjectOf = new Map(subjects.map((s) => [s.id, s]))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="eyebrow">Tests</div>
          <div className="num mt-2 text-2xl font-semibold">{all.total}</div>
          <div className="mt-1 text-xs text-muted">en el inventario</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Hechos</div>
          <div className="num mt-2 text-2xl font-semibold">
            {all.done}
            <span className="text-base text-muted">/{all.total}</span>
          </div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Aprobados</div>
          <div className="num mt-2 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{all.passed}</div>
          <div className="mt-1 text-xs text-muted">{all.failed ? `${all.failed} por repetir` : 'nada por repetir'}</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Nota media</div>
          <div className="num mt-2 text-2xl font-semibold">{fmtGrade(all.average)}</div>
          <div className="mt-1 text-xs text-muted">de la última nota de cada test</div>
        </div>
      </div>

      {subjects.map((s) => (
        <SubjectTests key={s.id} subject={s} tests={tests.filter((t) => t.subject_id === s.id)} onOpen={(t) => setOpen(t)} onNew={() => setOpen({ subject_id: s.id, position: tests.filter((t) => t.subject_id === s.id).length + 1 })} />
      ))}
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        {(['pending', 'failed', 'passed', 'mastered'] as TestState[]).map((k) => (
          <span key={k} className={cx('rounded border px-1.5 py-0.5', STATE_STYLES[k])}>
            {STATE_LABELS[k]}
          </span>
        ))}
        <span>Toca un test para apuntar la nota de hoy.</span>
      </p>
      {open && (
        <TestModal
          test={open.id ? (tests.find((t) => t.id === open.id) ?? open) : open}
          subject={subjectOf.get(open.subject_id)}
          topics={data.study_topics.filter((t) => t.subject_id === open.subject_id).sort((a, b) => a.position - b.position)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

export function SubjectTests({ subject, tests, onOpen, onNew }: { subject: StudySubject; tests: StudyTest[]; onOpen: (t: StudyTest) => void; onNew: () => void }) {
  const { data } = useData()
  const topics = data.study_topics.filter((t) => t.subject_id === subject.id).sort((a, b) => a.position - b.position)
  const st = testStats(tests)
  const byTopic = new Map<string, StudyTest[]>()
  for (const t of tests) if (t.kind === 'topic' && t.topic_id) byTopic.set(t.topic_id, [...(byTopic.get(t.topic_id) ?? []), t])
  const loose = tests.filter((t) => t.kind !== 'topic' || !t.topic_id)
  const levels = [...new Set(tests.filter((t) => t.kind === 'topic').map((t) => t.level ?? 0))].sort()

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span className={cx('size-2 shrink-0 rounded-full', COLOR_BG[subject.color])} />
          {subject.name}
        </span>
      }
      action={
        <span className="flex items-center gap-2">
          {st.total > 0 && (
            <span className="num text-xs text-muted">
              {st.passed}/{st.total} aprobados
            </span>
          )}
          <Button size="icon" variant="ghost" onClick={onNew} aria-label={`Añadir test a ${subject.name}`}>
            <Plus className="size-3.5" />
          </Button>
        </span>
      }
      bodyClass="p-0"
    >
      {tests.length === 0 ? (
        <div className="p-4">
          <Empty icon={<ClipboardList className="size-5" />}>Aún no hay tests en la carpeta de esta asignatura. Cuando los tengas, añádelos con el «+».</Empty>
        </div>
      ) : (
        <>
          {byTopic.size > 0 && (
            <ul className="divide-y divide-line">
              {topics
                .filter((t) => byTopic.has(t.id))
                .map((t) => {
                  const list = byTopic.get(t.id)!
                  const stage = topicStage(t)
                  return (
                    <li key={t.id} className="flex flex-col gap-1.5 px-4 py-2 sm:flex-row sm:items-center">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{t.name}</span>
                        <span className={cx('text-[11px]', stage === 'pending' ? 'text-faint' : 'text-emerald-700 dark:text-emerald-400')}>Estudio: {STAGE_LABELS[stage]}</span>
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {levels.map((lv) => {
                          const x = list.find((y) => (y.level ?? 0) === lv)
                          return x ? <TestChip key={lv} t={x} onOpen={onOpen} /> : <span key={lv} className="inline-block h-7 min-w-10" />
                        })}
                      </span>
                    </li>
                  )
                })}
            </ul>
          )}
          {loose.length > 0 && (
            <div className={cx('px-4 py-3', byTopic.size > 0 && 'border-t border-line')}>
              <div className="mb-2 text-[11px] font-medium text-muted">Todo el temario</div>
              <div className="flex flex-wrap gap-1.5">
                {loose.map((t) => (
                  <TestChip key={t.id} t={t} onOpen={onOpen} label={t.name} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

/** Tests of one subject, with their own grading dialog (used in the subject page). */
export function SubjectTestsCard({ subject }: { subject: StudySubject }) {
  const { data } = useData()
  const [open, setOpen] = useState<(Partial<StudyTest> & { subject_id: string }) | null>(null)
  const tests = data.study_tests.filter((t) => t.subject_id === subject.id).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  return (
    <>
      <SubjectTests subject={subject} tests={tests} onOpen={setOpen} onNew={() => setOpen({ subject_id: subject.id, position: tests.length + 1 })} />
      {open && (
        <TestModal
          test={open.id ? (tests.find((t) => t.id === open.id) ?? open) : open}
          subject={subject}
          topics={data.study_topics.filter((t) => t.subject_id === subject.id).sort((a, b) => a.position - b.position)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}
