import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { generateId } from '../utils'
import type { Session, SessionExercise, ExerciseSet } from '../types'

export default function PlaylistOverview() {
  const navigate = useNavigate()
  const playlists = useLiveQuery(() => db.playlists.toArray())

  async function startSession(playlistId: string) {
    const playlist = playlists?.find(p => p.id === playlistId)
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

    const sessionExercises: SessionExercise[] = playlist.exercises
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

  return (
    <div className="min-h-dvh bg-surface-950 flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <Link to="/" className="text-surface-400 hover:text-surface-200 transition-colors">
          &larr; Dashboard
        </Link>
        <h1 className="text-xl font-bold text-surface-50">Playlists</h1>
        <div className="w-12" />
      </div>

      <div className="flex flex-col gap-3 flex-1">
        {!playlists || playlists.length === 0 ? (
          <p className="text-surface-500 text-center mt-12">No playlists yet. Create one!</p>
        ) : (
          playlists.map(playlist => (
            <div
              key={playlist.id}
              className="flex items-center gap-3 bg-surface-800 rounded-xl p-4"
            >
              <Link to={`/playlists/${playlist.id}/session`} className="flex-1">
                <h2 className="text-surface-50 font-semibold">{playlist.name}</h2>
                <p className="text-surface-400 text-xs">
                  {playlist.exercises.length} exercise{playlist.exercises.length !== 1 ? 's' : ''}
                </p>
              </Link>
              <button
                onClick={() => startSession(playlist.id)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium active:bg-blue-500 transition-colors"
              >
                Play
              </button>
              <button
                onClick={() => navigate(`/playlists/${playlist.id}/edit`)}
                className="px-4 py-2 rounded-lg bg-surface-700 text-surface-200 text-sm font-medium active:bg-surface-600 transition-colors"
              >
                Edit
              </button>
            </div>
          ))
        )}

        <button
          onClick={() => navigate('/playlists/new')}
          className="w-full py-4 px-6 rounded-xl border-2 border-dashed border-surface-700 text-surface-400 text-lg font-medium active:bg-surface-800 transition-colors mt-4"
        >
          + Create New Playlist
        </button>
      </div>
    </div>
  )
}
