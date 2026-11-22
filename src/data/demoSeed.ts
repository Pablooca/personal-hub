import { addDays, combineDateTime, toDateKey } from '../lib/dates'
import { uid } from '../lib/format'
import type { CalendarEvent, Dataset, Project, ProjectTask, Transaction } from '../lib/types'

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
    created_at: now,
  })

  const events: CalendarEvent[] = [
    ev(0, '07:00', '08:00', 'Morning run — zone 2', 'training', '8 km easy pace', true),
    ev(0, '09:30', '10:00', 'Stand-up with platform team', 'work', 'Sprint 14 sync'),
    ev(0, '11:00', '13:00', 'Deep work: inference pipeline', 'research', 'Profile batching & quantisation'),
    ev(0, '16:00', '17:30', 'Lecture: Distributed Systems', 'master', 'Raft & consensus'),
    ev(0, '20:00', '20:30', 'Review weekly budget', 'personal'),
    ev(1, '08:00', '09:00', 'Gym — strength block', 'training'),
    ev(1, '10:00', '11:30', 'Design review: telemetry service', 'work'),
    ev(1, '15:00', '16:00', 'Supervisor meeting', 'research', 'Bring ablation results'),
    ev(2, '09:00', '12:00', 'Lab session: GPU cluster', 'master'),
    ev(2, '18:30', '20:00', 'Dinner with friends', 'personal'),
    ev(3, '07:00', '08:15', 'Interval training', 'training'),
    ev(3, '14:00', '15:00', 'Paper reading group', 'research', 'Mixture-of-Experts routing'),
    ev(4, '10:00', '11:00', 'Quarterly planning', 'work'),
    ev(4, '17:00', '19:00', 'Assignment 3 deadline prep', 'master'),
    ev(5, '10:00', '12:00', 'Long ride — 60 km', 'training'),
    ev(6, '11:00', '12:00', 'Call family', 'personal'),
    ev(8, '09:00', '17:00', 'Workshop: MLOps in production', 'work'),
    ev(10, '16:00', '17:00', 'Thesis checkpoint', 'master'),
    ev(13, '12:00', '13:00', 'Dentist', 'personal'),
    ev(-1, '09:30', '10:00', 'Stand-up with platform team', 'work', '', true),
    ev(-1, '17:00', '18:30', 'Seminar: Graph Neural Nets', 'master', '', true),
    ev(-2, '07:00', '08:00', 'Morning run', 'training', '', true),
    ev(-3, '15:00', '16:00', 'Experiment sweep kickoff', 'research', '', true),
    ev(-5, '10:00', '11:00', 'Retro', 'work', '', true),
    ev(-8, '19:00', '21:00', 'Climbing session', 'training', '', true),
  ]

  // -------------------------------------------------------------- projects
  const pj = (p: Omit<Project, 'id' | 'updated_at'>): Project => ({ ...p, id: uid(), updated_at: now })

  const projects: Project[] = [
    pj({
      title: 'Sparse attention benchmark',
      area: 'research',
      status: 'in_progress',
      progress: 62,
      priority: 'high',
      deadline: day(18),
      repo_url: 'https://github.com/example/sparse-attn-bench',
      notes: '## Hypothesis\nBlock-sparse kernels beat dense attention above 8k tokens.\n\n- [x] Baseline on A100\n- [ ] Ablate block size 64/128',
    }),
    pj({
      title: 'Personal Hub (Life OS)',
      area: 'engineering',
      status: 'in_progress',
      progress: 78,
      priority: 'medium',
      deadline: day(9),
      repo_url: 'https://github.com/example/personal-hub',
      notes: 'React + Supabase. RLS per user. Demo mode uses localStorage.',
    }),
    pj({
      title: 'Thesis — Chapter 2 draft',
      area: 'academic',
      status: 'review',
      progress: 90,
      priority: 'high',
      deadline: day(5),
      repo_url: null,
      notes: 'Waiting on supervisor feedback for section 2.3.',
    }),
    pj({
      title: 'Telemetry ingestion service',
      area: 'engineering',
      status: 'backlog',
      progress: 10,
      priority: 'medium',
      deadline: day(35),
      repo_url: null,
      notes: 'Evaluate ClickHouse vs TimescaleDB.',
    }),
    pj({
      title: 'Half-marathon plan',
      area: 'personal',
      status: 'in_progress',
      progress: 45,
      priority: 'low',
      deadline: day(52),
      repo_url: null,
      notes: '12-week plan. Target sub 1:45.',
    }),
    pj({
      title: 'Distributed Systems — Lab 2',
      area: 'academic',
      status: 'completed',
      progress: 100,
      priority: 'medium',
      deadline: day(-4),
      repo_url: 'https://github.com/example/ds-lab2',
      notes: 'Raft leader election + log replication.',
    }),
    pj({
      title: 'Read: Designing Data-Intensive Apps',
      area: 'personal',
      status: 'backlog',
      progress: 0,
      priority: 'low',
      deadline: null,
      repo_url: null,
      notes: '',
    }),
  ]

  const tk = (projectIdx: number, title: string, is_done: boolean): ProjectTask => ({
    id: uid(),
    project_id: projects[projectIdx].id,
    title,
    is_done,
    created_at: now,
  })

  const project_tasks: ProjectTask[] = [
    tk(0, 'Reproduce dense baseline', true),
    tk(0, 'Implement block-sparse kernel', true),
    tk(0, 'Run sweep over sequence lengths', false),
    tk(0, 'Write results section', false),
    tk(1, 'Schema + RLS policies', true),
    tk(1, 'Calendar month/week views', true),
    tk(1, 'Finance CSV export', true),
    tk(1, 'Deploy to Vercel', false),
    tk(2, 'Literature review', true),
    tk(2, 'Methodology section', true),
    tk(2, 'Address feedback', false),
    tk(3, 'Write ADR for storage engine', false),
    tk(4, 'Weeks 1–4 base building', true),
    tk(4, 'Weeks 5–8 tempo', false),
    tk(5, 'Leader election', true),
    tk(5, 'Log replication', true),
  ]

  // ---------------------------------------------------------- transactions
  const transactions: Transaction[] = []
  const tx = (date: string, type: Transaction['type'], category: string, concept: string, amount: number, account = 'checking') =>
    transactions.push({ id: uid(), date, type, category, concept, amount, account, created_at: now })

  // Six months of plausible synthetic history.
  for (let m = 0; m < 6; m++) {
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

    add(1, 'income', 'salary', 'Monthly salary', 2450)
    add(3, 'expense', 'housing', 'Rent', 780)
    add(4, 'expense', 'subscriptions', 'Cloud & streaming bundle', 24.99, 'credit')
    add(5, 'investment', 'index_fund', 'Global index fund — auto', 300, 'broker')
    add(6, 'expense', 'groceries', 'Supermarket', jitter(86.4))
    add(9, 'expense', 'transport', 'Metro pass', 40)
    add(11, 'expense', 'dining', 'Lunch with team', jitter(32.5), 'credit')
    add(13, 'expense', 'groceries', 'Supermarket', jitter(72.1))
    add(15, 'income', 'freelance', 'Consulting invoice', m % 2 === 0 ? 420 : 0)
    add(16, 'expense', 'health', 'Gym membership', 39.9)
    add(18, 'expense', 'education', 'Online course', m % 3 === 0 ? 59 : 0, 'credit')
    add(20, 'expense', 'groceries', 'Supermarket', jitter(64.3))
    add(22, 'expense', 'leisure', 'Concert tickets', m % 2 === 1 ? 55 : 0, 'credit')
    add(25, 'investment', 'pension', 'Pension plan', 100, 'broker')
    add(27, 'expense', 'dining', 'Dinner out', jitter(48))
  }

  return {
    events,
    projects,
    project_tasks,
    transactions: transactions.filter((t) => t.amount > 0),
  }
}
