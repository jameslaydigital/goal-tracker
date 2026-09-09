import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import {
  applyProgram,
  currentWorkouts,
  deleteProgram,
  overrideProgramWithCurrent,
  renameProgram,
  todayStamp,
} from '../programs'
import { ConfirmDialog, PromptDialog } from '../components/dialogs'

type Action = 'apply' | 'override' | 'rename' | 'delete' | null

export default function ProgramDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const program = useLiveQuery(() => (id ? db.programs.get(id) : undefined), [id])
  const [action, setAction] = useState<Action>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [activeCount, setActiveCount] = useState<number | null>(null)

  if (!program) {
    return (
      <div className="min-h-dvh bg-surface-950 flex flex-col p-6">
        <Link to="/programs" className="text-surface-400 mb-6">
          &larr; Programs
        </Link>
        <p className="text-surface-500 text-center mt-12">
          {id ? 'Program not found.' : 'Loading…'}
        </p>
      </div>
    )
  }
  const prog = program

  const openAction = async (a: Exclude<Action, null>) => {
    setStatus(null)
    setAction(a)
    if (a === 'apply' || a === 'override') {
      setActiveCount((await currentWorkouts()).length)
    }
  }

  const doApply = async () => {
    const backup = await applyProgram(prog)
    setStatus({
      ok: true,
      text: backup
        ? `Applied "${prog.name}". Your previous workouts were saved as "${backup}".`
        : `Applied "${prog.name}".`,
    })
  }

  const doOverride = async () => {
    await overrideProgramWithCurrent(prog)
    setStatus({ ok: true, text: 'This program now holds your current workouts.' })
  }

  const doDelete = async () => {
    await deleteProgram(prog.id)
    navigate('/programs')
  }

  return (
    <div className="min-h-dvh bg-surface-950 flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <Link to="/programs" className="text-surface-400 hover:text-surface-200 transition-colors">
          &larr; Programs
        </Link>
        <div className="w-12" />
      </div>

      <h1 className="text-2xl font-bold text-surface-50">{prog.name}</h1>
      <p className="text-surface-400 text-sm mt-1">
        {prog.workouts.length} workout{prog.workouts.length !== 1 ? 's' : ''} · saved{' '}
        {new Date(prog.createdAt).toLocaleDateString()}
      </p>

      <div className="flex flex-col gap-2 mt-6">
        {prog.workouts.length === 0 ? (
          <p className="text-surface-500 text-sm">This program has no workouts yet.</p>
        ) : (
          prog.workouts.map((w, i) => (
            <div key={w.id ?? i} className="bg-surface-800 rounded-xl p-4">
              <h3 className="text-surface-50 font-semibold">{w.name}</h3>
              <p className="text-surface-400 text-xs mt-0.5">
                {w.exercises.length} exercise{w.exercises.length !== 1 ? 's' : ''}
              </p>
            </div>
          ))
        )}
      </div>

      {status && (
        <p className={`text-sm mt-4 text-center ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {status.text}
        </p>
      )}

      <div className="flex flex-col gap-3 mt-6">
        <button
          onClick={() => void openAction('apply')}
          className="w-full py-4 px-6 rounded-xl bg-blue-600 text-white text-lg font-semibold active:bg-blue-500 transition-colors"
        >
          Apply to My Workouts
        </button>
        <button
          onClick={() => void openAction('override')}
          className="w-full py-3 px-6 rounded-xl bg-surface-800 text-surface-100 text-sm font-medium active:bg-surface-700 transition-colors"
        >
          Save my current workouts here
        </button>
        <button
          onClick={() => void openAction('rename')}
          className="w-full py-3 px-6 rounded-xl bg-surface-800 text-surface-100 text-sm font-medium active:bg-surface-700 transition-colors"
        >
          Rename program
        </button>
        <button
          onClick={() => void openAction('delete')}
          className="w-full py-3 px-6 rounded-xl border border-red-900 text-red-400 text-sm font-medium active:bg-red-950 transition-colors"
        >
          Delete program
        </button>
      </div>

      {action === 'rename' && (
        <PromptDialog
          title="Rename program"
          defaultValue={prog.name}
          submitLabel="Rename"
          onClose={() => setAction(null)}
          onSubmit={(name) => renameProgram(prog.id, name)}
        />
      )}

      {action === 'apply' && (
        <ConfirmDialog
          title={`Apply "${prog.name}"?`}
          message={
            activeCount !== null && activeCount > 0
              ? `Your ${activeCount} current workout${activeCount !== 1 ? 's' : ''} will be saved as a backup named "${todayStamp()}" and this program's workouts will become your active workouts.`
              : 'You have no active workouts, so this program will simply become your active workouts.'
          }
          confirmLabel="Apply"
          onClose={() => setAction(null)}
          onConfirm={doApply}
        />
      )}

      {action === 'override' && (
        <ConfirmDialog
          title="Replace this program's workouts?"
          message="This program will be overwritten with a copy of your current workouts. Your active workouts are unchanged."
          confirmLabel="Overwrite"
          onClose={() => setAction(null)}
          onConfirm={doOverride}
        />
      )}

      {action === 'delete' && (
        <ConfirmDialog
          title="Delete program?"
          message={`"${prog.name}" and its workouts will be permanently deleted from all your devices.`}
          confirmLabel="Delete"
          danger
          onClose={() => setAction(null)}
          onConfirm={doDelete}
        />
      )}
    </div>
  )
}
