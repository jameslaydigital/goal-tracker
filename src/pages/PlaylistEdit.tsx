import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { generateId } from '../utils'
import { SortableGroup, SortableItem, DragHandle } from '../components/SortableList'
import type { Exercise, ExerciseTemplateSet, Playlist } from '../types'

const DEFAULT_WEIGHT_UNIT = 'lbs'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function emptySet(): ExerciseTemplateSet {
  return {
    id: generateId(),
    reps: 10,
    weight: 0,
    weightUnit: DEFAULT_WEIGHT_UNIT,
    order: 0,
  }
}

function emptyExercise(): Exercise {
  return {
    id: generateId(),
    name: '',
    weightUnit: DEFAULT_WEIGHT_UNIT,
    order: 0,
    sets: [emptySet()],
  }
}

export default function PlaylistEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const existingPlaylist = useLiveQuery(
    () => (id ? db.playlists.get(id) : undefined),
    [id],
  )

  const [name, setName] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (existingPlaylist) {
      setName(existingPlaylist.name)
      setExercises(existingPlaylist.exercises.map(ex => ({ ...ex, sets: ex.sets.map(s => ({ ...s })) })))
    }
  }, [existingPlaylist])

  function updateExercise(exerciseId: string, fields: Partial<Exercise>) {
    setExercises(prev =>
      prev.map(ex => (ex.id === exerciseId ? { ...ex, ...fields } : ex)),
    )
  }

  function updateSetInExercise(exerciseId: string, setId: string, fields: Partial<ExerciseTemplateSet>) {
    setExercises(prev =>
      prev.map(ex => {
        if (ex.id !== exerciseId) return ex
        return {
          ...ex,
          sets: ex.sets.map(s => (s.id === setId ? { ...s, ...fields } : s)),
        }
      }),
    )
  }

  function addSetToExercise(exerciseId: string, template?: ExerciseTemplateSet) {
    setExercises(prev =>
      prev.map(ex => {
        if (ex.id !== exerciseId) return ex
        const newSet: ExerciseTemplateSet = {
          id: generateId(),
          reps: template?.reps ?? 10,
          weight: template?.weight ?? 0,
          weightUnit: template?.weightUnit ?? ex.weightUnit,
          order: ex.sets.length,
        }
        return { ...ex, sets: [...ex.sets, newSet] }
      }),
    )
  }

  function removeSetFromExercise(exerciseId: string, setId: string) {
    setExercises(prev =>
      prev.map(ex => {
        if (ex.id !== exerciseId) return ex
        return {
          ...ex,
          sets: ex.sets.filter(s => s.id !== setId).map((s, i) => ({ ...s, order: i })),
        }
      }),
    )
  }

  function addExercise() {
    setExercises(prev => [
      ...prev,
      { ...emptyExercise(), order: prev.length },
    ])
  }

  function removeExercise(exerciseId: string) {
    setExercises(prev =>
      prev.filter(ex => ex.id !== exerciseId).map((ex, i) => ({ ...ex, order: i })),
    )
  }

  function handleReorderExercise(oldIndex: number, newIndex: number) {
    setExercises(prev => {
      const next = [...prev]
      const [moved] = next.splice(oldIndex, 1)
      next.splice(newIndex, 0, moved)
      return next.map((ex, i) => ({ ...ex, order: i }))
    })
  }

  const handleReorderSet = useCallback((exerciseId: string, oldIndex: number, newIndex: number) => {
    setExercises(prev =>
      prev.map(ex => {
        if (ex.id !== exerciseId) return ex
        const next = [...ex.sets]
        const [moved] = next.splice(oldIndex, 1)
        next.splice(newIndex, 0, moved)
        return { ...ex, sets: next.map((s, i) => ({ ...s, order: i })) }
      }),
    )
  }, [])

  async function handleSave() {
    if (!name.trim()) return

    const playlist: Playlist = {
      id: id || generateId(),
      name: name.trim(),
      exercises: exercises.map((ex, i) => ({
        ...ex,
        order: i,
        sets: ex.sets.map((s, j) => ({ ...s, order: j })),
      })),
    }

    await db.playlists.put(playlist)
    setSaved(true)
    navigate('/playlists')
  }

  return (
    <div className="min-h-dvh bg-surface-950 flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/playlists')}
          className="text-surface-400 hover:text-surface-200 transition-colors"
        >
          &larr; Playlists
        </button>
        <h1 className="text-xl font-bold text-surface-50">
          {isNew ? 'New Playlist' : 'Edit Playlist'}
        </h1>
        <div className="w-12" />
      </div>

      {saved && (
        <div className="mb-4 p-3 rounded-lg bg-green-900/50 text-green-300 text-sm text-center">
          Saved!
        </div>
      )}

      <div className="flex flex-col gap-4 flex-1">
        <input
          type="text"
          placeholder="Playlist name"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full p-3 rounded-xl bg-surface-800 text-surface-50 placeholder-surface-500 border border-surface-700 focus:outline-none focus:border-blue-500"
        />

        <h2 className="text-surface-300 font-semibold">Exercises</h2>

        <div className="flex flex-col gap-3 flex-1">
          <SortableGroup items={exercises} onReorder={handleReorderExercise}>
            {exercises.map((ex, i) => (
              <SortableItem key={ex.id} id={ex.id}>
                <div className="bg-surface-800 rounded-xl overflow-hidden">
                  {/* Exercise header */}
                  <div className="flex items-center gap-2 p-4 pb-2">
                    <DragHandle />
                    <span className="text-surface-500 text-sm font-mono">{i + 1}.</span>
                    <input
                      type="text"
                      placeholder="Exercise name"
                      value={ex.name}
                      onChange={e => updateExercise(ex.id, { name: e.target.value })}
                      className="flex-1 p-2 rounded-lg bg-surface-700 text-surface-50 placeholder-surface-500 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <select
                      value={ex.weightUnit}
                      onChange={e => updateExercise(ex.id, { weightUnit: e.target.value })}
                      className="p-2 rounded-lg bg-surface-700 text-surface-50 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option>lbs</option>
                      <option>kg</option>
                      <option>body</option>
                      <option>min</option>
                    </select>
                    <button
                      onClick={() => removeExercise(ex.id)}
                      className="p-2 text-red-400 hover:text-red-300 transition-colors"
                    >
                      &times;
                    </button>
                  </div>

                  {/* Sets */}
                  <div className="px-4 pb-4 flex flex-col gap-1.5">
                    <SortableGroup items={ex.sets} onReorder={(oldIdx, newIdx) => handleReorderSet(ex.id, oldIdx, newIdx)}>
                      {ex.sets.map(set => (
                        <SortableItem key={set.id} id={set.id}>
                          <div className="flex items-center gap-1.5 bg-surface-700/50 rounded-lg p-2 flex-wrap">
                            <DragHandle className="text-xs" />
                            <span className="text-surface-500 text-xs font-mono min-w-[3rem]">
                              Set {set.order + 1}
                            </span>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateSetInExercise(ex.id, set.id, { reps: clamp(Number(set.reps) - 1, 0, 9999) })}
                                className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={set.reps}
                                onChange={e => updateSetInExercise(ex.id, set.id, { reps: Math.max(0, parseFloat(e.target.value) || 0) })}
                                className="w-14 p-1 rounded bg-surface-700 text-surface-50 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              <button
                                onClick={() => updateSetInExercise(ex.id, set.id, { reps: clamp(Number(set.reps) + 1, 0, 9999) })}
                                className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                              >
                                +
                              </button>
                            </div>

                            <span className="text-surface-600 text-xs">@</span>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateSetInExercise(ex.id, set.id, { weight: clamp(Number(set.weight) - 5, 0, 99999) })}
                                className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={set.weight}
                                onChange={e => updateSetInExercise(ex.id, set.id, { weight: Math.max(0, parseFloat(e.target.value) || 0) })}
                                className="w-16 p-1 rounded bg-surface-700 text-surface-50 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              <button
                                onClick={() => updateSetInExercise(ex.id, set.id, { weight: clamp(Number(set.weight) + 5, 0, 99999) })}
                                className="w-7 h-7 rounded bg-surface-700 text-surface-300 font-bold active:bg-surface-600 transition-colors"
                              >
                                +
                              </button>
                            </div>

                            <span className="text-surface-500 text-xs">{set.weightUnit}</span>

                            <button
                              onClick={() => addSetToExercise(ex.id, set)}
                              className="ml-auto p-1 text-surface-400 hover:text-surface-200 transition-colors text-xs"
                              title="Duplicate set"
                            >
                              DUP
                            </button>
                            <button
                              onClick={() => removeSetFromExercise(ex.id, set.id)}
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
                </div>
              </SortableItem>
            ))}
          </SortableGroup>

          <button
            onClick={addExercise}
            className="w-full py-3 rounded-xl border-2 border-dashed border-surface-700 text-surface-400 text-sm font-medium active:bg-surface-800 transition-colors"
          >
            + Add exercise
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="w-full py-4 px-6 rounded-xl bg-blue-600 text-white text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed active:bg-blue-500 transition-colors"
        >
          Save Playlist
        </button>
      </div>
    </div>
  )
}
