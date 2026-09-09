import { mkdirSync } from 'node:fs'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { config } from './config.ts'

export interface AuthUser {
  id: string
  email: string
}

interface UserRow {
  id: string
  email: string
  salt: string
  hash: string
  created_at: number
}

const SESSION_TTL_MS = config.sessionDays * 24 * 60 * 60 * 1000

let db: DatabaseSync | null = null

function open(): DatabaseSync {
  if (db) return db
  mkdirSync(config.dataDir, { recursive: true })
  db = new DatabaseSync(join(config.dataDir, 'auth.sqlite'))
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
  return db
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

function verifyPassword(password: string, salt: string, expected: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), 'hex')
  const wanted = Buffer.from(expected, 'hex')
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function createUser(email: string, password: string): AuthUser | null {
  const d = open()
  const salt = randomBytes(16).toString('hex')
  const hash = hashPassword(password, salt)
  const id = randomBytes(16).toString('hex')
  const result = d
    .prepare('INSERT INTO users (id, email, salt, hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, salt, hash, Date.now())
  if (result.changes !== 1) return null
  return { id, email }
}

export function verifyUser(email: string, password: string): AuthUser | null {
  const d = open()
  const row = d.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined
  if (!row) return null
  if (!verifyPassword(password, row.salt, row.hash)) return null
  return { id: row.id, email: row.email }
}

export function issueSession(userId: string): string {
  const d = open()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + SESSION_TTL_MS
  d.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(sha256(token), userId, expiresAt, Date.now())
  // Best-effort: drop this user's expired sessions.
  d.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').run(userId, Date.now())
  return token
}

export function revokeSession(token: string): void {
  const d = open()
  d.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
}

export function userFromSession(token: string): AuthUser | null {
  const d = open()
  const row = d
    .prepare(
      `SELECT u.id AS id, u.email AS email
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), Date.now()) as Pick<UserRow, 'id' | 'email'> | undefined
  return row ? { id: row.id, email: row.email } : null
}
