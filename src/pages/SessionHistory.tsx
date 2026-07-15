import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

export default function SessionHistory() {
  const navigate = useNavigate()
  const sessions = useLiveQuery(() => db.sessions.toArray())
  const allExercises = useLiveQuery(() => db.sessionExercises.toArray())
  const allSets = useLiveQuery(() => db.sessionSets.toArray())

  const exerciseCountBySession = new Map<string, number>()
  const setCountBySession = new Map<string, number>()
  const completedSetCountBySession = new Map<string, number>()

  allExercises?.forEach(e => {
    exerciseCountBySession.set(e.sessionId, (exerciseCountBySession.get(e.sessionId) ?? 0) + 1)
  })

  allSets?.forEach(s => {
    setCountBySession.set(s.sessionId, (setCountBySession.get(s.sessionId) ?? 0) + 1)
    if (s.completed) {
      completedSetCountBySession.set(s.sessionId, (completedSetCountBySession.get(s.sessionId) ?? 0) + 1)
    }
  })

  const sorted = [...(sessions ?? [])].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  )

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

  return (
    <div className="min-h-dvh bg-surface-950 flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/')} className="text-surface-400 hover:text-surface-200 transition-colors">
          &larr; Dashboard
        </button>
        <h1 className="text-xl font-bold text-surface-50">Sessions</h1>
        <div className="w-12" />
      </div>

      <div className="flex flex-col gap-3 flex-1">
        {!sessions || sessions.length === 0 ? (
          <p className="text-surface-500 text-center mt-12">
            No sessions yet. Start a workout to create one!
          </p>
        ) : (
          sorted.map(s => {
            const badge = statusBadge(s.status)
            const exCount = exerciseCountBySession.get(s.id) ?? 0
            const setTotal = setCountBySession.get(s.id) ?? 0
            const setCompleted = completedSetCountBySession.get(s.id) ?? 0

            return (
              <button
                key={s.id}
                onClick={() => navigate(`/sessions/${s.id}`)}
                className="flex flex-col gap-1 bg-surface-800 rounded-xl p-4 text-left w-full active:bg-surface-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-surface-50 font-semibold">{s.playlistName}</h2>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-surface-400 text-xs">{formatDate(s.startTime)}</p>
                <div className="flex gap-4 text-surface-500 text-xs mt-1">
                  <span>{exCount} exercise{exCount !== 1 ? 's' : ''}</span>
                  <span>{setCompleted}/{setTotal} sets done</span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
