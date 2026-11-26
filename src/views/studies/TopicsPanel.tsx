import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ListChecks, MessageSquareWarning, Minus, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button, Card, Empty, ProgressBar, cx } from '../../components/ui'
import { toDateKey } from '../../lib/dates'
import { CONFIDENCE_LABELS, daysBetween, fmtRange, markReviewed, nextReview, topicProgress } from '../../lib/studyPlan'
import type { StudySubject, StudyTopic } from '../../lib/types'
import { useData } from '../../state/data'
import { TestChip, TestModal } from './TestsPanel'

/** Small on/off pill for a step of the topic. */
export function StepChip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex h-7 shrink-0 items-center rounded-md border px-2 text-[11px] font-medium transition pointer-coarse:h-8',
        on ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'border-line text-muted hover:border-line-strong hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

export function reviewLabel(t: StudyTopic, today: string): { text: string; tone: string } | null {
  if (t.final_pass) return { text: 'vuelta final hecha', tone: 'text-emerald-700 dark:text-emerald-400' }
  const next = nextReview(t)
  if (!next) return null
  const d = daysBetween(today, next)
  if (d < 0) return { text: `toca repasar (desde hace ${-d} ${d === -1 ? 'día' : 'días'})`, tone: 'text-rose-700 dark:text-rose-400' }
  if (d === 0) return { text: 'toca repasar hoy', tone: 'text-amber-700 dark:text-amber-400' }
  return { text: `próximo repaso ${fmtRange(next, next)}`, tone: 'text-muted' }
}

