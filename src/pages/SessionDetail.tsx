import { useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { generateId } from '../utils'
import { SortableGroup, SortableItem, DragHandle } from '../components/SortableList'
import type { ExerciseSet, SessionExercise } from '../types'

const DEFAULT_WEIGHT_UNIT = 'lbs'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export default function SessionDetail() {
  const { id: sessionId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const data = useLiveQuery(async () => {
    if (!sessionId) return null
    const session = await db.sessions.get(sessionId)
    if (!session) return null
    const exercises = await db.sessionExercises.where('sessionId').equals(sessionId).sortBy('order')
    const ids = exercises.map(e => e.id)
    const sets = ids.length > 0 ? await db.sessionSets.where('exerciseId').anyOf(ids).sortBy('order') : []
    return { session, exercises, sets }
  }, [sessionId])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (data === undefined) {
    return (
      <div className="min-h-dvh bg-surface-950 flex items-center justify-center text-surface-400">
        Loading...
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="min-h-dvh bg-surface-950 flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-surface-500">Session not found</p>
        <button
          onClick={() => navigate('/sessions')}
          className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold active:bg-blue-500 transition-colors"
        >
          Back to Sessions
        </button>
      </div>
    )
  }

  const { session, exercises, sets } = data

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function getSets(exerciseId: string): ExerciseSet[] {
    return sets.filter(s => s.exerciseId === exerciseId).sort((a, b) => a.order - b.order)
  }

  async function addSetToExercise(exerciseId: string, template?: ExerciseSet) {
    const ex = exercises.find(e => e.id === exerciseId)
    if (!ex || !sessionId) return
    const existingSets = getSets(exerciseId)

    const newSet: ExerciseSet = {
      id: generateId(),
      exerciseId,
      sessionId,
      sessionName: session.playlistName,
      exerciseName: ex.name,
      order: existingSets.length,
      reps: template?.reps ?? 10,
      weight: template?.weight ?? 0,
      weightUnit: template?.weightUnit ?? DEFAULT_WEIGHT_UNIT,
      completed: false,
      completedAt: null,
      logged: false,
    }

    await db.sessionSets.add(newSet)
  }

  async function removeSetFromExercise(setId: string) {
    if (!data) return
    const set = sets.find(s => s.id === setId)
    if (!set) return
    await db.sessionSets.delete(setId)
    // Re-index remaining sets for this exercise
    const remaining = sets
      .filter(s => s.exerciseId === set.exerciseId && s.id !== setId)
      .sort((a, b) => a.order - b.order)
    for (const [i, s] of remaining.entries()) {
      if (s.order !== i) {
        await db.sessionSets.update(s.id, { order: i })
      }
    }
  }

  async function updateSet(setId: string, fields: Partial<ExerciseSet>) {
    await db.sessionSets.update(setId, fields)
  }

  async function addExercise() {
    if (!sessionId) return
    const name = prompt('Exercise name:')
    if (!name?.trim()) return

    const ex: SessionExercise = {
      id: generateId(),
      sessionId,
      name: name.trim(),
      order: exercises.length,
    }

    const set: ExerciseSet = {
      id: generateId(),
      exerciseId: ex.id,
      sessionId,
      sessionName: session.playlistName,
      exerciseName: ex.name,
      order: 0,
      reps: 10,
      weight: 0,
      weightUnit: DEFAULT_WEIGHT_UNIT,
      completed: false,
      completedAt: null,
      logged: false,
    }

    await db.transaction('rw', db.sessionExercises, db.sessionSets, async () => {
      await db.sessionExercises.add(ex)
      await db.sessionSets.add(set)
    })
  }

  async function removeExercise(exerciseId: string) {
    const exSets = sets.filter(s => s.exerciseId === exerciseId)
    await db.transaction('rw', db.sessionExercises, db.sessionSets, async () => {
      await db.sessionExercises.delete(exerciseId)
      await db.sessionSets.bulkDelete(exSets.map(s => s.id))
    })
    // Re-index remaining exercises
    const remaining = exercises
      .filter(e => e.id !== exerciseId)
      .sort((a, b) => a.order - b.order)
    for (const [i, e] of remaining.entries()) {
      if (e.order !== i) {
        await db.sessionExercises.update(e.id, { order: i })
      }
    }
  }

  async function handleReorderExercise(oldIndex: number, newIndex: number) {
    if (!data) return
    const next = [...data.exercises]
    const [moved] = next.splice(oldIndex, 1)
    next.splice(newIndex, 0, moved)
    await db.transaction('rw', db.sessionExercises, async () => {
      for (const [i, ex] of next.entries()) {
        if (ex.order !== i) {
          await db.sessionExercises.update(ex.id, { order: i })
        }
      }
    })
  }

  const handleReorderSet = useCallback(async (exerciseId: string, oldIndex: number, newIndex: number) => {
    if (!data) return
    const exSets = data.sets
      .filter(s => s.exerciseId === exerciseId)
      .sort((a, b) => a.order - b.order)
    const next = [...exSets]
    const [moved] = next.splice(oldIndex, 1)
    next.splice(newIndex, 0, moved)
    await db.transaction('rw', db.sessionSets, async () => {
      for (const [i, s] of next.entries()) {
        if (s.order !== i) {
          await db.sessionSets.update(s.id, { order: i })
        }
      }
    })
  }, [data])

  async function deleteSession() {
    if (!sessionId) return
    if (!confirm('Delete this session? This cannot be undone.')) return

    const exIds = exercises.map(e => e.id)
    await db.transaction('rw', db.sessions, db.sessionExercises, db.sessionSets, async () => {
      await db.sessions.delete(sessionId)
      await db.sessionExercises.bulkDelete(exIds)
      await db.sessionSets.bulkDelete(sets.map(s => s.id))
    })
    navigate('/sessions')
  }

  function statusBadge(status: string) {
    switch (status) {
      case 'active':
        return { className: 'bg-green-900/50 text-green-400 border border-green-700/50', label: 'Active' }
      case 'paused':
        return { className: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50', label: 'Paused' }
      case 'completed':
        return { className: 'bg-blue-900/50 text-blue-400 border border-blue-700/50', label: 'Completed' }
      default:
        return { className: 'bg-surface-700 text-surface-400 border border-surface-600', label: status }
    }
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return `${date} at ${time}`
  }

  const badge = statusBadge(session.status)
  const isActive = session.status === 'active' || session.status === 'paused'

  return (
    <div className="min-h-dvh bg-surface-950 flex flex-col p-6">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/sessions')} className="text-surface-400 hover:text-surface-200 transition-colors">
          &larr; Sessions
        </button>
        <h1 className="text-lg font-bold text-surface-50 text-center">{session.playlistName}</h1>
        <div className="w-12" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-surface-400 text-xs">{formatDate(session.startTime)}</p>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
          {isActive && (
            <button
              onClick={() => navigate(`/workout/${sessionId}`)}
              className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium active:bg-blue-500 transition-colors"
            >
              Resume
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 flex-1">
        <SortableGroup items={exercises} onReorder={handleReorderExercise}>
          {exercises.map(ex => {
            const exSets = getSets(ex.id)
            return (
              <SortableItem key={ex.id} id={ex.id}>
                <div className="bg-surface-800 rounded-xl overflow-hidden">
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleExpand(ex.id)}
                      className="flex items-center gap-2 p-4 text-left flex-1"
                    >
                      <DragHandle />
                      <span className="text-surface-500 text-sm font-mono w-6">{ex.order + 1}</span>
                      <span className="flex-1 text-surface-50 font-medium">{ex.name}</span>
                      <span className="text-surface-400 text-xs">
                        {exSets.length} set{exSets.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-surface-500 text-sm">
                        {expanded.has(ex.id) ? '\u25B2' : '\u25BC'}
                      </span>
                    </button>
                    <button
                      onClick={() => removeExercise(ex.id)}
                      className="px-3 py-1 text-red-400 hover:text-red-300 transition-colors text-xs mr-2"
                      title="Remove exercise"
                    >
                      DEL
                    </button>
                  </div>

                  {expanded.has(ex.id) && (
                    <div className="px-4 pb-4 flex flex-col gap-2">
                      <SortableGroup items={exSets} onReorder={(oldIdx, newIdx) => handleReorderSet(ex.id, oldIdx, newIdx)}>
                        {exSets.map(set => (
                          <SortableItem key={set.id} id={set.id}>
                            <div className="flex items-center gap-1.5 bg-surface-700/50 rounded-lg p-2">
                              <DragHandle className="text-xs" />
                              <span className="text-surface-500 text-xs font-mono w-6">{set.order + 1}</span>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => updateSet(set.id, { reps: clamp(Number(set.reps) - 1, 0, 9999) })}
                                  className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={set.reps}
                                  onChange={e => updateSet(set.id, { reps: Math.max(0, parseFloat(e.target.value) || 0) })}
                                  className="w-14 p-1 rounded bg-surface-700 text-surface-50 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <button
                                  onClick={() => updateSet(set.id, { reps: clamp(Number(set.reps) + 1, 0, 9999) })}
                                  className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                                >
                                  +
                                </button>
                              </div>

                              <span className="text-surface-500 text-xs">@</span>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => updateSet(set.id, { weight: clamp(Number(set.weight) - 5, 0, 99999) })}
                                  className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={set.weight}
                                  onChange={e => updateSet(set.id, { weight: Math.max(0, parseFloat(e.target.value) || 0) })}
                                  className="w-16 p-1 rounded bg-surface-700 text-surface-50 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <button
                                  onClick={() => updateSet(set.id, { weight: clamp(Number(set.weight) + 5, 0, 99999) })}
                                  className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                                >
                                  +
                                </button>
                              </div>

                              <span className="text-surface-500 text-xs">{set.weightUnit}</span>

                              <div className="flex-1" />

                              <label className="flex items-center gap-1 text-xs text-surface-400 cursor-pointer" title="Include in CSV export">
                                <input
                                  type="checkbox"
                                  checked={set.logged}
                                  onChange={e => updateSet(set.id, { logged: e.target.checked })}
                                  className="rounded bg-surface-700 border-surface-600"
                                />
                                Log
                              </label>

                              <button
                                onClick={() => addSetToExercise(ex.id, set)}
                                className="p-1 text-surface-400 hover:text-surface-200 transition-colors text-xs"
                                title="Duplicate set"
                              >
                                DUP
                              </button>
                              <button
                                onClick={() => removeSetFromExercise(set.id)}
                                className="p-1 text-red-400 hover:text-red-300 transition-colors text-xs"
                                title="Remove set"
                              >
                                DEL
                              </button>
                            </div>
                          </SortableItem>
                        ))}
                      </SortableGroup>

                      <button
                        onClick={() => addSetToExercise(ex.id)}
                        className="w-full py-2 rounded-lg bg-surface-700/50 text-surface-400 text-sm active:bg-surface-700 transition-colors"
                      >
                        + Add set
                      </button>
                    </div>
                  )}
                </div>
              </SortableItem>
            )
          })}
        </SortableGroup>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        <button
          onClick={addExercise}
          className="w-full py-3 rounded-xl border-2 border-dashed border-surface-700 text-surface-400 text-sm font-medium active:bg-surface-800 transition-colors"
        >
          + Add exercise
        </button>
        <button
          onClick={deleteSession}
          className="w-full py-3 rounded-xl border border-red-800 text-red-400 text-sm font-medium active:bg-red-900/20 transition-colors"
        >
          Delete session
        </button>
      </div>
    </div>
  )
}
