import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, FileUp, Loader2, Plus, Trash2, Upload, Wand2 } from 'lucide-react'
import { Button, Field, Modal, cx } from '../../components/ui'
import { loadJsPdf, readPdfStart } from '../../lib/cdn'
import { toDateKey } from '../../lib/dates'
import { downloadText } from '../../lib/download'
import { WEIGHT, overdue, parseSyllabusIndex, replan, scheduleModule, splitByPages, type DayInfo, type Move, type SyllabusTopic } from '../../lib/planner'
import { addDaysKey, fmtDay } from '../../lib/studyPlan'
import type { Dataset, StudyPlan, StudyPlanItem, StudyProgram, StudySubject } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'
import { writePlanPdf } from './planPdf'

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* private mode */
    }
  },
}

/** Class days (evening classes of the master) and public holidays, from the calendar. */
export function dayInfo(d: Dataset): DayInfo {
  const classDays = new Set<string>()
  const holidays = new Set<string>()
  for (const e of d.events) {
    if (e.category === 'master' && !e.all_day) classDays.add(localDay(e.start_at))
    if (e.category === 'holiday') holidays.add(localDay(e.start_at))
  }
  return { classDays, holidays }
}

/** Last day tasks can go to: the end of the plan, and never the exam day or after. */
export const lastDay = (plan: StudyPlan) => (plan.exam_date && plan.exam_date <= plan.end_date ? addDaysKey(plan.exam_date, -1) : plan.end_date)

async function applyMoves(moves: Move[], items: StudyPlanItem[], update: ReturnType<typeof useData>['update']) {
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const m of moves) {
    const i = byId.get(m.id)
    if (!i) continue
    const note = `Reajustada desde el ${fmtDay(m.from)}.`
    await update('study_plan_items', m.id, { date: m.to, notes: i.notes.includes('Reajustada desde') ? i.notes.replace(/Reajustada desde el [^.]+\./, note) : [i.notes, note].filter(Boolean).join('\n') })
  }
}

const AUTO_KEY = 'ph-plan-auto-replan'
const AUTO_DAY_KEY = 'ph-plan-auto-replan-day'

