import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import PlaylistOverview from './pages/PlaylistOverview'
import PlaylistDetail from './pages/PlaylistDetail'
import PlaylistEdit from './pages/PlaylistEdit'
import SessionView from './pages/SessionView'
import WorkoutMode from './pages/WorkoutMode'
import SessionHistory from './pages/SessionHistory'
import SessionDetail from './pages/SessionDetail'
import ProgramsOverview from './pages/ProgramsOverview'
import ProgramDetail from './pages/ProgramDetail'
import AuthScreen from './components/AuthScreen'
import { useAuth } from './auth'

export default function App() {
  const { user, status } = useAuth()
  const version = document.querySelector('meta[name="build-version"]')?.getAttribute('content')

  if (status === 'loading') {
    return (
      <div className="min-h-dvh bg-surface-950 flex items-center justify-center">
        <p className="text-surface-500">Loading…</p>
      </div>
    )
  }

  if (!user) return <AuthScreen />

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/programs" element={<ProgramsOverview />} />
        <Route path="/programs/:id" element={<ProgramDetail />} />
        <Route path="/playlists" element={<PlaylistOverview />} />
        <Route path="/playlists/new" element={<PlaylistEdit />} />
        <Route path="/playlists/:id/edit" element={<PlaylistEdit />} />
        <Route path="/playlists/:id/session" element={<SessionView />} />
        <Route path="/playlists/:id" element={<PlaylistDetail />} />
        <Route path="/workout/:sessionId" element={<WorkoutMode />} />
        <Route path="/sessions" element={<SessionHistory />} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {version && (
        <div className="fixed bottom-0 left-0 right-0 text-center text-surface-600 text-xs py-1 pointer-events-none">
          {version}
        </div>
      )}
    </>
  )
}
