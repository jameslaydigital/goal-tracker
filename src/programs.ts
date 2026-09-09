import { db, getMeta, setMeta } from './db.ts'
import { api } from './api.ts'
import { generateId } from './utils.ts'
import { LIMITS, programLimitError, workoutsLimitError } from './limits.ts'
import type { Exercise, ExerciseTemplateSet, Playlist, Program } from './types'

const META_SEED_REQUESTED = 'starterSeedRequested'

// ---- deep copies ----------------------------------------------------------

function cloneSet(s: ExerciseTemplateSet): ExerciseTemplateSet {
  return { id: generateId(), reps: s.reps, weight: s.weight, weightUnit: s.weightUnit, order: s.order }
}

function cloneExercise(ex: Exercise): Exercise {
  return {
    id: generateId(),
    name: ex.name,
    weightUnit: ex.weightUnit,
    order: ex.order,
    sets: ex.sets.map(cloneSet),
  }
}

// Deep copy with fresh ids everywhere. Source objects may carry a sync `_ts`
// (added by Dexie hooks); only the typed fields are copied, so it is dropped.
export function clonePlaylist(p: Playlist): Playlist {
  return { id: generateId(), name: p.name, exercises: p.exercises.map(cloneExercise) }
}

export function clonePlaylists(playlists: Playlist[]): Playlist[] {
  return playlists.map(clonePlaylist)
}

export async function currentWorkouts(): Promise<Playlist[]> {
  return db.playlists.toArray()
}

// ---- guards ---------------------------------------------------------------

function assertCanAddProgram(count: number): void {
  if (count >= LIMITS.programs) throw programLimitError()
}

function assertWorkoutCount(playlists: Playlist[]): void {
  if (playlists.length > LIMITS.workoutsPerProgram) throw workoutsLimitError()
}

// ---- dates ----------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function todayStamp(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function uniqueName(taken: Set<string>, base: string): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} (${n})`)) n += 1
  return `${base} (${n})`
}

// ---- operations -----------------------------------------------------------

function toProgram(name: string, workouts: Playlist[]): Program {
  return { id: generateId(), name: name.trim(), createdAt: new Date().toISOString(), workouts }
}

// Save a named copy of the current workouts as a brand-new program.
export async function saveCurrentWorkoutsAsProgram(name: string): Promise<Program> {
  const cleaned = name.trim()
  if (!cleaned) throw new Error('Enter a name for the program.')
  assertCanAddProgram(await db.programs.count())
  const current = await currentWorkouts()
  assertWorkoutCount(current)
  const program = toProgram(cleaned, clonePlaylists(current))
  await db.programs.add(program)
  return program
}

// Replace a program's workouts with a copy of the current workouts (same name).
export async function overrideProgramWithCurrent(program: Program): Promise<void> {
  const current = await currentWorkouts()
  assertWorkoutCount(current)
  await db.programs.update(program.id, { workouts: clonePlaylists(current) })
}

export async function renameProgram(id: string, name: string): Promise<void> {
  const cleaned = name.trim()
  if (!cleaned) throw new Error('Enter a name for the program.')
  await db.programs.update(id, { name: cleaned })
}

export async function deleteProgram(id: string): Promise<void> {
  await db.programs.delete(id)
}

// Apply a program: back up the current workouts to a dated program (only if
// there are any), then replace the active workouts with copies of the
// program's. Returns the backup program name, if one was created. All-or-
// nothing: if a limit would be exceeded, nothing changes.
export async function applyProgram(program: Program): Promise<string | null> {
  if (program.workouts.length > LIMITS.workoutsPerProgram) throw workoutsLimitError()
  const current = await currentWorkouts()
  if (current.length > LIMITS.workoutsPerProgram) throw workoutsLimitError()

  if (current.length === 0) {
    await db.transaction('rw', db.playlists, async () => {
      await db.playlists.bulkAdd(clonePlaylists(program.workouts))
    })
    return null
  }

  let backupName: string | null = null
  await db.transaction('rw', db.programs, db.playlists, async () => {
    assertCanAddProgram(await db.programs.count())
    const taken = new Set((await db.programs.toArray()).map((p) => p.name))
    backupName = uniqueName(taken, todayStamp())
    await db.programs.add(toProgram(backupName, clonePlaylists(current)))
    await db.playlists.bulkDelete(current.map((p) => p.id))
    await db.playlists.bulkAdd(clonePlaylists(program.workouts))
  })
  return backupName
}

// ---- starter programs -----------------------------------------------------
//
// Definitions live server-side and are inserted once per account (see
// /api/sync/seed). A device asks for them once; the server decides whether the
// account is still unseeded. Asking again is harmless and idempotent.

export async function requestStarterSeeds(): Promise<void> {
  if (navigator.onLine === false) return
  if (await getMeta(META_SEED_REQUESTED)) return
  try {
    await api.seed()
    await setMeta(META_SEED_REQUESTED, '1')
  } catch {
    // offline/server error — leave the flag unset so the next sync retries
  }
}
