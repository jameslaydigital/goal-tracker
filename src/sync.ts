import type { Table } from 'dexie'
import { api, type SyncRow } from './api.ts'
import {
  db,
  DATA_TABLES,
  type DataTable,
  type SyncOutboxEntry,
  clearOutboxUpTo,
  lastPulledRev,
  outboxEntries,
  setLastPulledRev,
  setLogOutboxEnabled,
  setStampTsEnabled,
} from './db.ts'

type LooseRow = Record<string, unknown>
type LooseTable = Table<LooseRow, string>

function looseTable(name: DataTable): LooseTable {
  return (db as unknown as Record<DataTable, LooseTable>)[name]
}

function isDataTable(value: string): value is DataTable {
  return (DATA_TABLES as readonly string[]).includes(value)
}

interface PushMutation {
  table: DataTable
  id: string
  ts: number
  deleted: boolean
  body: unknown
}

const PUSH_BATCH = 800

// Fold the outbox down to the latest operation per row, reading put bodies
// from live table state so we always upload the current contents.
async function pushMutations(entries: SyncOutboxEntry[]): Promise<PushMutation[]> {
  const last = new Map<string, SyncOutboxEntry>()
  for (const e of entries) last.set(`${e.tab}:${e.id}`, e)

  const mutations: PushMutation[] = []
  for (const e of last.values()) {
    if (e.op === 'delete') {
      mutations.push({ table: e.tab, id: e.id, ts: e.ts, deleted: true, body: null })
    } else {
      const row = await looseTable(e.tab).get(e.id)
      if (!row) continue // superseded by a later delete; safe to skip
      const ts = typeof row['_ts'] === 'number' ? (row['_ts'] as number) : e.ts
      mutations.push({ table: e.tab, id: e.id, ts, deleted: false, body: row })
    }
  }
  return mutations
}

export async function pushOnce(): Promise<number> {
  const entries = await outboxEntries()
  if (entries.length === 0) return 0
  const maxSeq = entries[entries.length - 1].seq

  const mutations = await pushMutations(entries)
  for (let i = 0; i < mutations.length; i += PUSH_BATCH) {
    await api.push(mutations.slice(i, i + PUSH_BATCH))
  }
  await clearOutboxUpTo(maxSeq)
  return mutations.length
}

async function applyRow(row: SyncRow): Promise<void> {
  if (!isDataTable(row.table)) return
  const t = looseTable(row.table)
  if (row.deleted) {
    const existing = await t.get(row.id)
    if (existing && typeof existing['_ts'] === 'number' && (existing['_ts'] as number) > row.ts) return
    await t.delete(row.id)
  } else {
    if (!row.body) return
    const obj = JSON.parse(row.body) as LooseRow
    const ts = typeof obj['_ts'] === 'number' ? (obj['_ts'] as number) : row.ts
    const existing = await t.get(row.id)
    if (existing && typeof existing['_ts'] === 'number' && (existing['_ts'] as number) > ts) return
    await t.put(obj)
  }
}

export async function pullOnce(): Promise<number> {
  let since = await lastPulledRev()
  let applied = 0
  setStampTsEnabled(false)
  setLogOutboxEnabled(false)
  try {
    for (;;) {
      const { rows } = await api.pull(since, 500)
      if (rows.length === 0) break
      for (const row of rows) {
        await applyRow(row)
        applied += 1
      }
      since = rows[rows.length - 1].rev
      await setLastPulledRev(since)
    }
  } finally {
    setStampTsEnabled(true)
    setLogOutboxEnabled(true)
  }
  return applied
}

// One full cycle: upload local changes, then fetch whatever the server has.
export async function syncOnce(): Promise<void> {
  await pushOnce()
  await pullOnce()
}
