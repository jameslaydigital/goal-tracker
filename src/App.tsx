import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import PlaylistOverview from './pages/PlaylistOverview'
import PlaylistEdit from './pages/PlaylistEdit'
import SessionView from './pages/SessionView'
import WorkoutMode from './pages/WorkoutMode'
import SessionHistory from './pages/SessionHistory'
import SessionDetail from './pages/SessionDetail'

export default function App() {
  const version = document.querySelector('meta[name="build-version"]')?.getAttribute('content')

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/playlists" element={<PlaylistOverview />} />
        <Route path="/playlists/new" element={<PlaylistEdit />} />
        <Route path="/playlists/:id/edit" element={<PlaylistEdit />} />
        <Route path="/playlists/:id/session" element={<SessionView />} />
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
