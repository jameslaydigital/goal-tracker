import { useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { generateId } from '../utils'
import { SortableGroup, SortableItem, DragHandle } from '../components/SortableList'
import type { SessionExercise, ExerciseSet, Session } from '../types'

const DEFAULT_WEIGHT_UNIT = 'lbs'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

type SessionData = {
  session: Session
  exercises: SessionExercise[]
  sets: ExerciseSet[]
} | null

export default function SessionView() {
  const { id: playlistId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const sessions = useLiveQuery(() => db.sessions.toArray())
  const playlist = useLiveQuery(() => (playlistId ? db.playlists.get(playlistId) : undefined), [playlistId])

  const activeSession = sessions?.find(
    s => s.playlistId === playlistId && (s.status === 'active' || s.status === 'paused'),
  )

  const data = useLiveQuery(async () => {
    if (!activeSession) return null
    const exercises = await db.sessionExercises.where('sessionId').equals(activeSession.id).sortBy('order')
    const ids = exercises.map(e => e.id)
    const sets = ids.length > 0 ? await db.sessionSets.where('exerciseId').anyOf(ids).sortBy('order') : []
    return { session: activeSession, exercises, sets } as SessionData
  }, [activeSession?.id])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [shuffle, setShuffle] = useState(false)

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

  if (!playlist) {
    return (
      <div className="min-h-dvh bg-surface-950 flex items-center justify-center text-surface-400">
        Loading...
      </div>
    )
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function getSets(exerciseId: string): ExerciseSet[] {
    if (!data) return []
    return data.sets.filter(s => s.exerciseId === exerciseId).sort((a, b) => a.order - b.order)
  }

  async function addSetToSessionExercise(exerciseId: string, set?: ExerciseSet) {
    if (!data || !activeSession) return
    const ex = data.exercises.find(e => e.id === exerciseId)
    if (!ex) return
    const existingSets = getSets(exerciseId)

    const newSet: ExerciseSet = {
      id: generateId(),
      exerciseId,
      sessionId: activeSession.id,
      sessionName: activeSession.playlistName,
      exerciseName: ex.name,
      order: existingSets.length,
      reps: set?.reps ?? 10,
      weight: set?.weight ?? 0,
      weightUnit: set?.weightUnit ?? DEFAULT_WEIGHT_UNIT,
      completed: false,
      completedAt: null,
      logged: false,
    }

    await db.sessionSets.add(newSet)
  }

  async function removeSetFromSessionExercise(setId: string) {
    if (!data) return
    const set = data.sets.find(s => s.id === setId)
    if (!set) return
    await db.sessionSets.delete(setId)
    // Re-index remaining sets for this exercise
    const remaining = data.sets
      .filter(s => s.exerciseId === set.exerciseId && s.id !== setId)
      .sort((a, b) => a.order - b.order)
    for (const [i, s] of remaining.entries()) {
      if (s.order !== i) {
        await db.sessionSets.update(s.id, { order: i })
      }
    }
  }

  async function updateSetInExercise(setId: string, fields: Partial<ExerciseSet>) {
    await db.sessionSets.update(setId, fields)
  }

  async function addExerciseToSession() {
    if (!data || !activeSession) return
    const name = prompt('Exercise name:')
    if (!name?.trim()) return

    const newEx: SessionExercise = {
      id: generateId(),
      sessionId: activeSession.id,
      name: name.trim(),
      order: data.exercises.length,
    }

    const newSet: ExerciseSet = {
      id: generateId(),
      exerciseId: newEx.id,
      sessionId: activeSession.id,
      sessionName: activeSession.playlistName,
      exerciseName: newEx.name,
      order: 0,
      reps: 10,
      weight: 0,
      weightUnit: DEFAULT_WEIGHT_UNIT,
      completed: false,
      completedAt: null,
      logged: false,
    }

    await db.transaction('rw', db.sessionExercises, db.sessionSets, async () => {
      await db.sessionExercises.add(newEx)
      await db.sessionSets.add(newSet)
    })
  }

  async function removeExerciseFromSession(exerciseId: string) {
    if (!data) return
    const exerciseSets = data.sets.filter(s => s.exerciseId === exerciseId)
    await db.transaction('rw', db.sessionExercises, db.sessionSets, async () => {
      await db.sessionExercises.delete(exerciseId)
      await db.sessionSets.bulkDelete(exerciseSets.map(s => s.id))
    })
    // Re-index remaining exercises
    const remaining = data.exercises
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

  async function updateTemplateFromSession() {
    if (!data || !playlist) return

    const exercises = data.exercises.map(ex => {
      const exSets = getSets(ex.id)
      return {
        id: generateId(),
        name: ex.name,
        weightUnit: exSets[0]?.weightUnit ?? DEFAULT_WEIGHT_UNIT,
        order: ex.order,
        sets: exSets.map(s => ({
          id: generateId(),
          reps: s.reps,
          weight: s.weight,
          weightUnit: s.weightUnit,
          order: s.order,
        })),
      }
    })

    await db.playlists.update(playlist.id, { exercises })

    // Reset session
    await db.sessionSets.bulkUpdate(
      data.sets.map(s => ({
        key: s.id,
        changes: { completed: false, completedAt: null },
      })),
    )

    await db.sessions.update(data.session.id, {
      status: 'active',
      playheadExerciseIndex: 0,
      playheadSetIndex: 0,
    })
  }

  const displayExercises = shuffle
    ? [...data?.exercises ?? []].sort(() => Math.random() - 0.5)
    : data?.exercises ?? []

  return (
    <div className="min-h-dvh bg-surface-950 flex flex-col">
      {activeSession?.status === 'paused' && (
        <div className="sticky top-0 z-10 bg-yellow-900/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
          <span className="text-yellow-200 text-sm font-medium">Session paused</span>
          <button
            onClick={() => {
              db.sessions.update(activeSession.id, { status: 'active' })
              navigate(`/workout/${activeSession.id}`)
            }}
            className="px-4 py-1.5 rounded-lg bg-yellow-600 text-white text-sm font-medium active:bg-yellow-500 transition-colors"
          >
            Resume
          </button>
        </div>
      )}

      <div className="p-6 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate('/playlists')}
            className="text-surface-400 hover:text-surface-200 transition-colors"
          >
            &larr; Playlists
          </button>
          <h1 className="text-lg font-bold text-surface-50 text-center">
            {playlist.name}
          </h1>
          <div className="w-12" />
        </div>

        {data ? (
          <>
            <div className="flex items-center justify-between mb-4 gap-3">
              <label className="flex items-center gap-2 text-surface-400 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffle}
                  onChange={e => setShuffle(e.target.checked)}
                  className="rounded bg-surface-700 border-surface-600"
                />
                Shuffle
              </label>

              <button
                onClick={() => {
                  db.sessions.update(data.session.id, { status: 'active' })
                  navigate(`/workout/${data.session.id}`)
                }}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold active:bg-blue-500 transition-colors"
              >
                {data.session.status === 'paused' ? 'Resume' : 'Play Now'}
              </button>
            </div>

            <div className="flex flex-col gap-2 flex-1">
              <SortableGroup items={data.exercises} onReorder={handleReorderExercise}>
                {displayExercises.map(ex => {
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
                            <span className="text-surface-500 text-sm font-mono w-6">
                              {ex.order + 1}
                            </span>
                            <span className="flex-1 text-surface-50 font-medium">
                              {ex.name}
                            </span>
                            <span className="text-surface-400 text-xs">
                              {exSets.length} set{exSets.length !== 1 ? 's' : ''}
                            </span>
                            <span className="text-surface-500 text-sm">
                              {expanded.has(ex.id) ? '\u25B2' : '\u25BC'}
                            </span>
                          </button>
                          <button
                            onClick={() => removeExerciseFromSession(ex.id)}
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
                                    <span className="text-surface-500 text-xs font-mono w-6">
                                      {set.order + 1}
                                    </span>

                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => updateSetInExercise(set.id, { reps: clamp(Number(set.reps) - 1, 0, 9999) })}
                                        className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={set.reps}
                                        onChange={e => updateSetInExercise(set.id, { reps: Math.max(0, parseFloat(e.target.value) || 0) })}
                                        className="w-14 p-1 rounded bg-surface-700 text-surface-50 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                      />
                                      <button
                                        onClick={() => updateSetInExercise(set.id, { reps: clamp(Number(set.reps) + 1, 0, 9999) })}
                                        className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                                      >
                                        +
                                      </button>
                                    </div>

                                    <span className="text-surface-500 text-xs"> @ </span>

                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => updateSetInExercise(set.id, { weight: clamp(Number(set.weight) - 5, 0, 99999) })}
                                        className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={set.weight}
                                        onChange={e => updateSetInExercise(set.id, { weight: Math.max(0, parseFloat(e.target.value) || 0) })}
                                        className="w-16 p-1 rounded bg-surface-700 text-surface-50 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                      />
                                      <button
                                        onClick={() => updateSetInExercise(set.id, { weight: clamp(Number(set.weight) + 5, 0, 99999) })}
                                        className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                                      >
                                        +
                                      </button>
                                    </div>

                                    <span className="text-surface-500 text-xs">{set.weightUnit}</span>

                                    <div className="flex-1" />

                                    <button
                                      onClick={() => addSetToSessionExercise(ex.id, set)}
                                      className="p-1 text-surface-400 hover:text-surface-200 transition-colors text-xs"
                                      title="Duplicate set"
                                    >
                                      DUP
                                    </button>
                                    <button
                                      onClick={() => removeSetFromSessionExercise(set.id)}
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
                              onClick={() => addSetToSessionExercise(ex.id)}
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
                onClick={addExerciseToSession}
                className="w-full py-3 rounded-xl border-2 border-dashed border-surface-700 text-surface-400 text-sm font-medium active:bg-surface-800 transition-colors"
              >
                + Add exercise to session
              </button>
              <button
                onClick={updateTemplateFromSession}
                className="w-full py-3 rounded-xl bg-surface-800 text-blue-400 text-sm font-medium active:bg-surface-700 transition-colors"
              >
                ! Update template using this session
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-surface-500">No active session</p>
            <button
              onClick={() => navigate('/playlists')}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold active:bg-blue-500 transition-colors"
            >
              Go to Playlists
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
