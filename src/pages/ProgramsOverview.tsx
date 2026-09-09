import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { saveCurrentWorkoutsAsProgram, todayStamp } from '../programs'
import { PromptDialog } from '../components/dialogs'
import type { Program } from '../types'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

export default function ProgramsOverview() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const programs = useLiveQuery(async () => {
    const all = await db.programs.toArray()
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  })

  const hasPrograms = !!programs && programs.length > 0

  async function handleCreate(name: string) {
    const program = await saveCurrentWorkoutsAsProgram(name)
    navigate(`/programs/${program.id}`)
  }

  return (
    <div className="min-h-dvh bg-surface-950 flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <Link to="/" className="text-surface-400 hover:text-surface-200 transition-colors">
          &larr; Dashboard
        </Link>
        <h1 className="text-xl font-bold text-surface-50">Programs</h1>
        <div className="w-12" />
      </div>

      <div className="flex flex-col gap-3 flex-1">
        {!programs ? null : !hasPrograms ? (
          <p className="text-surface-500 text-center mt-12 text-sm">
            No programs yet. Starter programs appear after your first sync, or save your current
            workouts as a program below.
          </p>
        ) : (
          programs.map((program: Program) => (
            <Link
              key={program.id}
              to={`/programs/${program.id}`}
              className="flex items-center gap-3 bg-surface-800 rounded-xl p-4 active:bg-surface-700 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <h2 className="text-surface-50 font-semibold truncate">{program.name}</h2>
                <p className="text-surface-400 text-xs">
                  {program.workouts.length} workout{program.workouts.length !== 1 ? 's' : ''}
                  {formatDate(program.createdAt) && ` · saved ${formatDate(program.createdAt)}`}
                </p>
              </div>
              <span className="text-surface-500">&rsaquo;</span>
            </Link>
          ))
        )}

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          onClick={() => {
            setError(null)
            setCreating(true)
          }}
          className="w-full py-4 px-6 rounded-xl border-2 border-dashed border-surface-700 text-surface-400 text-lg font-medium active:bg-surface-800 transition-colors mt-4"
        >
          + Save current workouts as a new program
        </button>
        <p className="text-surface-600 text-xs text-center">
          Today is {todayStamp()} — applying a program backs your current workouts up to that date.
        </p>
      </div>

      {creating && (
        <PromptDialog
          title="Save as new program"
          message="Snapshots your current workouts into a new program. Your active workouts are unchanged."
          placeholder="Program name"
          submitLabel="Save"
          onClose={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  )
}
