import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ApiError, api, type AuthUser } from './api'
import { baselineLocalData, wipeLocalData } from './db'
import { syncOnce } from './sync'

const OWNER_KEY = 'goal-tracker.account'
const USER_KEY = 'goal-tracker.user'

interface AuthState {
  user: AuthUser | null
  status: 'loading' | 'ready'
  syncing: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function errorMessage(err: unknown): string {
  return err instanceof ApiError && err.message ? err.message : 'Something went wrong. Try again.'
}

function persistUser(u: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(u))
}

// Keep local data scoped to whichever account last used this device. If a
// different account signs in, drop the previous account's local copy — it
// belongs to them and lives on the server.
async function adoptUser(u: AuthUser): Promise<void> {
  const owner = localStorage.getItem(OWNER_KEY)
  if (owner && owner !== u.id) await wipeLocalData()
  localStorage.setItem(OWNER_KEY, u.id)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Restore an existing session on load.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { user: u } = await api.me()
        if (cancelled) return
        await adoptUser(u)
        persistUser(u)
        setUser(u)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          // Server is reachable and this session is gone — ask to sign in.
          localStorage.removeItem(USER_KEY)
          setUser(null)
        } else {
          // Offline: trust the last account that used this device so the app
          // stays usable without a connection. Edits sync later.
          const cached = localStorage.getItem(USER_KEY)
          if (cached) {
            try {
              setUser(JSON.parse(cached) as AuthUser)
            } catch {
              localStorage.removeItem(USER_KEY)
              setUser(null)
            }
          } else {
            setUser(null)
          }
        }
      } finally {
        if (!cancelled) setStatus('ready')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // While signed in: baseline once, then keep pushing/pulling.
  useEffect(() => {
    if (!user) return
    let disposed = false
    let running = false

    const run = async () => {
      if (running || disposed) return
      running = true
      try {
        setSyncing(true)
        await baselineLocalData()
        await syncOnce()
      } catch (err) {
        console.warn('[sync]', err)
      } finally {
        running = false
        if (!disposed) setSyncing(false)
      }
    }

    void run()
    const interval = window.setInterval(() => void run(), 30_000)
    const onOnline = () => void run()
    const onVisible = () => {
      if (!document.hidden) void run()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user])

  async function authenticated(u: AuthUser): Promise<void> {
    await adoptUser(u)
    persistUser(u)
    setError(null)
    setUser(u)
  }

  const signIn = async (email: string, password: string) => {
    try {
      const { user: u } = await api.login(email, password)
      await authenticated(u)
    } catch (err) {
      setError(errorMessage(err))
      throw err
    }
  }

  const signUp = async (email: string, password: string) => {
    try {
      const { user: u } = await api.signup(email, password)
      await authenticated(u)
    } catch (err) {
      setError(errorMessage(err))
      throw err
    }
  }

  const signOut = async () => {
    try {
      await syncOnce() // flush pending edits before leaving
    } catch {
      // offline: keep local data for the next sign-in as this account
    }
    try {
      await api.logout()
    } catch {
      // ignore — the session cookie may already be gone
    }
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, status, syncing, error, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
