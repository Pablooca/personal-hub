/**
 * The plan as a real-text PDF: day by day (with check boxes) and the test inventory.
 * jsPDF's built-in fonts only cover Latin-1, so a few symbols are swapped for plain text.
 */
import type { JsPdf } from '../../lib/cdn'
import { LEVEL_LABELS, PLAN_KIND_LABELS, addDaysKey, byDay, fmtDay, fmtRange, planWeeks, testStats } from '../../lib/studyPlan'
import { fmtGrade } from '../../lib/studies'
import type { Dataset, StudyPlan, StudyProgram } from '../../lib/types'

const SAFE: Record<string, string> = { '≤': '<=', '≥': '>=', '→': '->', '←': '<-', '✓': 'OK', '…': '...', '—': '-', '–': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '•': '·' }
/** Keep only what Helvetica (WinAnsi) can print. */
export const pdfSafe = (s: string) =>
  s
    .replace(/[≤≥→←✓…—–“”‘’•]/g, (c) => SAFE[c])
    .replace(/[^\u0000-ÿ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

const GREY = [110, 110, 110] as const
const KIND_RGB: Record<string, [number, number, number]> = {
  goal: [3, 105, 161], study: [67, 56, 202], test: [162, 28, 175], review: [109, 40, 217], mock: [190, 18, 60], buffer: [4, 120, 87], rest: [120, 120, 120], milestone: [180, 83, 9],
}

export function writePlanPdf(doc: JsPdf, d: Dataset, plan: StudyPlan, program: StudyProgram, today: string) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const bottom = H - 14
  let y = M
  const subjects = d.study_subjects.filter((s) => s.program_id === program.id)
  const sub = new Map(subjects.map((s) => [s.id, s]))
  const items = d.study_plan_items.filter((i) => i.plan_id === plan.id)
  const days = new Map(byDay(items))
  const { weeks } = planWeeks(plan, items)
  const room = (h: number) => {
    if (y + h > bottom) {
      doc.addPage()
      y = M
    }
  }
  const box = (x: number, yy: number, done: boolean) => {
    doc.setDrawColor(90).setLineWidth(0.25).rect(x, yy - 2.6, 2.8, 2.8)
    if (done) {
      doc.setLineWidth(0.45).line(x + 0.5, yy - 1.2, x + 1.2, yy - 0.4).line(x + 1.2, yy - 0.4, x + 2.4, yy - 2.2)
    }
  }

  doc.setProperties({ title: pdfSafe(plan.name), subject: pdfSafe(program.name), creator: 'Personal Hub' })
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(17)
  doc.text(pdfSafe(plan.name), M, y + 5)
  y += 10
  const done = items.filter((i) => i.is_done).length
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GREY)
  doc.text(pdfSafe(`${program.name} · ${fmtRange(plan.start_date, plan.end_date)}${plan.exam_date ? ` · examen ${fmtRange(plan.exam_date, plan.exam_date)}` : ''} · ${done}/${items.length} tareas hechas · generado el ${fmtDay(today)}`), M, y)
  y += 6
  doc.setFontSize(8.5).setTextColor(40)
  for (const p of plan.phases) {
    const lines = doc.splitTextToSize(pdfSafe(`${p.name} (${fmtRange(p.start, p.end)}): ${p.goal}`), W - 2 * M)
    room(lines.length * 3.8)
    doc.text(lines, M, y)
    y += lines.length * 3.8 + 0.6
  }

  const dateW = 22
  const textX = M + dateW + 5
  const textW = W - textX - M
  for (const w of weeks) {
    room(16)
    y += 3
    doc.setFillColor(238, 240, 244).rect(M, y - 4.2, W - 2 * M, 6, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(17)
    doc.text(pdfSafe(`Semana ${w.index} · ${fmtRange(w.start, w.end)}`), M + 1.5, y)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GREY)
    doc.text(`${w.done}/${w.total}`, W - M - 1.5, y, { align: 'right' })
    y += 5
    doc.setFontSize(8.5)
    for (const g of w.goals) {
      const lines = doc.splitTextToSize(pdfSafe(`Objetivo: ${g.title}`), W - 2 * M - 6)
      room(lines.length * 3.7)
      box(M + 1, y, g.is_done)
      doc.setTextColor(...KIND_RGB.goal).text(lines, M + 5, y)
      y += lines.length * 3.7
    }
    for (let day = w.start; day <= w.end; day = addDaysKey(day, 1)) {
      const list = days.get(day) ?? []
      const rows = list.map((i) => {
        const s = i.subject_id ? sub.get(i.subject_id) : undefined
        const label = PLAN_KIND_LABELS[i.kind]
        const head = i.title.toLowerCase().startsWith(label.split(' ')[0].toLowerCase()) ? '' : `${label}: `
        return { i, lines: doc.splitTextToSize(pdfSafe(`${head}${i.title}${s ? ` · ${s.code || s.name}` : ''}`), textW) }
      })
      const h = Math.max(4, rows.reduce((a, r) => a + r.lines.length * 3.6, 0)) + 1.5
      room(Math.min(h, 40))
      y += 1
      doc.setDrawColor(215).setLineWidth(0.2).line(M, y - 3.4, W - M, y - 3.4)
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(day === today ? 3 : 30, day === today ? 105 : 30, day === today ? 161 : 30)
      doc.text(pdfSafe(fmtDay(day)), M, y)
      doc.setFont('helvetica', 'normal')
      if (!rows.length) {
        doc.setTextColor(160).text('-', textX, y)
        y += 3.6
      }
      for (const { i, lines } of rows) {
        room(lines.length * 3.6)
        box(textX - 4.2, y, i.is_done)
        const [r, g, b] = i.is_done ? [150, 150, 150] : KIND_RGB[i.kind]
        doc.setTextColor(r, g, b).text(lines, textX, y)
        y += lines.length * 3.6
      }
    }
  }

  // ------------------------------------------------------------ inventory
  doc.addPage()
  y = M
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(17).text('Inventario de tests', M, y + 4)
  y += 11
  for (const s of subjects) {
    const tests = d.study_tests.filter((t) => t.subject_id === s.id).sort((a, b) => a.position - b.position)
    const st = testStats(tests)
    room(12)
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(17).text(pdfSafe(s.name), M, y)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GREY)
    doc.text(pdfSafe(tests.length ? `${st.passed}/${st.total} aprobados · media ${fmtGrade(st.average)}` : 'sin tests todavía'), W - M, y, { align: 'right' })
    y += 5
    if (!tests.length) continue
    const topics = d.study_topics.filter((t) => t.subject_id === s.id).sort((a, b) => a.position - b.position)
    const levels = [...new Set(tests.filter((t) => t.kind === 'topic').map((t) => t.level ?? 0))].sort()
    const colW = 17
    const nameW = W - 2 * M - 20 - levels.length * colW
    const cell = (t: (typeof tests)[number] | undefined, x: number) => {
      if (!t) return
      if (t.score !== null) doc.setFont('helvetica', 'bold').setTextColor(t.score >= 5 ? 4 : 190, t.score >= 5 ? 120 : 18, t.score >= 5 ? 87 : 60).text(fmtGrade(t.score), x, y, { align: 'center' })
      else box(x - 1.4, y, t.attempts > 0)
      doc.setFont('helvetica', 'normal')
    }
    if (levels.length) {
      doc.setFillColor(238, 240, 244).rect(M, y - 3.6, W - 2 * M, 5, 'F')
      doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(60)
      doc.text('Tema', M + 1, y)
      doc.text('Estudio', M + nameW + 10, y, { align: 'center' })
      levels.forEach((l, k) => doc.text(`N${l} ${LEVEL_LABELS[l] ?? ''}`, M + nameW + 20 + k * colW + colW / 2, y, { align: 'center' }))
      y += 4.5
      doc.setFont('helvetica', 'normal').setFontSize(8)
      for (const t of topics) {
        const mine = tests.filter((x) => x.topic_id === t.id)
        if (!mine.length) continue
        const lines = doc.splitTextToSize(pdfSafe(t.name), nameW - 2)
        room(lines.length * 3.5 + 1)
        doc.setTextColor(30).text(lines, M + 1, y)
        const stage = t.final_pass ? 'final' : t.reviews ? `${t.reviews} rep.` : t.studied ? '1a vuelta' : t.highlighted ? 'subrayado' : '-'
        doc.setTextColor(...GREY).text(stage, M + nameW + 10, y, { align: 'center' })
        levels.forEach((l, k) => cell(mine.find((x) => (x.level ?? 0) === l), M + nameW + 20 + k * colW + colW / 2))
        y += lines.length * 3.5 + 1
        doc.setDrawColor(225).setLineWidth(0.15).line(M, y - 2.6, W - M, y - 2.6)
      }
    }
    const loose = tests.filter((t) => t.kind !== 'topic' || !t.topic_id)
    for (const t of loose) {
      room(4)
      if (t.score !== null) doc.setFont('helvetica', 'bold').setTextColor(t.score >= 5 ? 4 : 190, t.score >= 5 ? 120 : 18, t.score >= 5 ? 87 : 60).text(fmtGrade(t.score), M + 1, y)
      else box(M + 1, y, t.attempts > 0)
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(30).text(pdfSafe(`${t.name}${t.minutes ? ` · ${t.minutes} min` : ''}${t.questions ? ` · ${t.questions} preguntas` : ''}`), M + 9, y)
      y += 4
    }
    y += 4
  }

  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(150)
    doc.text(pdfSafe(`${plan.name} · página ${i} de ${n}`), W / 2, H - 7, { align: 'center' })
  }
}
