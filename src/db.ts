import Dexie, { type EntityTable, type Table, type Transaction } from 'dexie'
import type { Playlist, Program, Session, SessionExercise, ExerciseSet } from './types'

export const DATA_TABLES = ['playlists', 'programs', 'sessions', 'sessionExercises', 'sessionSets'] as const
export type DataTable = (typeof DATA_TABLES)[number]

export interface SyncMetaRow {
  key: string
  value: string
}

export interface SyncOutboxEntry {
  seq: number
  tab: DataTable
  id: string
  op: 'put' | 'delete'
  ts: number
}

export type SyncOutboxInput = Omit<SyncOutboxEntry, 'seq'>

export const db = new Dexie('GoalTracker') as Dexie & {
  playlists: EntityTable<Playlist, 'id'>
  programs: EntityTable<Program, 'id'>
  sessions: EntityTable<Session, 'id'>
  sessionExercises: EntityTable<SessionExercise, 'id'>
  sessionSets: EntityTable<ExerciseSet, 'id'>
  __syncOutbox: Table<SyncOutboxEntry, number, SyncOutboxInput>
  __syncMeta: Table<SyncMetaRow, string>
}

db.version(1).stores({
  playlists: 'id',
  sessions: 'id',
  sessionExercises: 'id, sessionId',
  sessionSets: 'id, exerciseId, sessionId',
})

db.version(2).stores({
  playlists: 'id',
  sessions: 'id',
  sessionExercises: 'id, sessionId',
  sessionSets: 'id, exerciseId, sessionId',
  __syncOutbox: '++seq, tab',
  __syncMeta: 'key',
})

db.version(3).stores({
  playlists: 'id',
  programs: 'id',
  sessions: 'id',
  sessionExercises: 'id, sessionId',
  sessionSets: 'id, exerciseId, sessionId',
  __syncOutbox: '++seq, tab',
  __syncMeta: 'key',
})

// ---- Sync instrumentation -------------------------------------------------
//
// Every write to a data table is stamped with a wall-clock `_ts` and logged to
// an outbox so the sync engine can upload it later. The two flags below let
// the sync engine suppress that bookkeeping while it applies changes that came
// from the server (no echo) or re-stamps rows during a one-time baseline.

let stampTsEnabled = true
let logOutboxEnabled = true

export function setStampTsEnabled(enabled: boolean): void {
  stampTsEnabled = enabled
}

export function setLogOutboxEnabled(enabled: boolean): void {
  logOutboxEnabled = enabled
}

type LooseTable = Table<Record<string, unknown>, string, Record<string, unknown>>

function looseTable(name: DataTable): LooseTable {
  return (db as unknown as Record<DataTable, LooseTable>)[name]
}

// Outbox rows can't be written inside the data table's transaction (implicit
// single-table writes don't include __syncOutbox in scope), so each mutation
// is logged once the transaction has committed.
function logOutbox(tx: Transaction | undefined, tab: DataTable, id: string, op: 'put' | 'delete', ts: number): void {
  const entry: SyncOutboxInput = { tab, id, op, ts }
  const add = () => {
    void db.__syncOutbox.add(entry)
  }
  if (tx) {
    tx.on('complete', add)
  } else {
    add()
  }
}

for (const tab of DATA_TABLES) {
  const table = looseTable(tab)

  table.hook('creating', (primKey, obj, tx) => {
    if (!stampTsEnabled) return
    const ts = Date.now()
    obj['_ts'] = ts
    if (logOutboxEnabled) logOutbox(tx, tab, String(primKey), 'put', ts)
  })

  table.hook('updating', (_mods, primKey, _obj, tx) => {
    if (!stampTsEnabled) return undefined
    const ts = Date.now()
    if (logOutboxEnabled) logOutbox(tx, tab, String(primKey), 'put', ts)
    return { _ts: ts }
  })

  table.hook('deleting', (primKey, _obj, tx) => {
    if (!logOutboxEnabled) return undefined
    logOutbox(tx, tab, String(primKey), 'delete', Date.now())
    return undefined
  })
}

// ---- Local sync metadata --------------------------------------------------

const META_LAST_REV = 'lastRev'
const META_BASELINE = 'baselineDone'

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.__syncMeta.get(key)
  return row?.value ?? null
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.__syncMeta.put({ key, value })
}

export async function deleteMeta(key: string): Promise<void> {
  await db.__syncMeta.delete(key)
}

export async function lastPulledRev(): Promise<number> {
  const v = await getMeta(META_LAST_REV)
  return v ? Number(v) : 0
}

export async function setLastPulledRev(rev: number): Promise<void> {
  await setMeta(META_LAST_REV, String(rev))
}

export async function outboxEntries(): Promise<SyncOutboxEntry[]> {
  return db.__syncOutbox.orderBy('seq').toArray()
}

export async function clearOutboxUpTo(maxSeq: number): Promise<void> {
  await db.__syncOutbox.where('seq').belowOrEqual(maxSeq).delete()
}

// ---- Data lifecycle --------------------------------------------------------

// One-time migration/registration: any local rows that predate the sync
// instrumentation (no `_ts`) are stamped and queued for upload so a brand-new
// server account starts with a full snapshot of what this device already had.
// Rows written after the upgrade already carry `_ts` and an outbox entry, so
// they are left untouched.
export async function baselineLocalData(): Promise<void> {
  if (await getMeta(META_BASELINE)) return

  const queue: Array<{ tab: DataTable; id: string }> = []
  setLogOutboxEnabled(false)
  try {
    for (const tab of DATA_TABLES) {
      const t = looseTable(tab)
      const rows = await t.toArray()
      const legacy = rows.filter((r) => typeof r['_ts'] !== 'number')
      if (legacy.length === 0) continue
      await t.bulkPut(legacy)
      for (const r of legacy) queue.push({ tab, id: String(r['id']) })
    }
  } finally {
    setLogOutboxEnabled(true)
  }

  const entries: SyncOutboxInput[] = []
  for (const tab of DATA_TABLES) {
    const rows = await looseTable(tab).toArray()
    const wanted = new Set(queue.filter((q) => q.tab === tab).map((q) => q.id))
    for (const row of rows) {
      if (!wanted.has(String(row['id']))) continue
      const ts = typeof row['_ts'] === 'number' ? (row['_ts'] as number) : Date.now()
      entries.push({ tab, id: String(row['id']), op: 'put', ts })
    }
  }

  for (let i = 0; i < entries.length; i += 500) {
    await db.__syncOutbox.bulkAdd(entries.slice(i, i + 500))
  }
  await setMeta(META_BASELINE, '1')
}

// Drop everything locally. Used when a different account signs in on this
// device — the previous account's local copy must not bleed into the new one.
export async function wipeLocalData(): Promise<void> {
  setStampTsEnabled(false)
  setLogOutboxEnabled(false)
  try {
    for (const tab of DATA_TABLES) {
      await looseTable(tab).clear()
    }
    await db.__syncOutbox.clear()
    await db.__syncMeta.clear()
  } finally {
    setStampTsEnabled(true)
    setLogOutboxEnabled(true)
  }
}
