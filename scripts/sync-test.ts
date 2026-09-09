// End-to-end smoke test for the offline-first sync layer. Runs the real client
// modules (src/db.ts, src/sync.ts) against a live local server and fake
// IndexedDB. Not part of the test suite — invoke manually:
//
//   npm run sync:test
//
// Requires the server running on PORT (default 8080):
//   DATA_DIR=$(mktemp -d) node server/index.ts &

import 'fake-indexeddb/auto'
import { randomUUID } from 'node:crypto'
import { api, type SyncRow } from '../src/api.ts'
import {
  db,
  baselineLocalData,
  deleteMeta,
  outboxEntries,
  setLogOutboxEnabled,
  setStampTsEnabled,
  wipeLocalData,
} from '../src/db.ts'
import { pushOnce, pullOnce } from '../src/sync.ts'
import type { Playlist } from '../src/types.ts'

// Minimal localStorage shim (only auth.tsx needs it; Node lacks it).
const memStore = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => memStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memStore.set(k, v),
    removeItem: (k: string) => void memStore.delete(k),
  },
})

const BASE = `http://localhost:${process.env.PORT ?? 8080}`
const cookies = new Map<string, string>()

async function until(fn: () => Promise<boolean>, label: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return
    await new Promise((r) => setTimeout(r, 25))
  }
  check(false, `${label} (timed out)`)
}

// The API client targets same-origin relative paths; rewrite for Node and
// maintain a cookie jar (Node fetch does not persist cookies).
const nativeFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL | string, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const resolved = url.startsWith('/') ? `${BASE}${url}` : url
  const headers = new Headers(init?.headers)
  if (cookies.size > 0) {
    headers.set(
      'cookie',
      [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    )
  }
  const res = await nativeFetch(resolved, { ...init, headers })
  const setCookies: string[] = (res as Response).headers.getSetCookie?.() ?? []
  for (const sc of setCookies) {
    const [pair] = sc.split(';')
    const eq = pair.indexOf('=')
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (value && value !== '') cookies.set(name, value)
    else if (value === '') cookies.delete(name)
  }
  return res
}) as typeof fetch

let failures = 0
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  ok — ${label}`)
  } else {
    failures += 1
    console.error(`  FAIL — ${label}`)
  }
}

function playlist(name: string): Playlist {
  return { id: randomUUID(), name, exercises: [] }
}

async function signupUnique(): Promise<void> {
  const email = `t${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  await api.signup(email, 'password1')
  localStorage.setItem('goal-tracker.account', '')
}

async function serverPull(): Promise<SyncRow[]> {
  const all: SyncRow[] = []
  let since = 0
  for (;;) {
    const { rows } = await api.pull(since, 500)
    if (!rows.length) break
    all.push(...rows)
    since = rows[rows.length - 1].rev
  }
  return all
}

