import { addDays, combineDateTime, startOfWeek, toDateKey } from '../lib/dates'
import { holidayMap } from '../lib/holidays'
import { uid } from '../lib/format'
import type { Account, CalendarEvent, Category, Dataset, Project, ProjectTask, StudyAssessment, StudyFile, StudyProgram, StudySubject, Transaction, WorkLog } from '../lib/types'
import { buildDemoPokemon } from './demoPokemon'
import { buildDemoRunning } from './demoRunning'
import { defaultCategories } from '../lib/categories'

/**
 * Synthetic, fictional data for Demo Mode.
 * Everything is generated relative to "today" so the demo always looks alive.
 * No real personal data lives here.
 */
export function buildDemoDataset(today = new Date()): Dataset {
  const now = new Date().toISOString()
  const day = (offset: number) => toDateKey(addDays(today, offset))

  // ---------------------------------------------------------------- events
  const ev = (
    offset: number,
    start: string,
    end: string,
    title: string,
    category: CalendarEvent['category'],
    description = '',
    done = false,
  ): CalendarEvent => ({
    id: uid(),
    title,
    description,
    start_at: combineDateTime(day(offset), start),
    end_at: combineDateTime(day(offset), end),
    category,
    is_completed: done,
    all_day: false,
    series_id: null,
    created_at: now,
  })

  const events: CalendarEvent[] = [
    ev(0, '07:00', '08:00', 'Rodaje matinal — zona 2', 'training', '8 km a ritmo suave', true),
    ev(0, '09:30', '10:00', 'Daily con el equipo de plataforma', 'work', 'Sincronización sprint 14'),
    ev(0, '11:00', '13:00', 'Trabajo profundo: pipeline de inferencia', 'research', 'Perfilar batching y cuantización'),
    ev(0, '16:00', '17:30', 'Clase: Sistemas Distribuidos', 'master', 'Raft y consenso'),
    ev(0, '20:00', '20:30', 'Revisar presupuesto semanal', 'personal'),
    ev(1, '08:00', '09:00', 'Gimnasio — bloque de fuerza', 'training'),
    ev(1, '10:00', '11:30', 'Revisión de diseño: servicio de telemetría', 'work'),
    ev(1, '15:00', '16:00', 'Reunión con el director', 'research', 'Llevar resultados de la ablación'),
    ev(2, '09:00', '12:00', 'Laboratorio: clúster de GPUs', 'master'),
    ev(2, '18:30', '20:00', 'Cena con amigos', 'personal'),
    ev(3, '07:00', '08:15', 'Series en pista', 'training'),
    ev(3, '14:00', '15:00', 'Grupo de lectura de papers', 'research', 'Enrutado en Mixture-of-Experts'),
    ev(4, '10:00', '11:00', 'Planificación trimestral', 'work'),
    ev(4, '17:00', '19:00', 'Preparar entrega de la práctica 3', 'master'),
    ev(5, '10:00', '12:00', 'Salida larga en bici — 60 km', 'training'),
    ev(6, '11:00', '12:00', 'Llamar a la familia', 'personal'),
    ev(8, '09:00', '17:00', 'Taller: MLOps en producción', 'work'),
    ev(10, '16:00', '17:00', 'Revisión del TFM', 'master'),
    ev(13, '12:00', '13:00', 'Dentista', 'personal'),
    ev(-1, '09:30', '10:00', 'Daily con el equipo de plataforma', 'work', '', true),
    ev(-1, '17:00', '18:30', 'Seminario: Graph Neural Networks', 'master', '', true),
    ev(-2, '07:00', '08:00', 'Rodaje matinal', 'training', '', true),
    ev(-3, '15:00', '16:00', 'Lanzar barrido de experimentos', 'research', '', true),
    ev(-5, '10:00', '11:00', 'Retrospectiva', 'work', '', true),
    ev(-8, '19:00', '21:00', 'Sesión de escalada', 'training', '', true),
  ]

  // Work schedule as a series: Mon–Thu 8:00–17:30 for six weeks, skipping
  // Andalusian holidays (each skipped day gets a "Festivo" event instead).
  const hol = holidayMap('AN', [today.getFullYear(), today.getFullYear() + 1])
  // A few vacation days in four weeks' time (Tue–Fri); the work series skips them.
  const vacSeries = uid()
  const vacationKeys = new Set<string>()
  for (let i = 1; i <= 4; i++) {
    const key = toDateKey(addDays(startOfWeek(addDays(today, 28)), i))
    vacationKeys.add(key)
    events.push({
      id: uid(), title: 'Vacaciones', description: '', start_at: combineDateTime(key, '00:00'), end_at: combineDateTime(key, '23:59'),
      category: 'vacation', is_completed: false, all_day: true, series_id: vacSeries, created_at: now,
    })
  }
  const workSeries = uid()
  for (let d = startOfWeek(today), i = 0; i < 42; i++, d = addDays(d, 1)) {
    if (![1, 2, 3, 4].includes(d.getDay())) continue
    const key = toDateKey(d)
    if (vacationKeys.has(key)) continue
    const h = hol.get(key)
    if (h) {
      events.push({
        id: uid(), title: `Festivo: ${h.map((x) => x.name).join(' · ')}`, description: '',
        start_at: combineDateTime(key, '00:00'), end_at: combineDateTime(key, '23:59'),
        category: 'holiday', is_completed: false, all_day: true, series_id: null, created_at: now,
      })
      continue
    }
    events.push({
      id: uid(), title: 'Jornada laboral', description: '', start_at: combineDateTime(key, '08:00'), end_at: combineDateTime(key, '17:30'),
      category: 'work', is_completed: d < today, all_day: false, series_id: workSeries, created_at: now,
    })
  }
  // -------------------------------------------------------------- projects
  const pj = (p: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'description' | 'start_date'> & Partial<Pick<Project, 'description' | 'start_date'>>): Project => ({
    description: '',
    start_date: null,
    ...p,
    id: uid(),
    created_at: now,
    updated_at: now,
  })

  const projects: Project[] = [
    pj({
      title: 'Benchmark de atención dispersa',
      description: 'Comparar kernels de atención block-sparse frente a atención densa con distintas longitudes de secuencia y GPUs, y publicar los resultados en un workshop.',
      start_date: day(-40),
      area: 'research',
      status: 'in_progress',
      progress: 62,
      priority: 'high',
      deadline: day(18),
      repo_url: 'https://github.com/example/sparse-attn-bench',
      notes: '## Hipótesis\nLos kernels block-sparse superan a la atención densa a partir de 8k tokens.\n\n- [x] Baseline en A100\n- [ ] Ablación tamaño de bloque 64/128',
    }),
    pj({
      title: 'Personal Hub (Life OS)',
      description: 'Centro de mando privado para agenda, proyectos y finanzas. También sirve como pieza de portfolio full-stack con Supabase y RLS.',
      start_date: day(-21),
      area: 'engineering',
      status: 'in_progress',
      progress: 78,
      priority: 'medium',
      deadline: day(9),
      repo_url: 'https://github.com/example/personal-hub',
      notes: 'React + Supabase. RLS por usuario. El modo demo usa localStorage.',
    }),
    pj({
      title: 'TFM — Borrador del capítulo 2',
      description: 'Estado del arte para el TFM: transformers eficientes, dispersión y diseño consciente del hardware.',
      start_date: day(-60),
      area: 'academic',
      status: 'review',
      progress: 90,
      priority: 'high',
      deadline: day(5),
      repo_url: null,
      notes: 'Pendiente del feedback del director para la sección 2.3.',
    }),
    pj({
      title: 'Servicio de ingesta de telemetría',
      description: 'Servicio para ingerir, almacenar y consultar telemetría de dispositivos a ~50k eventos/s.',
      start_date: day(7),
      area: 'engineering',
      status: 'backlog',
      progress: 10,
      priority: 'medium',
      deadline: day(35),
      repo_url: null,
      notes: 'Evaluar ClickHouse frente a TimescaleDB.',
    }),
    pj({
      title: 'Plan de media maratón',
      description: 'Bloque de doce semanas para una media maratón en primavera.',
      start_date: day(-32),
      area: 'personal',
      status: 'in_progress',
      progress: 45,
      priority: 'low',
      deadline: day(52),
      repo_url: null,
      notes: 'Plan de 12 semanas. Objetivo: bajar de 1:45.',
    }),
    pj({
      title: 'Sistemas Distribuidos — Práctica 2',
      description: 'Implementar elección de líder y replicación de log de Raft en Go.',
      start_date: day(-25),
      area: 'academic',
      status: 'completed',
      progress: 100,
      priority: 'medium',
      deadline: day(-4),
      repo_url: 'https://github.com/example/ds-lab2',
      notes: 'Elección de líder + replicación de log en Raft.',
    }),
    pj({
      title: 'Leer: Designing Data-Intensive Applications',
      area: 'personal',
      status: 'backlog',
      progress: 0,
      priority: 'low',
      deadline: null,
      repo_url: null,
      notes: '',
    }),
  ]

  // Open tasks get a staggered start/end and a rotating priority so the demo shows dates on cards.
  let taskN = 0
  const taskExtras = (status: ProjectTask['status']): Pick<ProjectTask, 'description' | 'priority' | 'start_date' | 'due_date' | 'recurrence'> => {
    const n = taskN++
    if (status === 'done') return { description: '', priority: 'medium', start_date: day(-20 - n), due_date: day(-5 - n), recurrence: null }
    return {
      description: '',
      priority: (['high', 'medium', 'low'] as const)[n % 3],
      start_date: day(-3 + (n % 4)),
      due_date: day(n === 4 ? 0 : 2 + ((n * 3) % 14)),
      recurrence: n === 6 ? 'weekly' : null,
    }
  }

  const tk = (projectIdx: number, title: string, done: boolean | ProjectTask['status']): ProjectTask => {
    const status = done === true ? 'done' : done === false ? 'todo' : done
    return { id: uid(), project_id: projects[projectIdx].id, category: null, title, status, is_done: status === 'done', jira_key: null, ...taskExtras(status), created_at: now }
  }

  // Day-job backlog: standalone "Trabajo" tasks with (fictional) Jira keys.
  const wk = (title: string, status: ProjectTask['status'], jira: string | null, category: 'work' | 'personal' = 'work'): ProjectTask => ({
    id: uid(),
    project_id: null,
    category,
    title,
    status,
    is_done: status === 'done',
    jira_key: jira,
    ...taskExtras(status),
    created_at: now,
  })

  const project_tasks: ProjectTask[] = [
    tk(0, 'Reproducir baseline densa', true),
    tk(0, 'Implementar kernel block-sparse', true),
    tk(0, 'Barrido de longitudes de secuencia', 'in_progress'),
    tk(0, 'Redactar sección de resultados', false),
    tk(1, 'Esquema + políticas RLS', true),
    tk(1, 'Vistas de mes/semana del calendario', true),
    tk(1, 'Exportación CSV de finanzas', true),
    tk(1, 'Desplegar en Vercel', 'review'),
    tk(2, 'Revisión bibliográfica', true),
    tk(2, 'Sección de metodología', true),
    tk(2, 'Aplicar correcciones', 'in_progress'),
    tk(3, 'Escribir ADR del motor de almacenamiento', false),
    tk(4, 'Semanas 1–4: base aeróbica', true),
    tk(4, 'Semanas 5–8: tempo', 'in_progress'),
    tk(5, 'Elección de líder', true),
    tk(5, 'Replicación de log', true),
    tk(3, 'Prototipo de ingesta con Kafka', false),
    tk(6, 'Leer capítulos 1–3', false),
    tk(1, 'Webhook de Apple Pay', 'in_progress'),
    wk('Migrar endpoints de facturación a v2', 'in_progress', 'PLAT-142'),
    wk('Corregir timeout en el job de conciliación', 'review', 'PLAT-151'),
    wk('Dashboard de latencias en Grafana', 'todo', 'OBS-37'),
    wk('Revisar PR de autenticación SSO', 'todo', 'PLAT-158'),
    wk('Documentar runbook de incidentes', 'todo', 'OPS-12'),
    wk('Spike: evaluar colas con SQS', 'done', 'PLAT-133'),
    wk('Renovar DNI', 'todo', null, 'personal'),
  ]

  // Work diary for the last weeks (weekdays only, a few days deliberately missing).
  const byKey = new Map(project_tasks.filter((t) => t.jira_key).map((t) => [t.jira_key!, t.id]))
  const work_logs: WorkLog[] = []
  const plan: [string, number, string][][] = [
    [['PLAT-142', 5, 'Migración de endpoints de facturación'], ['MEET', 1, 'Daily + refinamiento'], ['PLAT-151', 2, 'Análisis del timeout de conciliación']],
    [['PLAT-142', 6, 'Tests de integración de facturación v2'], ['MEET', 2, 'Planning del sprint']],
    [['PLAT-151', 4, 'Fix del timeout y PR'], ['PLAT-158', 2, 'Revisión PR SSO'], ['MEET', 1.5, 'Daily + 1:1']],
    [['PLAT-133', 6, 'Spike SQS: pruebas de rendimiento'], ['MEET', 1, 'Daily']],
    [['OBS-37', 3, 'Paneles de latencia p95/p99'], ['PLAT-142', 4, 'Feedback de la revisión'], ['MEET', 1, 'Daily']],
  ]
  for (let back = 1, n = 0; back <= 24; back++) {
    const d = addDays(today, -back)
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue
    n++
    if (n === 4 || n === 9) continue // forgotten days → highlighted as "sin registrar"
    for (const [key, hours, description] of plan[n % plan.length]) {
      work_logs.push({
        id: uid(),
        date: toDateKey(d),
        hours,
        description,
        jira_key: key === 'MEET' ? 'PLAT-1' : key,
        task_id: byKey.get(key) ?? null,
        created_at: now,
      })
    }
  }

  // ---------------------------------------------------------- transactions
  const transactions: Transaction[] = []
  const tx = (date: string, type: Transaction['type'], category: string, concept: string, amount: number, account = 'Cuenta nómina') =>
    transactions.push({ id: uid(), date, type, category, concept, amount, account, created_at: now })

  // Synthetic history from January (at least six months).
  const months = Math.max(6, today.getMonth() + 1)
  for (let m = 0; m < months; m++) {
    const base = new Date(today.getFullYear(), today.getMonth() - m, 1)
    const d = (dayOfMonth: number) => {
      const x = new Date(base.getFullYear(), base.getMonth(), dayOfMonth)
      return x > today ? null : toDateKey(x)
    }
    const add = (dom: number, type: Transaction['type'], category: string, concept: string, amount: number, account?: string) => {
      const date = d(dom)
      if (date) tx(date, type, category, concept, amount, account)
    }
    const jitter = (n: number) => Math.round(n * (0.85 + ((m * 37 + n) % 30) / 100) * 100) / 100

    add(1, 'income', 'salary', 'Nómina mensual', 2450)
    add(3, 'expense', 'housing', 'Alquiler', 780)
    add(4, 'expense', 'subscriptions', 'Pack cloud y streaming', 24.99, 'Tarjeta de crédito')
    add(5, 'investment', 'savings', 'Aportación mensual a ahorro', 300, 'Cuenta ahorro')
    add(6, 'expense', 'groceries', 'Supermercado', jitter(86.4))
    add(9, 'expense', 'transport', 'Abono transporte', 40)
    add(11, 'expense', 'dining', 'Comida con el equipo', jitter(32.5), 'Tarjeta de crédito')
    add(13, 'expense', 'groceries', 'Supermercado', jitter(72.1))
    add(15, 'income', 'freelance', 'Factura consultoría', m % 2 === 0 ? 420 : 0)
    add(16, 'expense', 'health', 'Cuota del gimnasio', 39.9)
    add(18, 'expense', 'education', 'Curso online', m % 3 === 0 ? 59 : 0, 'Tarjeta de crédito')
    add(20, 'expense', 'groceries', 'Supermercado', jitter(64.3))
    add(22, 'expense', 'leisure', 'Entradas concierto', m % 2 === 1 ? 55 : 0, 'Tarjeta de crédito')
    add(25, 'investment', 'pension', 'Plan de pensiones', 100, 'Cuenta ahorro')
    add(27, 'expense', 'dining', 'Cena fuera', jitter(48))
  }

  // Opening balances on 31 Dec of last year — the recommended way to bring in history.
  const opening = `${today.getFullYear() - 1}-12-31`
  tx(opening, 'income', 'opening_balance', 'Saldo inicial', 1840.25, 'Cuenta nómina')
  tx(opening, 'income', 'opening_balance', 'Saldo inicial', 6200, 'Cuenta ahorro')
  // Two card payments that arrived via the Apple Pay automation and still need a category.
  tx(day(0), 'expense', 'uncategorized', 'CAFETERIA LA PLAZA', 4.8, 'Tarjeta de crédito')
  tx(day(-1), 'expense', 'uncategorized', 'PARKING CENTRO', 6.5, 'Cuenta nómina')

  const accounts: Account[] = [
    { id: uid(), name: 'Cuenta nómina', kind: 'checking', color: 'sky', is_primary: true, created_at: now },
    { id: uid(), name: 'Cuenta ahorro', kind: 'savings', color: 'emerald', is_primary: false, created_at: now },
    { id: uid(), name: 'Tarjeta de crédito', kind: 'credit', color: 'violet', is_primary: false, created_at: now },
  ]

  const categories: Category[] = defaultCategories().map((c) => ({ ...c, id: uid(), created_at: now, budget: c.type === 'expense' ? (c.name === 'groceries' ? 250 : c.name === 'dining' ? 120 : c.name === 'transport' ? 45 : null) : null }))

  // ---------------------------------------------------------------- studies
  const program: StudyProgram = {
    id: uid(), name: 'Máster en Ingeniería Informática', institution: 'Universidad de ejemplo',
    academic_year: `${today.getFullYear()}/${today.getFullYear() + 1}`, total_credits: 60, created_at: now,
  }
  const subject = (name: string, credits: number, semester: string, color: StudySubject['color'], extra: Partial<StudySubject> = {}): StudySubject => ({
    id: uid(), program_id: program.id, name, code: '', credits, semester, professor: '', color,
    status: 'in_progress', final_grade: null, target_grade: 5, created_at: now, ...extra,
  })
  const study_subjects: StudySubject[] = [
    subject('Sistemas Distribuidos', 6, '1º cuatrimestre', 'violet'),
    subject('Aprendizaje Automático Avanzado', 6, '1º cuatrimestre', 'emerald', { target_grade: 7 }),
    subject('Seguridad en Redes', 4.5, '1º cuatrimestre', 'rose', { status: 'passed', final_grade: 8.4 }),
    subject('Trabajo Fin de Máster', 12, '2º cuatrimestre', 'amber'),
  ]
  const as = (si: number, name: string, weight: number, grade: number | null, dueOffset: number | null = null): StudyAssessment => ({
    id: uid(), subject_id: study_subjects[si].id, name, weight, grade,
    kind: /examen|defensa/i.test(name) ? 'exam' : 'delivery',
    due_at: dueOffset === null ? null : combineDateTime(day(dueOffset), /examen|defensa/i.test(name) ? '09:00' : '23:59'),
    is_done: grade !== null || (dueOffset !== null && dueOffset < 0), created_at: now,
  })
  const study_assessments: StudyAssessment[] = [
    as(0, 'Práctica 1 · Relojes lógicos', 15, 8.5, -40),
    as(0, 'Práctica 2 · Raft', 25, 9, -4),
    as(0, 'Examen final', 60, null, 24),
    as(1, 'Proyecto Kaggle', 40, 7.2, -10),
    as(1, 'Presentación paper', 20, null, 9),
    as(1, 'Examen final', 40, null, 30),
    as(2, 'Laboratorio', 50, 8, -60),
    as(2, 'Examen', 50, 8.8, -30),
    as(3, 'Memoria', 70, null, 200),
    as(3, 'Defensa', 30, null, 215),
  ]
  // File rows only: Demo Mode has no storage, so opening them shows a notice.
  const study_files: StudyFile[] = [
    { id: uid(), subject_id: study_subjects[0].id, name: 'Tema 1 - Tiempo y relojes', topic: 'Tema 1', storage_path: 'demo/1.pdf', size_bytes: 654_336, created_at: now },
    { id: uid(), subject_id: study_subjects[0].id, name: 'Tema 2 - Consenso', topic: 'Tema 2', storage_path: 'demo/2.pdf', size_bytes: 1_182_310, created_at: now },
    { id: uid(), subject_id: study_subjects[1].id, name: 'Apuntes completos', topic: '', storage_path: 'demo/3.pdf', size_bytes: 2_831_155, created_at: now },
  ]

  return {
    events,
    projects,
    project_tasks,
    transactions: transactions.filter((t) => t.amount > 0),
    categories,
    accounts,
    work_logs,
    study_programs: [program],
    study_subjects,
    study_assessments,
    study_files,
    category_rules: [{ id: uid(), pattern: 'mercado', type: 'expense', category: 'groceries', created_at: now }],
    bills: [{ id: uid(), name: 'Música en streaming', amount: 10.99, category: 'subscriptions', account: 'Cuenta nómina', period: 'monthly', anchor_date: day(-27), notify_days: 1, active: true, created_at: now }],
    ...buildDemoPokemon(today),
    ...buildDemoRunning(today),
  }
}
