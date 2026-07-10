import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { ExerciseSet, Session, SessionExercise } from '../types'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

type SessionData = {
  session: Session
  exercises: SessionExercise[]
  sets: ExerciseSet[]
  setsByExercise: Map<string, ExerciseSet[]>
} | null

export default function WorkoutMode() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const data = useLiveQuery(async () => {
    if (!sessionId) return null
    const session = await db.sessions.get(sessionId)
    if (!session) return null
    const exercises = await db.sessionExercises.where('sessionId').equals(sessionId).sortBy('order')
    const ids = exercises.map(e => e.id)
    const sets = ids.length > 0 ? await db.sessionSets.where('exerciseId').anyOf(ids).sortBy('order') : []

    const setsByExercise = new Map<string, ExerciseSet[]>()
    for (const set of sets) {
      const arr = setsByExercise.get(set.exerciseId) ?? []
      arr.push(set)
      setsByExercise.set(set.exerciseId, arr)
    }

    return { session, exercises, sets, setsByExercise } as SessionData
  }, [sessionId])

  const [animatingSetId, setAnimatingSetId] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    if (!data) return
    if (data.session.status === 'completed') {
      document.documentElement.requestFullscreen?.().catch(() => {})
    }
  }, [data?.session.status])

  if (!data) {
    return (
      <div className="fixed inset-0 bg-surface-950 flex items-center justify-center text-surface-400 z-50">
        Loading...
      </div>
    )
  }

  const { session, exercises, sets, setsByExercise } = data

  const currentExercise: SessionExercise | undefined = exercises[session.playheadExerciseIndex]
  const currentExerciseSets: ExerciseSet[] = currentExercise
    ? setsByExercise.get(currentExercise.id) ?? []
    : []
  const currentSet: ExerciseSet | undefined = currentExerciseSets[session.playheadSetIndex]

  const totalSets = sets.length
  const completedSets = sets.filter(s => s.completed).length
  const allCompleted = sets.every(s => s.completed)

  function findNextUncompletedSet(startEx: number, startSet: number): { exIdx: number; setIdx: number } | null {
    for (let ei = startEx; ei < exercises.length; ei++) {
      const exSets = setsByExercise.get(exercises[ei].id) ?? []
      const startS = ei === startEx ? startSet : 0
      for (let si = startS; si < exSets.length; si++) {
        if (!exSets[si].completed) {
          return { exIdx: ei, setIdx: si }
        }
      }
    }
    return null
  }

  async function completeSet() {
    if (!currentSet || allCompleted) return

    const now = new Date().toISOString()

    setAnimatingSetId(currentSet.id)
    setTimeout(() => setAnimatingSetId(null), 600)

    await db.sessionSets.update(currentSet.id, {
      completed: true,
      completedAt: now,
      logged: true,
    })

    const next = findNextUncompletedSet(session.playheadExerciseIndex, session.playheadSetIndex + 1)

    if (!next) {
      await db.sessions.update(session.id, { status: 'completed' as const })
      return
    }

    await db.sessions.update(session.id, {
      playheadExerciseIndex: next.exIdx,
      playheadSetIndex: next.setIdx,
    })
  }

  async function skipSet() {
    if (!currentSet || allCompleted) return

    const now = new Date().toISOString()

    await db.sessionSets.update(currentSet.id, {
      completed: true,
      completedAt: now,
      logged: false,
    })

    const next = findNextUncompletedSet(session.playheadExerciseIndex, session.playheadSetIndex + 1)

    if (!next) {
      await db.sessions.update(session.id, { status: 'completed' as const })
      return
    }

    await db.sessions.update(session.id, {
      playheadExerciseIndex: next.exIdx,
      playheadSetIndex: next.setIdx,
    })
  }

  async function skipExercise() {
    if (!currentExercise || allCompleted) return

    const now = new Date().toISOString()
    const toUpdate = currentExerciseSets.filter(s => !s.completed)

    await Promise.all(
      toUpdate.map(s =>
        db.sessionSets.update(s.id, { completed: true, completedAt: now, logged: false }),
      ),
    )

    const next = findNextUncompletedSet(session.playheadExerciseIndex + 1, 0)

    if (!next) {
      await db.sessions.update(session.id, { status: 'completed' as const })
      return
    }

    await db.sessions.update(session.id, {
      playheadExerciseIndex: next.exIdx,
      playheadSetIndex: next.setIdx,
    })
  }

  async function jumpToExercise(exIdx: number) {
    const firstUncompleted = findNextUncompletedSet(exIdx, 0)
    if (firstUncompleted) {
      await db.sessions.update(session.id, {
        playheadExerciseIndex: firstUncompleted.exIdx,
        playheadSetIndex: firstUncompleted.setIdx,
      })
    }
    setShowMenu(false)
  }

  async function updateCurrentSet(fields: Partial<ExerciseSet>) {
    if (!currentSet) return
    await db.sessionSets.update(currentSet.id, fields)
  }

  async function goBack() {
    let prevExIdx = session.playheadExerciseIndex
    let prevSetIdx = session.playheadSetIndex - 1

    if (prevSetIdx < 0) {
      prevExIdx--
      if (prevExIdx < 0) return
      const prevExSets = setsByExercise.get(exercises[prevExIdx].id) ?? []
      prevSetIdx = prevExSets.length - 1
    }

    const prevExSets = setsByExercise.get(exercises[prevExIdx].id) ?? []
    const targetSet = prevExSets[prevSetIdx]
    if (!targetSet) return

    await db.sessionSets.update(targetSet.id, {
      completed: false,
      completedAt: null,
    })

    await db.sessions.update(session.id, {
      playheadExerciseIndex: prevExIdx,
      playheadSetIndex: prevSetIdx,
    })
  }

  async function pauseSession() {
    if (!sessionId || !session) return
    await db.sessions.update(sessionId, { status: 'paused' })
    document.exitFullscreen?.().catch(() => {})
    navigate(`/playlists/${session.playlistId}/session`)
  }

  function getProgressPercent(): number {
    if (totalSets === 0) return 0
    return (completedSets / totalSets) * 100
  }

  if (allCompleted) {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-surface-900 to-surface-950 flex flex-col items-center justify-center gap-8 z-50 p-6">
        <div className="text-6xl animate-bounce">&#10003;</div>
        <h1 className="text-3xl font-bold text-surface-50 text-center">Session Complete!</h1>
        <p className="text-surface-400 text-center">{session.playlistName}</p>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => navigate('/playlists')}
            className="px-6 py-3 rounded-xl bg-blue-600 text-white text-lg font-semibold active:bg-blue-500 transition-colors"
          >
            Back to Playlists
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-xl bg-surface-800 text-surface-300 text-lg font-semibold active:bg-surface-700 transition-colors"
          >
            Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-surface-900 flex flex-col z-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <button
          onClick={pauseSession}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-800 text-surface-300 text-sm font-medium active:bg-surface-700 transition-colors"
        >
          <span>&#9646;&#9646;</span>
          <span>Pause</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-surface-400 text-sm">{completedSets}/{totalSets}</span>
          <div className="w-24 h-2 bg-surface-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${getProgressPercent()}%` }}
            />
          </div>
        </div>

        <button
          onClick={() => setShowMenu(!showMenu)}
          className="px-3 py-2 rounded-lg bg-surface-800 text-surface-300 text-sm active:bg-surface-700 transition-colors"
        >
          Menu
        </button>
      </div>

      {/* Jump menu */}
      {showMenu && (
        <div className="absolute top-16 right-4 left-4 z-40 bg-surface-800 rounded-xl shadow-xl border border-surface-700 max-h-60 overflow-y-auto">
          {exercises.map((ex, i) => {
            const exSets = setsByExercise.get(ex.id) ?? []
            const done = exSets.every(s => s.completed)
            const isCurrent = i === session.playheadExerciseIndex
            return (
              <button
                key={ex.id}
                onClick={() => jumpToExercise(i)}
                disabled={done}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm ${
                  isCurrent
                    ? 'bg-blue-900/40 text-blue-300'
                    : done
                      ? 'text-surface-600'
                      : 'text-surface-200'
                } ${!done && !isCurrent ? 'active:bg-surface-700' : ''} transition-colors`}
              >
                <span className="font-mono w-5">{i + 1}</span>
                <span className="flex-1">{ex.name}</span>
                <span className="text-xs">
                  {exSets.filter(s => s.completed).length}/{exSets.length}
                </span>
                {isCurrent && <span className="text-blue-400 text-xs">&larr;</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
        {/* Exercise name */}
        <div className="text-center">
          <p className="text-surface-400 text-sm mb-1">
            {currentExercise
              ? `Exercise ${currentExercise.order + 1} of ${exercises.length}`
              : ''}
          </p>
          <h2 className="text-4xl font-bold text-surface-50">
            {currentExercise?.name ?? 'Done!'}
          </h2>
        </div>

        {currentSet && currentExercise && (
          <>
            {/* Set indicator */}
            <p className="text-surface-400 text-lg">
              Set {currentSet.order + 1} of {currentExerciseSets.length}
            </p>

            {/* Reps stepper */}
            <div className="flex flex-col items-center gap-2 w-full max-w-xs">
              <label className="text-surface-500 text-sm uppercase tracking-wider">Reps</label>
              <div className="flex items-center gap-4 w-full justify-center">
                <button
                  onClick={() => updateCurrentSet({ reps: clamp(Number(currentSet.reps) - 1, 0, 9999) })}
                  className="w-16 h-16 rounded-2xl bg-surface-800 text-surface-50 text-3xl font-bold active:bg-surface-700 transition-colors flex items-center justify-center"
                >
                  -
                </button>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={currentSet.reps}
                  onChange={e => updateCurrentSet({ reps: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="w-24 bg-transparent text-6xl font-bold text-surface-50 font-mono text-center tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  onClick={() => updateCurrentSet({ reps: clamp(Number(currentSet.reps) + 1, 0, 9999) })}
                  className="w-16 h-16 rounded-2xl bg-surface-800 text-surface-50 text-3xl font-bold active:bg-surface-700 transition-colors flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            {/* Weight stepper */}
            <div className="flex flex-col items-center gap-2 w-full max-w-xs">
              <label className="text-surface-500 text-sm uppercase tracking-wider">Weight ({currentSet.weightUnit})</label>
              <div className="flex items-center gap-4 w-full justify-center">
                <button
                  onClick={() => updateCurrentSet({ weight: clamp(Number(currentSet.weight) - 5, 0, 99999) })}
                  className="w-16 h-16 rounded-2xl bg-surface-800 text-surface-50 text-3xl font-bold active:bg-surface-700 transition-colors flex items-center justify-center"
                >
                  -
                </button>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={currentSet.weight}
                  onChange={e => updateCurrentSet({ weight: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="w-24 bg-transparent text-6xl font-bold text-surface-50 font-mono text-center tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  onClick={() => updateCurrentSet({ weight: clamp(Number(currentSet.weight) + 5, 0, 99999) })}
                  className="w-16 h-16 rounded-2xl bg-surface-800 text-surface-50 text-3xl font-bold active:bg-surface-700 transition-colors flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            {/* Complete button */}
            <button
              onClick={completeSet}
              className="w-24 h-24 rounded-full bg-green-600 text-white text-4xl active:bg-green-500 transition-all duration-150 active:scale-95 flex items-center justify-center shadow-lg shadow-green-600/30"
            >
              <span className={`${animatingSetId === currentSet.id ? 'animate-bounce' : ''}`}>
                {currentSet.logged ? 'Save' : '\u2713'}
              </span>
            </button>
          </>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-4 mt-2">
          <button
            onClick={goBack}
            disabled={session.playheadExerciseIndex === 0 && session.playheadSetIndex === 0}
            className="px-5 py-2 rounded-xl bg-surface-800 text-surface-300 text-sm font-medium disabled:opacity-30 active:bg-surface-700 transition-colors"
          >
            &larr; Back
          </button>
          <button
            onClick={skipSet}
            disabled={!currentSet}
            className="px-5 py-2 rounded-xl bg-surface-800 text-surface-300 text-sm font-medium disabled:opacity-30 active:bg-surface-700 transition-colors"
          >
            Skip Set
          </button>
          <button
            onClick={skipExercise}
            disabled={!currentExercise}
            className="px-5 py-2 rounded-xl bg-surface-800 text-surface-300 text-sm font-medium disabled:opacity-30 active:bg-surface-700 transition-colors"
          >
            Skip Exercise
          </button>
        </div>
      </div>
    </div>
  )
}
