import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'

type Mode = 'signin' | 'signup'

export default function AuthScreen() {
  const { signIn, signUp, error, syncing } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const shownError = localError ?? error

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setLocalError(null)
    try {
      if (mode === 'signin') await signIn(email, password)
      else await signUp(email, password)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-surface-950 flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-surface-50">Workout Tracker</h1>
        <p className="text-surface-400 text-sm mt-1">
          {mode === 'signin' ? 'Sign in to access your workouts' : 'Create an account to get started'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
        <input
          type="email"
          required
          autoCapitalize="none"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-surface-800 text-surface-50 placeholder:text-surface-500 outline-none focus:ring-2 focus:ring-surface-500"
        />
        <input
          type="password"
          required
          minLength={mode === 'signup' ? 8 : undefined}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-surface-800 text-surface-50 placeholder:text-surface-500 outline-none focus:ring-2 focus:ring-surface-500"
        />

        {shownError && <p className="text-red-400 text-sm text-center">{shownError}</p>}

        <button
          type="submit"
          disabled={busy || syncing}
          className="w-full py-4 px-6 rounded-xl bg-surface-50 text-surface-900 text-lg font-semibold active:bg-surface-200 transition-colors disabled:opacity-60"
        >
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
          setLocalError(null)
        }}
        className="text-surface-400 text-sm underline"
      >
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}
