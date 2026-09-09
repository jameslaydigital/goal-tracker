import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { config } from './config.ts'
import { isDataTable, isRowId } from './tables.ts'
import { buildStarterPrograms } from './seed.ts'

// One sqlite file per user, holding every replicated row across all logical
// tables. Rows are opaque JSON bodies; the (tab, id) pair is the key. Each
// write bumps a global per-user revision, and clients pull everything newer
// than their last-seen revision. Last-write-wins is decided on `ts`
// (client wall clock, ms) so edits and deletes compare on equal footing.

export interface IncomingMutation {
  table: string
  id: string
  body?: unknown
  ts: number
  deleted: boolean
}

export interface SyncRow {
  table: string
  id: string
  body: string | null
  ts: number
  deleted: boolean
  rev: number
}

interface KvRow {
  body: string | null
  ts: number
  deleted: number
  rev: number
}

interface MetaRow {
  k: string
  v: string
}

const userDbs = new Map<string, DatabaseSync>()

function openUserDb(userId: string): DatabaseSync {
  let d = userDbs.get(userId)
  if (d) return d
  mkdirSync(join(config.dataDir, 'users'), { recursive: true })
  d = new DatabaseSync(join(config.dataDir, 'users', `${userId}.sqlite`))
  d.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS kv (
      tab TEXT NOT NULL,
      id TEXT NOT NULL,
      body TEXT,
      ts INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      rev INTEGER NOT NULL,
      PRIMARY KEY (tab, id)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    ) WITHOUT ROWID;
  `)
  userDbs.set(userId, d)
  return d
}

export function currentRevision(userId: string): number {
  const d = openUserDb(userId)
  const row = d.prepare('SELECT v FROM meta WHERE k = ?').get('cur_rev') as Pick<MetaRow, 'v'> | undefined
  return row ? Number(row.v) : 0
}

function validMutations(mutations: unknown): IncomingMutation[] | null {
  if (!Array.isArray(mutations) || mutations.length === 0 || mutations.length > 5000) return null
  const out: IncomingMutation[] = []
  for (const m of mutations) {
    if (typeof m !== 'object' || m === null) return null
    const { table, id, ts, deleted, body } = m as Record<string, unknown>
    if (!isDataTable(table) || !isRowId(id)) return null
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return null
    if (typeof deleted !== 'boolean') return null
    if (!deleted && (body === undefined || body === null)) return null
    if (deleted && body !== undefined && body !== null) return null
    out.push({ table, id, body, ts, deleted })
  }
  return out
}

// Applies a batch of mutations atomically. Returns the number actually
// written (mutations that lost an LWW comparison are skipped).
export function applyMutations(userId: string, rawMutations: unknown): { applied: number } | null {
  const mutations = validMutations(rawMutations)
  if (!mutations) return null

  const d = openUserDb(userId)
  const selectKv = d.prepare('SELECT body, ts, deleted, rev FROM kv WHERE tab = ? AND id = ?')
  const getRev = d.prepare('SELECT v FROM meta WHERE k = ?')
  const setRev = d.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
  const upsert = d.prepare(
    'INSERT INTO kv (tab, id, body, ts, deleted, rev) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tab, id) DO UPDATE SET body = excluded.body, ts = excluded.ts, deleted = excluded.deleted, rev = excluded.rev',
  )

  let applied = 0
  d.exec('BEGIN IMMEDIATE')
  try {
    let cur = Number(getRev.get('cur_rev')?.v ?? 0)
    for (const m of mutations) {
      const existing = selectKv.get(m.table, m.id) as KvRow | undefined

      if (m.deleted) {
        if (!existing) continue
        if (existing.ts >= m.ts) continue
        cur += 1
        upsert.run(m.table, m.id, null, m.ts, 1, cur)
        applied += 1
      } else {
        if (existing && existing.ts > m.ts) continue
        cur += 1
        upsert.run(m.table, m.id, JSON.stringify(m.body), m.ts, 0, cur)
        applied += 1
      }
    }
    setRev.run('cur_rev', String(cur))
    d.exec('COMMIT')
  } catch (err) {
    d.exec('ROLLBACK')
    throw err
  }
  return { applied }
}

export interface PullResult {
  rows: SyncRow[]
  curRev: number
}

// Returns every live (non-deleted) row of one logical table as parsed objects,
// newest revision first. Used by the CLI to inspect/edit the active workouts.
export function listTable(userId: string, table: string): Array<Record<string, unknown>> | null {
  if (!isDataTable(table)) return null
  const d = openUserDb(userId)
  const rows = d
    .prepare('SELECT body FROM kv WHERE tab = ? AND deleted = 0 ORDER BY rev DESC')
    .all(table) as unknown as Array<{ body: string }>
  return rows.map((r) => JSON.parse(r.body) as Record<string, unknown>)
}

// Inserts the starter programs exactly once per account. If the account has
// ever had programs (marker set or rows present) it never seeds again, so a
// user who deletes all their programs won't get them resurrected. Runs in its
// own transaction so two devices seeding concurrently can't double-insert.
export function seedStarterPrograms(userId: string): boolean {
  const d = openUserDb(userId)
  const getMetaRow = d.prepare('SELECT v FROM meta WHERE k = ?')
  const upsertMeta = d.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
  const countPrograms = d.prepare("SELECT COUNT(*) AS c FROM kv WHERE tab = 'programs'")
  const upsert = d.prepare(
    'INSERT INTO kv (tab, id, body, ts, deleted, rev) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tab, id) DO UPDATE SET body = excluded.body, ts = excluded.ts, deleted = excluded.deleted, rev = excluded.rev',
  )
  const MARKER = 'starter_seeded'

  d.exec('BEGIN IMMEDIATE')
  try {
    if (getMetaRow.get(MARKER)) {
      d.exec('COMMIT')
      return false
    }
    if (Number(countPrograms.get()?.c ?? 0) > 0) {
      upsertMeta.run(MARKER, '1')
      d.exec('COMMIT')
      return false
    }
    let cur = Number(getMetaRow.get('cur_rev')?.v ?? 0)
    for (const p of buildStarterPrograms()) {
      cur += 1
      upsert.run('programs', p.id, p.body, p.ts, 0, cur)
    }
    upsertMeta.run(MARKER, '1')
    upsertMeta.run('cur_rev', String(cur))
    d.exec('COMMIT')
    return true
  } catch (err) {
    d.exec('ROLLBACK')
    throw err
  }
}

export function pullChanges(userId: string, since: number, limit: number): PullResult {
  const d = openUserDb(userId)
  const rows = d
    .prepare(
      'SELECT tab, id, body, ts, deleted, rev FROM kv WHERE rev > ? ORDER BY rev ASC LIMIT ?',
    )
    .all(since, limit) as unknown as Array<KvRow & { tab: string; id: string }>

  return {
    rows: rows.map((r) => ({
      table: r.tab,
      id: r.id,
      body: r.body,
      ts: r.ts,
      deleted: r.deleted === 1,
      rev: r.rev,
    })),
    curRev: currentRevision(userId),
  }
}