/** Detects unfinished tasks of past days and moves them (on request, or by itself once a day). */
export function ReplanBar({ plan, items }: { plan: StudyPlan; items: StudyPlanItem[] }) {
  const { data, update } = useData()
  const toast = useToast()
  const today = toDateKey(new Date())
  const late = useMemo(() => overdue(items, today), [items, today])
  const [auto, setAuto] = useState(store.get(AUTO_KEY) === '1')
  const [preview, setPreview] = useState<Move[] | null>(null)
  const [busy, setBusy] = useState(false)
  const ran = useRef(false)

  const compute = () => replan(items, today, lastDay(plan), dayInfo(data))
  async function apply(moves: Move[]) {
    setBusy(true)
    await applyMoves(moves, items, update)
    setBusy(false)
    setPreview(null)
    toast('success', `Planning reajustado: ${moves.length} ${moves.length === 1 ? 'tarea movida' : 'tareas movidas'}`)
  }

  useEffect(() => {
    if (!auto || ran.current || !late.length || store.get(AUTO_DAY_KEY) === today) return
    ran.current = true
    store.set(AUTO_DAY_KEY, today)
    const moves = compute()
    if (moves.length) void apply(moves)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, late.length, today])

  return (
    <>
      <div className={cx('mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2.5', late.length ? 'border-amber-500/40 bg-amber-500/10' : 'border-line bg-surface')}>
        {late.length ? <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" /> : <Wand2 className="size-4 shrink-0 text-faint" />}
        <p className="min-w-0 flex-1 text-sm">
          {late.length ? (
            <>
              <span className="font-semibold">{late.length} {late.length === 1 ? 'tarea atrasada' : 'tareas atrasadas'}</span>{' '}
              <span className="text-muted">de días anteriores sin marcar.</span>
            </>
          ) : (
            <span className="text-muted">Al día: no hay tareas atrasadas.</span>
          )}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked)
              store.set(AUTO_KEY, e.target.checked ? '1' : '0')
            }}
          />
          Reajustar solo cada día
        </label>
        <Button size="sm" variant={late.length ? 'primary' : 'secondary'} disabled={!late.length || busy} onClick={() => setPreview(compute())}>
          <Wand2 className="size-3.5" /> Auto-reajustar planning
        </Button>
      </div>
      {preview && (
        <Modal
          open
          onClose={() => setPreview(null)}
          title="Reajustar el planning"
          footer={
            <>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Cancelar
              </Button>
              <Button variant="primary" disabled={!preview.length || busy} onClick={() => apply(preview)}>
                {busy && <Loader2 className="size-4 animate-spin" />} Mover {preview.length}
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-muted">
            Primero se usan los días colchón y después los días con más hueco, sin pasar del {fmtDay(lastDay(plan))} ni tocar los exámenes. Los días de clase y de descanso reciben poco.
          </p>
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {preview.map((m) => (
              <li key={m.id} className="px-3 py-2 text-sm">
                <span className="block">{m.title}</span>
                <span className="num text-[11px] text-muted">
                  {fmtDay(m.from)} → <span className="font-semibold text-fg">{fmtDay(m.to)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  )
}

// ------------------------------------------------------------------ progress export / import
interface ProgressFile {
  app: 'personal-hub'
  kind: 'study-progress'
  version: 1
  exported_at: string
  plan_id: string
  items: Pick<StudyPlanItem, 'id' | 'date' | 'is_done' | 'notes'>[]
  topics: { id: string; highlighted: boolean; studied: boolean; reviews: number; last_studied: string | null; final_pass: boolean; confidence: number | null; notes: string }[]
  tests: { id: string; score: number | null; best: number | null; attempts: number; last_done: string | null; notes: string }[]
}

export function ProgressButtons({ plan, subjects }: { plan: StudyPlan; subjects: StudySubject[] }) {
  const { data, update } = useData()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const ids = new Set(subjects.map((s) => s.id))

  function exportJson() {
    const file: ProgressFile = {
      app: 'personal-hub', kind: 'study-progress', version: 1, exported_at: new Date().toISOString(), plan_id: plan.id,
      items: data.study_plan_items.filter((i) => i.plan_id === plan.id).map(({ id, date, is_done, notes }) => ({ id, date, is_done, notes })),
      topics: data.study_topics.filter((t) => ids.has(t.subject_id)).map(({ id, highlighted, studied, reviews, last_studied, final_pass, confidence, notes }) => ({ id, highlighted, studied, reviews, last_studied, final_pass, confidence, notes })),
      tests: data.study_tests.filter((t) => ids.has(t.subject_id)).map(({ id, score, best, attempts, last_done, notes }) => ({ id, score, best, attempts, last_done, notes })),
    }
    downloadText(`progreso_estudio_${toDateKey(new Date())}.json`, JSON.stringify(file, null, 1))
  }

  async function importJson(f: File) {
    setBusy(true)
    try {
      const file = JSON.parse(await f.text()) as ProgressFile
      if (file.app !== 'personal-hub' || file.kind !== 'study-progress') throw new Error('No es un archivo de progreso de estudio.')
      const changed = <T extends { id: string }>(cur: T[], incoming: Partial<T>[] | undefined) => {
        const byId = new Map(cur.map((r) => [r.id, r]))
        return (incoming ?? []).filter((r) => {
          const c = r.id ? byId.get(r.id) : undefined
          return c && Object.entries(r).some(([k, v]) => (c as Record<string, unknown>)[k] !== v)
        })
      }
      const items = changed(data.study_plan_items, file.items)
      const topics = changed(data.study_topics, file.topics)
      const tests = changed(data.study_tests, file.tests)
      for (const r of items) await update('study_plan_items', r.id!, r)
      for (const r of topics) await update('study_topics', r.id!, r)
      for (const r of tests) await update('study_tests', r.id!, r)
      toast('success', `Progreso importado: ${items.length + topics.length + tests.length} cambios`)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'No se ha podido leer el archivo')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <>
      <Button size="sm" onClick={exportJson} title="Guarda tareas marcadas, temas y notas de tests en un .json">
        <Download className="size-3.5" /> <span className="max-sm:sr-only">Exportar progreso</span>
      </Button>
      <Button size="sm" onClick={() => input.current?.click()} disabled={busy} title="Aplica un .json exportado desde otro dispositivo">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} <span className="max-sm:sr-only">Importar progreso</span>
      </Button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
    </>
  )
}

// ------------------------------------------------------------------ syllabus upload
type EditTopic = SyllabusTopic & { key: number }

export function SyllabusModal({ plan, program, onClose }: { plan: StudyPlan; program: StudyProgram; onClose: () => void }) {
  const { data, createMany, update, removeMany, uploadStudyFile } = useData()
  const toast = useToast()
  const today = toDateKey(new Date())
  const subjects = data.study_subjects.filter((s) => s.program_id === program.id)
  // Modules that still have no syllabus first.
  const pending = subjects.filter((s) => !data.study_topics.some((t) => t.subject_id === s.id && t.pages !== null))
  const [subjectId, setSubjectId] = useState((pending[0] ?? subjects[0])?.id ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [topics, setTopics] = useState<EditTopic[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [replanModule, setReplanModule] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const subject = subjects.find((s) => s.id === subjectId)

  async function read(f: File) {
    setFile(f)
    setError(null)
    setReading(true)
    try {
      const { numPages, text } = await readPdfStart(f)
      setTotal(numPages)
      const found = parseSyllabusIndex(text, numPages)
      setTopics(found.map((t, i) => ({ ...t, key: i })))
      if (!found.length) setError('No he encontrado el índice: añade los temas a mano (nombre y página de inicio).')
    } catch (e) {
      setError(e instanceof Error ? `No se ha podido leer el PDF: ${e.message}` : 'No se ha podido leer el PDF')
    } finally {
      setReading(false)
    }
  }

  const withPages = (list: EditTopic[]): EditTopic[] =>
    list.map((t, i) => {
      const next = list[i + 1]?.page ?? (total ? total + 1 : null)
      return { ...t, pages: t.page !== null && next !== null && next > t.page ? next - t.page : null }
    })
  const setTopic = (key: number, patch: Partial<EditTopic>) => setTopics((ts) => withPages(ts.map((t) => (t.key === key ? { ...t, ...patch } : t))))

  async function save() {
    if (!subject || !topics.length) return
    setSaving(true)
    try {
      // The PDF goes to Apuntes; if it can't be stored (offline, demo) the topics and the plan are still saved.
      if (file) await uploadStudyFile(subject.id, file, 'Temario').catch(() => false)
      // Topics: rename/update in order, add the missing ones, drop extra untouched ones.
      const existing = data.study_topics.filter((t) => t.subject_id === subject.id).sort((a, b) => a.position - b.position)
      const names = topics.map((t) => `${t.code} · ${t.name}`.trim())
      for (let i = 0; i < Math.min(existing.length, topics.length); i++) await update('study_topics', existing[i].id, { name: names[i], pages: topics[i].pages, position: i + 1 })
      const created =
        topics.length > existing.length
          ? ((await createMany(
              'study_topics',
              topics.slice(existing.length).map((t, j) => ({
                subject_id: subject.id, position: existing.length + j + 1, name: names[existing.length + j], pages: t.pages,
                highlighted: false, studied: false, reviews: 0, last_studied: null, final_pass: false, confidence: null, notes: '',
              })),
            )) ?? [])
          : []
      const extra = existing.slice(topics.length).filter((t) => !t.highlighted && !t.studied && t.reviews === 0)
      if (extra.length) await removeMany('study_topics', extra.map((t) => t.id), { silent: true })
      const finalTopics = [...existing.slice(0, topics.length).map((t, i) => ({ ...t, name: names[i], pages: topics[i].pages })), ...created]

      if (replanModule) {
        const items = data.study_plan_items.filter((i) => i.plan_id === plan.id)
        const drop = items.filter((i) => i.subject_id === subject.id && !i.is_done && i.date >= today && (i.origin === 'placeholder' || i.origin === 'module'))
        const dropIds = new Set(drop.map((i) => i.id))
        const load = new Map<string, number>()
        for (const i of items) if (!dropIds.has(i.id) && !i.is_done && i.kind !== 'goal') load.set(i.date, (load.get(i.date) ?? 0) + WEIGHT[i.kind])
        const info = dayInfo(data)
        const key = fold(subject.name).slice(0, 24)
        const classes = data.events.filter((e) => e.category === 'master' && !e.all_day && fold(e.title).includes(key)).map((e) => localDay(e.start_at))
        const rows = scheduleModule({
          planId: plan.id, subjectId: subject.id, label: subject.code || subject.name, classes, today, last: lastDay(plan), load, info,
          topics: finalTopics.map((t, i) => ({ id: t.id, name: `${topics[i].code} ${topics[i].name}`.slice(0, 80), pages: t.pages, tests: data.study_tests.filter((x) => x.topic_id === t.id).map((x) => ({ id: x.id, name: x.name, level: x.level })) })),
        })
        if (drop.length) await removeMany('study_plan_items', [...dropIds], { silent: true })
        if (rows.length) await createMany('study_plan_items', rows)
        // Intensive days of the last phase now name their topics.
        const intensive = items.filter((i) => i.subject_id === subject.id && i.origin === 'intensive').sort((a, b) => a.date.localeCompare(b.date))
        const groups = splitByPages(finalTopics, intensive.length)
        for (let g = 0; g < groups.length; g++) {
          const first = topics[finalTopics.indexOf(groups[g][0])]?.code ?? groups[g][0].name
          const last = topics[finalTopics.indexOf(groups[g].at(-1)!)]?.code ?? groups[g].at(-1)!.name
          await update('study_plan_items', intensive[g].id, { title: `${subject.code || subject.name} · memorización: ${first === last ? first : `${first} – ${last}`}` })
        }
        toast('success', `${subject.code || subject.name}: ${finalTopics.length} temas y ${rows.length} tareas nuevas en el planning`)
      } else toast('success', `${subject.code || subject.name}: ${finalTopics.length} temas guardados`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="📚 Subir nuevo resumen (PDF) y adaptar planning"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!topics.length || saving || reading}>
            {saving && <Loader2 className="size-4 animate-spin" />} Guardar {topics.length ? `${topics.length} temas` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Módulo">
          <select className="field" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {pending.includes(s) ? ' · sin temario' : ''}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted hover:border-accent">
          {reading ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
          {file ? (
            <span className="text-fg">
              {file.name}
              {total ? ` · ${total} páginas` : ''}
            </span>
          ) : (
            <span>Elige el PDF del resumen tal cual lo generas para imprimir</span>
          )}
          <input type="file" accept="application/pdf" hidden onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
        </label>
        {error && <p className="text-xs text-amber-700 dark:text-amber-400">{error}</p>}
        {(topics.length > 0 || file) && (
          <div>
            <span className="label">Temas detectados (puedes corregirlos)</span>
            <ul className="space-y-1.5">
              {topics.map((t) => (
                <li key={t.key} className="flex items-center gap-1.5">
                  <input className="field h-8 w-24 shrink-0 text-xs" value={t.code} onChange={(e) => setTopic(t.key, { code: e.target.value })} aria-label="Código" />
                  <input className="field h-8 min-w-0 flex-1 text-xs" value={t.name} onChange={(e) => setTopic(t.key, { name: e.target.value })} aria-label="Nombre del tema" />
                  <input
                    className="field num h-8 w-14 shrink-0 text-xs"
                    inputMode="numeric"
                    value={t.page ?? ''}
                    onChange={(e) => setTopic(t.key, { page: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })}
                    aria-label="Página de inicio"
                    title="Página de inicio"
                  />
                  <span className="num w-12 shrink-0 text-right text-[11px] text-muted">{t.pages ? `${t.pages} p.` : '—'}</span>
                  <Button size="icon" variant="danger" onClick={() => setTopics((ts) => withPages(ts.filter((x) => x.key !== t.key)))} aria-label="Quitar tema">
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button size="sm" className="mt-2" onClick={() => setTopics((ts) => withPages([...ts, { key: Date.now(), code: `Tema ${ts.length + 1}`, name: '', page: null, pages: null }]))}>
              <Plus className="size-3.5" /> Añadir tema
            </Button>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={replanModule} onChange={(e) => setReplanModule(e.target.checked)} />
          <span>
            Recalcular el día a día de este módulo
            <span className="block text-xs text-muted">Sustituye las tareas genéricas pendientes del módulo por subrayado, 1ª vuelta, tests y repasos de cada tema, repartidos según sus clases y sus páginas. Lo ya marcado no se toca.</span>
          </span>
        </label>
        <p className="text-xs text-muted">
          ¿Quieres guardarlo también en GitHub? <ExportSyllabusLink program={program} /> y añádelo al repositorio con un commit.
        </p>
      </div>
    </Modal>
  )
}

export function ExportSyllabusLink({ program }: { program: StudyProgram }) {
  const { data } = useData()
  return (
    <button
      type="button"
      className="underline"
      onClick={() => {
        const subjects = data.study_subjects.filter((s) => s.program_id === program.id)
        const out = {
          program: program.name,
          exported_at: new Date().toISOString(),
          subjects: subjects.map((s) => ({
            name: s.name,
            code: s.code,
            topics: data.study_topics.filter((t) => t.subject_id === s.id).sort((a, b) => a.position - b.position).map((t) => ({ name: t.name, pages: t.pages })),
          })),
        }
        downloadText('temario.json', JSON.stringify(out, null, 2))
      }}
    >
      Exporta el temario (.json)
    </button>
  )
}

// ------------------------------------------------------------------ PDF
export function PdfButton({ program }: { program: StudyProgram }) {
  const { data } = useData()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const today = toDateKey(new Date())
  const plans = data.study_plans.filter((p) => p.program_id === program.id)
  const plan = plans.find((p) => p.start_date <= today && today <= p.end_date) ?? plans.at(-1)
  if (!plan) return null

  async function run() {
    setBusy(true)
    try {
      const JsPDF = await loadJsPdf()
      const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      writePlanPdf(doc, data, plan!, program, today)
      doc.save('planning_estudio_master_ia.pdf')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'No se ha podido generar el PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="primary" onClick={run} disabled={busy} className="print-hide" title="Descargar Planning en PDF">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <span aria-hidden>📥</span>}
      <span className="max-sm:hidden">Descargar Planning en PDF</span>
      <span className="sm:hidden">PDF</span>
    </Button>
  )
}