export function TopicsPanel({ subject }: { subject: StudySubject }) {
  const { data, createMany, update, remove } = useData()
  const today = toDateKey(new Date())
  const topics = useMemo(
    () => data.study_topics.filter((t) => t.subject_id === subject.id).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)),
    [data.study_topics, subject.id],
  )
  const p = topicProgress(topics, today)
  const [count, setCount] = useState('')
  const [name, setName] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [testId, setTestId] = useState<string | null>(null)
  const tests = data.study_tests.filter((t) => t.subject_id === subject.id)
  const openTest = tests.find((t) => t.id === testId)

  const nextPos = topics.reduce((m, t) => Math.max(m, t.position), 0) + 1
  const blank = { highlighted: false, studied: false, reviews: 0, last_studied: null, final_pass: false, confidence: null, notes: '', pages: null }

  async function add(e: FormEvent) {
    e.preventDefault()
    const n = Number(count)
    if (name.trim()) {
      await createMany('study_topics', [{ ...blank, subject_id: subject.id, position: nextPos, name: name.trim() }])
      setName('')
    } else if (Number.isInteger(n) && n > 0 && n <= 60) {
      const numbered = topics.filter((t) => /^Tema \d+$/.test(t.name)).length
      await createMany('study_topics', Array.from({ length: n }, (_, i) => ({ ...blank, subject_id: subject.id, position: nextPos + i, name: `Tema ${numbered + i + 1}` })))
      setCount('')
    }
  }

  const set = (t: StudyTopic, patch: Partial<StudyTopic>) => void update('study_topics', t.id, patch)

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <ListChecks className="size-4 text-faint" /> Temas y seguimiento
        </span>
      }
      action={topics.length > 0 && <span className="num text-xs text-muted">{p.percent}% · {p.studied}/{p.total} con 1ª vuelta</span>}
      bodyClass="p-0"
    >
      {topics.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-line px-4 py-3 text-[11px] sm:grid-cols-4">
          {(
            [
              ['Subrayado', p.highlighted],
              ['1ª vuelta', p.studied],
              ['Repasado', p.reviewed],
              ['Vuelta final', p.final],
            ] as const
          ).map(([label, n]) => (
            <div key={label}>
              <div className="flex justify-between text-muted">
                <span>{label}</span>
                <span className="num">
                  {n}/{p.total}
                </span>
              </div>
              <ProgressBar className="mt-1" value={(n / p.total) * 100} label={label} />
            </div>
          ))}
          {p.due > 0 && <p className="col-span-full text-rose-700 dark:text-rose-400">{p.due} {p.due === 1 ? 'tema toca' : 'temas tocan'} repasar ya.</p>}
        </div>
      )}

      {topics.length === 0 ? (
        <div className="p-4">
          <Empty icon={<ListChecks className="size-5" />}>Añade los temas para marcar el subrayado, la primera vuelta, los repasos y la vuelta final.</Empty>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {topics.map((t) => {
            const r = reviewLabel(t, today)
            return (
              <li key={t.id} className="px-4 py-2.5">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <input
                      key={t.name}
                      className="w-full truncate rounded bg-transparent text-sm font-medium outline-none focus:bg-surface-2 focus:px-1"
                      defaultValue={t.name}
                      aria-label="Nombre del tema"
                      maxLength={160}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v && v !== t.name) set(t, { name: v })
                        else e.target.value = t.name
                      }}
                    />
                    {r && <span className={cx('block text-[11px]', r.tone)}>{r.text}</span>}
                    {tests.some((x) => x.topic_id === t.id) && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {tests
                          .filter((x) => x.topic_id === t.id)
                          .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
                          .map((x) => (
                            <TestChip key={x.id} t={x} onOpen={(y) => setTestId(y.id)} />
                          ))}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StepChip on={t.highlighted} onClick={() => set(t, { highlighted: !t.highlighted })} title="Subrayado con los 4 colores">
                      Subrayado
                    </StepChip>
                    <StepChip
                      on={t.studied}
                      onClick={() => set(t, t.studied ? { studied: false, reviews: 0, last_studied: null } : { studied: true, last_studied: today })}
                      title="Primera vuelta completa"
                    >
                      1ª vuelta
                    </StepChip>
                    <span className="inline-flex h-7 items-center rounded-md border border-line pointer-coarse:h-8">
                      <button type="button" className="grid h-full w-6 place-items-center text-muted hover:text-fg disabled:opacity-30" disabled={t.reviews === 0} onClick={() => set(t, { reviews: t.reviews - 1 })} aria-label="Quitar un repaso">
                        <Minus className="size-3" />
                      </button>
                      <span className="num px-1 text-[11px]" title="Repasos espaciados">
                        {t.reviews} rep.
                      </span>
                      <button type="button" className="grid h-full w-6 place-items-center text-muted hover:text-fg" onClick={() => set(t, markReviewed(t, today))} aria-label="Repasado hoy" title="Repasado hoy">
                        <RotateCcw className="size-3" />
                      </button>
                    </span>
                    <StepChip on={t.final_pass} onClick={() => set(t, { final_pass: !t.final_pass })} title="Vuelta intensiva antes del examen">
                      Final
                    </StepChip>
                    <span className="inline-flex items-center gap-0.5" role="group" aria-label="Dominio">
                      {[1, 2, 3].map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={CONFIDENCE_LABELS[c]}
                          aria-label={`Dominio: ${CONFIDENCE_LABELS[c]}`}
                          aria-pressed={t.confidence === c}
                          onClick={() => set(t, { confidence: t.confidence === c ? null : c })}
                          className={cx(
                            'size-4 rounded-full border transition pointer-coarse:size-5',
                            t.confidence !== null && c <= t.confidence
                              ? t.confidence === 1
                                ? 'border-rose-500 bg-rose-500'
                                : t.confidence === 2
                                  ? 'border-amber-500 bg-amber-500'
                                  : 'border-emerald-500 bg-emerald-500'
                              : 'border-line-strong',
                          )}
                        />
                      ))}
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => setOpen(open === t.id ? null : t.id)} aria-label="Trampas de test y dudas" title="Trampas de test y dudas">
                      <MessageSquareWarning className={cx('size-3.5', t.notes && 'text-amber-600 dark:text-amber-400')} />
                    </Button>
                    <Button size="icon" variant="danger" onClick={() => remove('study_topics', t.id)} aria-label={`Eliminar ${t.name}`}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {open === t.id && (
                  <textarea
                    className="field mt-2 min-h-20 text-xs"
                    defaultValue={t.notes}
                    placeholder="Trampas de test, fórmulas que se confunden, dudas para clase…"
                    maxLength={4000}
                    onBlur={(e) => e.target.value !== t.notes && set(t, { notes: e.target.value })}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {openTest && <TestModal test={openTest} subject={subject} topics={topics} onClose={() => setTestId(null)} />}
      <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <input className="field h-9 min-w-0 flex-1 text-xs" placeholder="Nuevo tema (p. ej. Anexo A1 · Práctico)" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
        <span className="text-xs text-faint">o</span>
        <input className="field num h-9 w-16 text-xs" inputMode="numeric" placeholder="18" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} aria-label="Número de temas a crear" />
        <Button size="sm" type="submit" disabled={!name.trim() && !(Number(count) > 0)}>
          <Plus className="size-3.5" /> {name.trim() ? 'Añadir' : 'Crear temas'}
        </Button>
      </form>
    </Card>
  )
}
