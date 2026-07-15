import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import PlaylistOverview from './pages/PlaylistOverview'
import PlaylistEdit from './pages/PlaylistEdit'
import SessionView from './pages/SessionView'
import WorkoutMode from './pages/WorkoutMode'
import SessionHistory from './pages/SessionHistory'
import SessionDetail from './pages/SessionDetail'

export default function App() {
  return (
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
  )
}
