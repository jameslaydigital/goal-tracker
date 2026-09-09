// goal-tracker CLI — edit the *active workout list* (playlists) of an account
// through the same sync API the app uses. Auth is email/password; every edit is
// pushed with a fresh `_ts` and last-write-wins on the server.
//
// Credentials come from env vars (GOAL_TRACKER_URL, GOAL_TRACKER_EMAIL,
// GOAL_TRACKER_PASSWORD) or from ~/.goal-tracker.env (see `npm run cli -- --help`).
//
//   npm run cli -- list
//   npm run cli -- show "Push Day"
//   npm run cli -- add "Cardio"
//   npm run cli -- exercise add "Cardio" "Treadmill" -s 3 -r 15 -w 0
//   npm run cli -- exercise add "Push Day" "Incline Press" -s 3 -r 10 -w 50
//   npm run cli -- bump --pct 10 --workout "Push Day" --exercise "Bench Press"
//   npm run cli -- rename "Push Day" "Push A"
//   npm run cli -- rm "Old Day"
//   npm run cli -- exercise rm "Push Day" "Lateral Raise"

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')

// Optional dotfile (default ~/.goal-tracker.env) so credentials don't have to
// be exported per command or pasted into transcripts. Set GOAL_TRACKER_ENV to
// point elsewhere. Real env vars win over the file.
function loadEnvFile(): void {
  const file = process.env.GOAL_TRACKER_ENV ?? `${process.env.HOME ?? ''}/.goal-tracker.env`
  if (!file.startsWith('/')) return
  try {
    const text = readFileSync(file, 'utf8')
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      if (key && process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    // file absent — fall back to env vars
  }
}
loadEnvFile()

interface SetTemplate {
  id: string
  reps: number
  weight: number
  weightUnit: string
  order: number
}

interface ExerciseTemplate {
  id: string
  name: string
  weightUnit: string
  order: number
  sets: SetTemplate[]
}

interface Workout {
  id: string
  name: string
  exercises: ExerciseTemplate[]
  _ts?: number
}

const API = process.env.GOAL_TRACKER_URL ?? 'http://localhost:8080'

// ---- argv helpers ---------------------------------------------------------

function flagValue(args: string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) return args[i + 1]
  }
  return undefined
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

function usage(): never {
  console.log(`goal-tracker CLI — edit your active workouts.

Auth (env or ~/.goal-tracker.env):
  GOAL_TRACKER_URL, GOAL_TRACKER_EMAIL, GOAL_TRACKER_PASSWORD
  (a dotfile line each: KEY=value; real env vars win. GOAL_TRACKER_ENV overrides the path.)

Commands:
  list
      List your active workouts.

  show <workout>
      Show a workout's exercises and sets. Add --json for machine-readable output.

  add <workout>
      Create a new (empty) workout, then populate it with the "exercise add" command.

  rm <workout>
      Delete a workout (and its sessions are unaffected — sessions keep a copy).

  rename <workout> <new-name>
      Rename a workout.

  exercise add <workout> <exercise> -s SETS -r REPS [-w WEIGHT] [-u UNIT]
      Add an exercise with SETS identical sets of REPS reps at WEIGHT.

  exercise rm <workout> <exercise>
      Remove an exercise (matching by name).

  bump (--pct P | --add A) [--workout W] [--exercise E] [--zero]
      Scale (--pct) or add (--add) to set weights. With no filters, affects
      every set in every workout. Weights of 0 are skipped unless --zero.

  add-skill [--user]
      Install the "goal-tracker-cli" skill for opencode: into this project's
      .opencode/skills by default, or your global opencode skills directory
      (~/.config/opencode/skills) with --user. Restart opencode afterwards.
`)
  process.exit(0)
}

function fail(message: string): never {
  console.error(`error: ${message}`)
  process.exit(1)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function positiveInt(value: string, what: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) fail(`${what} must be a non-negative integer (got "${value}")`)
  return n
}

function weightNum(value: string): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) fail(`weight must be a non-negative number (got "${value}")`)
  return n
}

// ---- HTTP ---------------------------------------------------------------

async function request(path: string, init?: { method?: string; body?: unknown; cookie?: string }): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (init?.body !== undefined) headers['content-type'] = 'application/json'
  if (init?.cookie) headers['cookie'] = init.cookie
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, data }
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    fail(`login failed: ${data.error ?? `HTTP ${res.status}`}`)
  }
  const setCookie = res.headers.getSetCookie?.()[0] ?? ''
  const sid = setCookie.split(';')[0]
  if (!sid.startsWith('sid=')) fail('login did not return a session cookie')
  return sid
}

function mutate(put: Workout): Record<string, unknown> {
  const ts = Date.now()
  return { table: 'playlists', id: put.id, ts, deleted: false, body: { ...put, _ts: ts } }
}