async function run(): Promise<void> {
  await signupUnique()
  await wipeLocalData() // start clean
  await db.open()

  const p1 = playlist('Leg day')
  await db.playlists.add(p1)
  await baselineLocalData()

  console.log('[1] local create is queued and pushed')
  await until(async () => (await outboxEntries()).length === 1, 'outbox has 1 put')
  const entries = await outboxEntries()
  check(entries.length === 1 && entries[0].op === 'put' && entries[0].id === p1.id, 'outbox has 1 put')
  const pushed = await pushOnce()
  check(pushed === 1, `pushOnce uploaded ${pushed} mutation`)
  let rows = await serverPull()
  check(rows.length === 1 && !rows[0].deleted && rows[0].body?.includes('Leg day'), 'server has the playlist')

  console.log('[2] local update is pushed (single watermark)')
  await db.playlists.update(p1.id, { name: 'Leg day v2' })
  await pushOnce()
  rows = await serverPull()
  check(rows.length === 1 && rows[0].body?.includes('Leg day v2'), 'server has the update')

  console.log('[3] remote change (other device) applies locally without echo')
  const remoteBody = { ...p1, name: 'Renamed remotely', _ts: Date.now() + 10_000 }
  await api.push([{ table: 'playlists', id: p1.id, ts: remoteBody._ts, deleted: false, body: remoteBody }])
  await pullOnce()
  const localAfterRemote = await db.playlists.get(p1.id)
  check(localAfterRemote?.name === 'Renamed remotely', 'local row updated from server')
  check((await outboxEntries()).length === 0, 'applying remote did not create outbox echo')

  console.log('[4] remote delete removes the row locally')
  await api.push([{ table: 'playlists', id: p1.id, ts: remoteBody._ts + 1, deleted: true }])
  await pullOnce()
  check((await db.playlists.get(p1.id)) === undefined, 'row deleted locally after remote tombstone')
  check((await outboxEntries()).length === 0, 'remote delete produced no echo')

  console.log('[5] local delete propagates a tombstone')
  const p2 = playlist('Push day')
  await db.playlists.add(p2)
  await pushOnce()
  await db.playlists.delete(p2.id)
  await until(async () => (await outboxEntries()).length === 1, 'delete logged to outbox')
  const before = (await outboxEntries()).length
  check(before === 1, 'delete logged to outbox')
  await pushOnce()
  rows = await serverPull()
  const tomb = rows.find((r) => r.id === p2.id)
  check(tomb?.deleted === true, 'server holds a tombstone for the deleted row')

  console.log('[6] all four tables round-trip')
  const session = { id: randomUUID(), playlistId: p1.id, playlistName: 'x', startTime: new Date().toISOString(), status: 'completed' as const, playheadExerciseIndex: 0, playheadSetIndex: 0 }
  const ex = { id: randomUUID(), sessionId: session.id, name: 'bench', order: 0 }
  const set = { id: randomUUID(), exerciseId: ex.id, sessionId: session.id, sessionName: 'x', exerciseName: 'bench', order: 0, reps: 10, weight: 135, weightUnit: 'lbs', completed: true, completedAt: new Date().toISOString(), logged: true }
  await db.sessions.add(session)
  await db.sessionExercises.add(ex)
  await db.sessionSets.add(set)
  await pushOnce()
  rows = await serverPull()
  const byTable = (t: string) => rows.filter((r) => r.table === t && !r.deleted).length
  check(
    byTable('sessions') === 1 && byTable('sessionExercises') === 1 && byTable('sessionSets') === 1,
    `sessions/exercises/sets round-trip (${byTable('sessions')}/${byTable('sessionExercises')}/${byTable('sessionSets')})`,
  )

  console.log('[7] fresh-device restore (wipe then pull)')
  await wipeLocalData()
  await db.open()
  const empty = (await db.playlists.toArray()).length + (await db.sessions.toArray()).length
  check(empty === 0, 'local wiped clean')
  await baselineLocalData()
  await pullOnce()
  const restored =
    (await db.playlists.toArray()).length +
    (await db.sessions.toArray()).length +
    (await db.sessionExercises.toArray()).length +
    (await db.sessionSets.toArray()).length
  check(restored === 3, `restored ${restored} rows from server after wipe (expected 3)`)

  console.log('[8] legacy (pre-upgrade) rows are migrated on baseline')
  // Simulate a row written before sync instrumentation: no _ts, no outbox.
  setStampTsEnabled(false)
  setLogOutboxEnabled(false)
  try {
    const legacy = playlist('Legacy workout')
    await db.playlists.add(legacy)
  } finally {
    setStampTsEnabled(true)
    setLogOutboxEnabled(true)
  }
  check((await outboxEntries()).length === 0, 'legacy write produced no outbox entry')
  await deleteMeta('baselineDone')
  await baselineLocalData()
  await until(async () => (await outboxEntries()).length === 1, 'baseline queued exactly the legacy row')
  const queued = await outboxEntries()
  check(queued.length === 1 && queued[0].op === 'put', 'baseline queued exactly the legacy row')
  await pushOnce()
  rows = await serverPull()
  const migrated = rows.some((r) => !r.deleted && r.body?.includes('Legacy workout'))
  check(migrated, 'legacy row reached the server')

  // reset owner marker
  localStorage.removeItem('goal-tracker.account')

  if (failures === 0) {
    console.log('\nALL SYNC CHECKS PASSED')
  } else {
    console.error(`\n${failures} CHECK(S) FAILED`)
    process.exitCode = 1
  }
}

void run().catch((err) => {
  console.error('Fatal:', err)
  process.exitCode = 1
})
