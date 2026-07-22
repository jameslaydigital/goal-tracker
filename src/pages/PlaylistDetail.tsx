import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { generateId } from '../utils'
import type { Session, ExerciseSet } from '../types'

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const playlist = useLiveQuery(() => (id ? db.playlists.get(id) : undefined), [id])
  const allSessions = useLiveQuery(() => db.sessions.toArray())
  const allSets = useLiveQuery(() => db.sessionSets.toArray())

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const sessions = (allSessions ?? []).filter(s => s.playlistId === id)

  const setCountBySession = new Map<string, number>()
  const completedSetCountBySession = new Map<string, number>()
  allSets?.forEach(s => {
    setCountBySession.set(s.sessionId, (setCountBySession.get(s.sessionId) ?? 0) + 1)
    if (s.completed) {
      completedSetCountBySession.set(s.sessionId, (completedSetCountBySession.get(s.sessionId) ?? 0) + 1)
    }
  })

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  )

  function toggleExpand(exerciseId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(exerciseId)) next.delete(exerciseId)
      else next.add(exerciseId)
      return next
    })
  }

  async function startSession() {
    if (!playlist) return

    const sessionId = generateId()

    const session: Session = {
      id: sessionId,
      playlistId: playlist.id,
      playlistName: playlist.name,
      startTime: new Date().toISOString(),
      status: 'active',
      playheadExerciseIndex: 0,
      playheadSetIndex: 0,
    }

    const sessionExercises = playlist.exercises
      .sort((a, b) => a.order - b.order)
      .map(ex => ({
        id: generateId(),
        sessionId,
        name: ex.name,
        order: ex.order,
      }))

    const sessionSets: ExerciseSet[] = sessionExercises.flatMap(se => {
      const source = playlist.exercises[se.order]
      return source.sets.map(s => ({
        id: generateId(),
        exerciseId: se.id,
        sessionId,
        sessionName: playlist.name,
        exerciseName: se.name,
        order: s.order,
        reps: s.reps,
        weight: s.weight,
        weightUnit: s.weightUnit,
        completed: false,
        completedAt: null,
        logged: false,
      }))
    })

    await db.transaction('rw', db.sessions, db.sessionExercises, db.sessionSets, async () => {
      await db.sessions.add(session)
      await db.sessionExercises.bulkAdd(sessionExercises)
      await db.sessionSets.bulkAdd(sessionSets)
    })

    navigate(`/workout/${sessionId}`)
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

  if (!playlist) {
    return (
      <div className="min-h-dvh bg-surface-950 flex items-center justify-center text-surface-400">
        Loading...
      </div>
    )
  }

  const exercises = [...playlist.exercises].sort((a, b) => a.order - b.order)

  return (
    <div className="min-h-dvh bg-surface-950 flex flex-col p-6">
      <div className="flex items-center justify-between mb-4">
        <Link to="/playlists" className="text-surface-400 hover:text-surface-200 transition-colors">
          &larr; Playlists
        </Link>
        <h1 className="text-lg font-bold text-surface-50 text-center">{playlist.name}</h1>
        <div className="w-12" />
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={startSession}
          className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold active:bg-blue-500 transition-colors"
        >
          Play
        </button>
        <button
          onClick={() => navigate(`/playlists/${playlist.id}/edit`)}
          className="flex-1 py-3 rounded-xl bg-surface-800 text-surface-200 font-semibold active:bg-surface-700 transition-colors"
        >
          Edit
        </button>
      </div>

      <h2 className="text-surface-300 font-semibold mb-3">Exercises</h2>

      <div className="flex flex-col gap-2 mb-6">
        {exercises.map((ex, i) => {
          const isExpanded = expanded.has(ex.id)
          return (
            <div key={ex.id} className="bg-surface-800 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleExpand(ex.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <span className="text-surface-500 text-sm font-mono w-6">{i + 1}.</span>
                <span className="flex-1 text-surface-50 font-medium">{ex.name}</span>
                <span className="text-surface-400 text-xs">{ex.sets.length} set{ex.sets.length !== 1 ? 's' : ''}</span>
                <span className="text-surface-500 text-sm">
                  {isExpanded ? '\u25B2' : '\u25BC'}
                </span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 flex flex-col gap-1">
                  {[...ex.sets].sort((a, b) => a.order - b.order).map((set, j) => (
                    <div key={set.id} className="flex items-center gap-2 bg-surface-700/50 rounded-lg p-2 text-sm">
                      <span className="text-surface-500 text-xs font-mono w-16">Set {j + 1}</span>
                      <span className="text-surface-50">{set.reps} reps</span>
                      <span className="text-surface-600 text-xs">@</span>
                      <span className="text-surface-50">{set.weight} {set.weightUnit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <h2 className="text-surface-300 font-semibold mb-3">
        Sessions
        {sessions.length > 0 && (
          <span className="text-surface-500 font-normal text-sm ml-2">({sessions.length})</span>
        )}
      </h2>

      <div className="flex flex-col gap-2 flex-1">
        {sortedSessions.length === 0 ? (
          <p className="text-surface-500 text-sm text-center mt-4">No sessions yet for this workout.</p>
        ) : (
          sortedSessions.map(s => {
            const badge = statusBadge(s.status)
            const setTotal = setCountBySession.get(s.id) ?? 0
            const setCompleted = completedSetCountBySession.get(s.id) ?? 0
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/sessions/${s.id}`)}
                className="flex flex-col gap-1 bg-surface-800 rounded-xl p-4 text-left w-full active:bg-surface-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-surface-400 text-xs">{formatDate(s.startTime)}</span>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                {s.status !== 'completed' && (
                  <div className="flex gap-4 text-surface-500 text-xs mt-1">
                    <span>{setCompleted}/{setTotal} sets done</span>
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