function remove(id: string): Record<string, unknown> {
  return { table: 'playlists', id, ts: Date.now(), deleted: true }
}

// ---- domain helpers ------------------------------------------------------

function emptyExercise(name: string, unit: string, sets: Array<{ reps: number; weight: number }>): ExerciseTemplate {
  return {
    id: randomUUID(),
    name,
    weightUnit: unit,
    order: 0,
    sets: sets.map((s, i) => ({
      id: randomUUID(),
      reps: s.reps,
      weight: s.weight,
      weightUnit: unit,
      order: i,
    })),
  }
}

function printWorkout(w: Workout): void {
  console.log(`${w.name} (${w.exercises.length} exercise${w.exercises.length !== 1 ? 's' : ''})`)
  for (const ex of w.exercises) {
    console.log(`  ${ex.name}`)
    for (const s of ex.sets) {
      console.log(`    ${s.reps} × ${s.weight} ${s.weightUnit}`)
    }
  }
}

// ---- main ---------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') usage()

  const [cmd, ...rest] = args

  // add-skill needs no credentials or server. Installs the goal-tracker-cli
  // skill for opencode (this project's .opencode/skills, or the global
  // ~/.config/opencode/skills with --user).
  if (cmd === 'add-skill') {
    const toUser = hasFlag(rest, '--user')
    const template = `${ROOT}/cli/skills/goal-tracker-cli/SKILL.md`
    const base = toUser ? `${process.env.HOME ?? ''}/.config/opencode/skills` : `${ROOT}/.opencode/skills`
    if (!base.startsWith('/')) fail(`could not resolve your home directory for a --user install`)
    const target = `${base}/goal-tracker-cli/SKILL.md`
    mkdirSync(`${base}/goal-tracker-cli`, { recursive: true })
    writeFileSync(target, readFileSync(template, 'utf8'))
    console.log(`Installed the goal-tracker-cli skill for opencode → ${target}`)
    console.log('Restart opencode for the skill to load.')
    return
  }

  const email = process.env.GOAL_TRACKER_EMAIL ?? ''
  const password = process.env.GOAL_TRACKER_PASSWORD ?? ''
  if (!email || !password) {
    fail('set GOAL_TRACKER_EMAIL and GOAL_TRACKER_PASSWORD (and optionally GOAL_TRACKER_URL)')
  }
  const cookie = await login(email, password)

  async function call(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const r = await request(path, { method: body === undefined ? 'GET' : 'POST', body, cookie })
    if (!r.ok) fail(String(r.data.error ?? `HTTP ${r.status}`))
    return r.data
  }

  async function loadWorkouts(): Promise<Workout[]> {
    const data = await call('/api/sync/table/playlists')
    return (data.rows as Workout[]).map((w) => ({
      id: w.id,
      name: w.name,
      exercises: w.exercises ?? [],
      _ts: w._ts,
    }))
  }

  async function findWorkout(workouts: Workout[], name: string): Promise<Workout> {
    const exact = workouts.filter((w) => w.name === name)
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) fail(`multiple workouts named "${name}" — rename them first`)
    const close = workouts.find((w) => w.name.toLowerCase().includes(name.toLowerCase()))
    if (close) fail(`no workout named "${name}" — did you mean "${close.name}"?`)
    fail(`no workout named "${name}"`)
  }

  function saveAll(updates: Workout[]): Promise<Record<string, unknown>> {
    return call('/api/sync/push', { mutations: updates.map(mutate) })
  }

  async function removeOne(id: string): Promise<void> {
    await call('/api/sync/push', { mutations: [remove(id)] })
  }

  // ---- list ----
  if (cmd === 'list') {
    const workouts = await loadWorkouts()
    if (workouts.length === 0) {
      console.log('No workouts yet.')
      return
    }
    workouts.sort((a, b) => a.name.localeCompare(b.name))
    for (const w of workouts) {
      console.log(`${w.name} — ${w.exercises.length} exercise${w.exercises.length !== 1 ? 's' : ''}`)
    }
    return
  }

  // ---- show ----
  if (cmd === 'show') {
    if (rest.length < 1) fail('usage: show <workout> [--json]')
    const workouts = await loadWorkouts()
    const w = await findWorkout(workouts, rest[0])
    if (hasFlag(rest, '--json')) {
      console.log(JSON.stringify({ name: w.name, exercises: w.exercises }, null, 2))
    } else {
      printWorkout(w)
    }
    return
  }

  // ---- add ----
  if (cmd === 'add') {
    if (rest.length < 1) fail('usage: add <workout>')
    const name = rest[0]
    const workouts = await loadWorkouts()
    if (workouts.some((w) => w.name === name)) fail(`a workout named "${name}" already exists`)
    const created: Workout = { id: randomUUID(), name, exercises: [] }
    await call('/api/sync/push', { mutations: [mutate(created)] })
    console.log(`Created "${name}" (empty). Add exercises with: npm run cli -- exercise add "${name}" <name> -s SETS -r REPS`)
    return
  }

  // ---- rm ----
  if (cmd === 'rm') {
    if (rest.length < 1) fail('usage: rm <workout>')
    const workouts = await loadWorkouts()
    const w = await findWorkout(workouts, rest[0])
    await removeOne(w.id)
    console.log(`Deleted "${w.name}".`)
    return
  }

  // ---- rename ----
  if (cmd === 'rename') {
    if (rest.length < 2) fail('usage: rename <workout> <new-name>')
    const workouts = await loadWorkouts()
    const w = await findWorkout(workouts, rest[0])
    if (workouts.some((x) => x.id !== w.id && x.name === rest[1])) fail(`a workout named "${rest[1]}" already exists`)
    w.name = rest[1]
    await saveAll([w])
    console.log(`Renamed to "${rest[1]}".`)
    return
  }

  // ---- exercise add ----
  if (cmd === 'exercise' && rest[0] === 'add') {
    if (rest.length < 3) fail('usage: exercise add <workout> <exercise> -s SETS -r REPS [-w WEIGHT]')
    const [, workoutName, exName, ...flags] = rest
    const workouts = await loadWorkouts()
    const w = await findWorkout(workouts, workoutName)
    if (w.exercises.some((e) => e.name === exName)) fail(`"${w.name}" already has an exercise named "${exName}"`)
    const unit = flagValue(flags, '-u') ?? flagValue(flags, '--unit') ?? 'lbs'
    const sets = positiveInt(flagValue(flags, '-s') ?? flagValue(flags, '--sets') ?? '1', 'sets')
    const reps = positiveInt(flagValue(flags, '-r') ?? flagValue(flags, '--reps') ?? '10', 'reps')
    const weight = weightNum(flagValue(flags, '-w') ?? flagValue(flags, '--weight') ?? '0')
    const exercise = emptyExercise(exName, unit, Array.from({ length: sets }, () => ({ reps, weight })))
    w.exercises.push(exercise)
    w.exercises.forEach((e, i) => (e.order = i))
    await saveAll([w])
    console.log(`Added "${exName}" (${sets} set${sets !== 1 ? 's' : ''} × ${reps} @ ${weight} ${unit}) to "${w.name}".`)
    return
  }

  // ---- exercise rm ----
  if (cmd === 'exercise' && rest[0] === 'rm') {
    if (rest.length < 3) fail('usage: exercise rm <workout> <exercise>')
    const [, workoutName, exName] = rest
    const workouts = await loadWorkouts()
    const w = await findWorkout(workouts, workoutName)
    const before = w.exercises.length
    w.exercises = w.exercises.filter((e) => e.name !== exName)
    if (w.exercises.length === before) fail(`"${w.name}" has no exercise named "${exName}"`)
    w.exercises.forEach((e, i) => (e.order = i))
    await saveAll([w])
    console.log(`Removed "${exName}" from "${w.name}".`)
    return
  }

  // ---- bump ----
  if (cmd === 'bump') {
    const pctRaw = flagValue(rest, '--pct')
    const addRaw = flagValue(rest, '--add')
    if ((pctRaw === undefined) === (addRaw === undefined)) fail('bump requires exactly one of --pct or --add')
    const targetWorkout = flagValue(rest, '--workout')
    const targetExercise = flagValue(rest, '--exercise')
    const includeZero = hasFlag(rest, '--zero')

    const workouts = await loadWorkouts()
    const targets = targetWorkout ? [await findWorkout(workouts, targetWorkout)] : workouts

    let touched = 0
    let skipped = 0
    for (const w of targets) {
      for (const ex of w.exercises) {
        if (targetExercise && ex.name !== targetExercise) continue
        for (const s of ex.sets) {
          if (s.weight === 0 && !includeZero) {
            skipped += 1
            continue
          }
          const next = pctRaw !== undefined ? round1((s.weight * (100 + Number(pctRaw))) / 100) : round1(s.weight + Number(addRaw))
          if (next !== s.weight) {
            s.weight = next
            touched += 1
          }
        }
      }
    }
    await saveAll(targets)
    const how = pctRaw !== undefined ? `${pctRaw}%` : `+${addRaw}`
    console.log(`Adjusted weights ${how} across ${targets.length} workout${targets.length !== 1 ? 's' : ''}: ${touched} set${touched !== 1 ? 's' : ''} changed${includeZero ? '' : `, ${skipped} zero-weight set${skipped !== 1 ? 's' : ''} skipped`}.`)
    return
  }

  usage()
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
