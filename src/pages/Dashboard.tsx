import { useNavigate } from 'react-router-dom'
import { exportSessionsToCSV } from '../utils'

export default function Dashboard() {
  const navigate = useNavigate()

  return (
    <div className="min-h-dvh bg-surface-950 flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold text-surface-50">Welcome, James!</h1>
      <p className="text-surface-400 text-sm">What would you like to do?</p>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <button
          onClick={() => navigate('/playlists')}
          className="w-full py-4 px-6 rounded-xl bg-surface-800 text-surface-50 text-lg font-semibold active:bg-surface-700 transition-colors"
        >
          Workouts
        </button>

        <button
          onClick={() => navigate('/sessions')}
          className="w-full py-4 px-6 rounded-xl bg-surface-800 text-surface-50 text-lg font-semibold active:bg-surface-700 transition-colors"
        >
          Sessions
        </button>

        <div className="flex flex-col gap-2">
          <button
            disabled
            className="w-full py-4 px-6 rounded-xl bg-surface-800/50 text-surface-500 text-lg font-semibold cursor-not-allowed"
          >
            Reports
          </button>
          <p className="text-surface-600 text-xs text-center">Coming soon</p>
        </div>

        <hr className="border-surface-800 my-2" />

        <button
          onClick={exportSessionsToCSV}
          className="w-full py-3 px-6 rounded-xl border border-surface-700 text-surface-300 text-sm font-medium active:bg-surface-800 transition-colors"
        >
          Export Data (CSV)
        </button>
      </div>
    </div>
  )
}
