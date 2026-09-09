import { Router, type Request, type Response, type NextFunction } from 'express'
import { config } from './config.ts'
import {
  createUser,
  normalizeEmail,
  isValidEmail,
  issueSession,
  revokeSession,
  userFromSession,
  verifyUser,
  type AuthUser,
} from './globaldb.ts'

const COOKIE = 'sid'
const MIN_PASSWORD_LENGTH = 8

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

function setSessionCookie(res: Response, token: string): void {
  const maxAge = config.sessionDays * 24 * 60 * 60
  let cookie = `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  if (config.cookieSecure) cookie += '; Secure'
  res.setHeader('Set-Cookie', cookie)
}

function clearSessionCookie(res: Response): void {
  let cookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  if (config.cookieSecure) cookie += '; Secure'
  res.setHeader('Set-Cookie', cookie)
}

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: message })
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = parseCookies(req)[COOKIE]
  const user = token ? userFromSession(token) : null
  if (!user) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }
  res.locals.user = user as AuthUser
  next()
}

export function authUser(res: Response): AuthUser {
  return res.locals.user as AuthUser
}

export const authRouter = Router()

authRouter.post('/signup', (req, res) => {
  const email = normalizeEmail(String(req.body?.email ?? ''))
  const password = String(req.body?.password ?? '')
  if (!isValidEmail(email)) return badRequest(res, 'Enter a valid email address.')
  if (password.length < MIN_PASSWORD_LENGTH) {
    return badRequest(res, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  const user = createUser(email, password)
  if (!user) return res.status(409).json({ error: 'An account with that email already exists.' })
  setSessionCookie(res, issueSession(user.id))
  res.status(201).json({ user })
})

authRouter.post('/login', (req, res) => {
  const email = normalizeEmail(String(req.body?.email ?? ''))
  const password = String(req.body?.password ?? '')
  const user = email && password ? verifyUser(email, password) : null
  if (!user) return res.status(401).json({ error: 'Incorrect email or password.' })
  setSessionCookie(res, issueSession(user.id))
  res.json({ user })
})

authRouter.post('/logout', (req, res) => {
  const token = parseCookies(req)[COOKIE]
  if (token) revokeSession(token)
  clearSessionCookie(res)
  res.json({ ok: true })
})

authRouter.get('/me', (req, res) => {
  const token = parseCookies(req)[COOKIE]
  const user = token ? userFromSession(token) : null
  if (!user) return res.status(401).json({ error: 'Not signed in' })
  res.json({ user })
})
