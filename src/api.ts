export interface AuthUser {
  id: string
  email: string
}

export interface SyncRow {
  table: 'playlists' | 'sessions' | 'sessionExercises' | 'sessionSets'
  id: string
  body: string | null
  ts: number
  deleted: boolean
  rev: number
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Check your connection and try again.')
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore parse errors, keep the generic message
    }
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as T
}

export interface AuthResponse {
  user: AuthUser
}

export const api = {
  me: () => request<AuthResponse>('/api/auth/me'),
  signup: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  push: (mutations: unknown) =>
    request<{ applied: number }>('/api/sync/push', { method: 'POST', body: JSON.stringify({ mutations }) }),
  pull: (since: number, limit: number) =>
    request<{ rows: SyncRow[]; curRev: number }>('/api/sync/pull', {
      method: 'POST',
      body: JSON.stringify({ since, limit }),
    }),
}
