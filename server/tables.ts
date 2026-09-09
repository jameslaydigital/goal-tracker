// Logical table names mirrored by the client (src/db.ts). Rows from any of
// these tables are replicated verbatim (JSON body) into a per-user sqlite DB.
export const DATA_TABLES = ['playlists', 'sessions', 'sessionExercises', 'sessionSets'] as const

export type DataTable = (typeof DATA_TABLES)[number]

export function isDataTable(value: unknown): value is DataTable {
  return typeof value === 'string' && (DATA_TABLES as readonly string[]).includes(value)
}

export function isRowId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
}

export function isFiniteInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
