import { Suspense, lazy, useState } from 'react'
import { useData } from '../state/data'
import { useNav } from '../state/nav'
import type { ManageTab } from '../views/finance/Manage'
import { EventModal } from './EventModal'
import { LogHoursModal, type LogDraft } from './LogHoursModal'
import { TaskModal } from './TaskModal'

const TxModal = lazy(() => import('../views/finance/TxForms').then((m) => ({ default: m.TxModal })))
const ManageModal = lazy(() => import('../views/finance/Manage').then((m) => ({ default: m.ManageModal })))
const RunModal = lazy(() => import('../views/running/Runs').then((m) => ({ default: m.RunModal })))
const BillModal = lazy(() => import('../views/finance/Extras').then((m) => ({ default: m.BillModal })))
const GoalModal = lazy(() => import('../views/running/GoalModal').then((m) => ({ default: m.GoalModal })))

/** Editors that can be opened from anywhere (search, calendar, overview). */
export function GlobalDialogs() {
  const { data } = useData()
  const { dialog: t, closeDialog, open } = useNav()
  const [log, setLog] = useState<LogDraft | null>(null)
  const [manage, setManage] = useState<ManageTab | null>(null)

  const event = t?.kind === 'event' ? data.events.find((x) => x.id === t.id) : undefined
  const task = t?.kind === 'task' ? data.project_tasks.find((x) => x.id === t.id) : undefined
  const worklog = t?.kind === 'worklog' ? data.work_logs.find((x) => x.id === t.id) : undefined
  const tx = t?.kind === 'tx' ? data.transactions.find((x) => x.id === t.id) : undefined
  const run = t?.kind === 'run' ? data.runs.find((x) => x.id === t.id) : undefined
  const session = t?.kind === 'session' ? data.run_plan.find((x) => x.id === t.id) : undefined
  const bill = t?.kind === 'bill' ? data.bills.find((x) => x.id === t.id) : undefined
  const goal = t?.kind === 'goal' ? data.race_goals.find((x) => x.id === t.id) : undefined
  const runGoal = session ? (data.race_goals.find((g) => g.id === session.goal_id) ?? null) : (data.race_goals[0] ?? null)

  return (
    <Suspense fallback={null}>
      {event && <EventModal draft={event} onClose={closeDialog} />}
      {task && <TaskModal key={task.id} task={task} onClose={closeDialog} onLogHours={(x) => setLog({ task_id: x.id })} onOpenProject={(id) => open({ kind: 'project', id })} />}
      {worklog && <LogHoursModal draft={worklog} onClose={closeDialog} />}
      <LogHoursModal draft={log} onClose={() => setLog(null)} />
      {tx && (
        <TxModal
          key={tx.id}
          tx={tx}
          onClose={closeDialog}
          onManage={(tab) => {
            closeDialog()
            setManage(tab)
          }}
        />
      )}
      {manage && <ManageModal tab={manage} onTab={setManage} onClose={() => setManage(null)} />}
      {(run || session) && <RunModal key={run?.id ?? session!.id} run={run ?? null} seed={session ? { session } : undefined} goal={runGoal} onClose={closeDialog} />}
      {bill && <BillModal bill={bill} onClose={closeDialog} />}
      {goal && <GoalModal goal={goal} onClose={closeDialog} onSaved={() => {}} />}
    </Suspense>
  )
}
