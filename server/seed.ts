import { randomUUID } from 'node:crypto'

// Starter programs are inserted server-side, once per account, the first time
// an account has no programs at all. They replicate to every device like any
// other program row. Content is deliberately modest — sensible starting points
// that users edit in the app.

export interface SeedSet {
  reps: number
  weight: number
}

export interface SeedWorkout {
  name: string
  exercises: Array<{ name: string; sets: SeedSet[] }>
}

export interface SeedProgram {
  name: string
  workouts: SeedWorkout[]
}

interface ProgramRow {
  id: string
  ts: number
  body: string
}

const STARTERS: SeedProgram[] = [
  {
    name: 'Push/Pull Hypertrophy + Legs',
    workouts: [
      {
        name: 'Push Day',
        exercises: [
          { name: 'Bench Press', sets: [{ reps: 10, weight: 0 }, { reps: 10, weight: 0 }, { reps: 10, weight: 0 }, { reps: 8, weight: 0 }] },
          { name: 'Incline Dumbbell Press', sets: [{ reps: 10, weight: 0 }, { reps: 10, weight: 0 }, { reps: 10, weight: 0 }] },
          { name: 'Overhead Press', sets: [{ reps: 10, weight: 0 }, { reps: 10, weight: 0 }, { reps: 10, weight: 0 }] },
          { name: 'Lateral Raise', sets: [{ reps: 15, weight: 0 }, { reps: 15, weight: 0 }, { reps: 15, weight: 0 }] },
          { name: 'Triceps Pushdown', sets: [{ reps: 12, weight: 0 }, { reps: 12, weight: 0 }, { reps: 12, weight: 0 }] },
        ],
      },
      {
        name: 'Pull Day',
        exercises: [
          { name: 'Pull-Up', sets: [{ reps: 8, weight: 0 }, { reps: 8, weight: 0 }, { reps: 8, weight: 0 }] },
          { name: 'Barbell Row', sets: [{ reps: 10, weight: 0 }, { reps: 10, weight: 0 }, { reps: 10, weight: 0 }] },
          { name: 'Lat Pulldown', sets: [{ reps: 12, weight: 0 }, { reps: 12, weight: 0 }, { reps: 12, weight: 0 }] },
          { name: 'Face Pull', sets: [{ reps: 15, weight: 0 }, { reps: 15, weight: 0 }, { reps: 15, weight: 0 }] },
          { name: 'Dumbbell Curl', sets: [{ reps: 12, weight: 0 }, { reps: 12, weight: 0 }, { reps: 12, weight: 0 }] },
        ],
      },
      {
        name: 'Legs Day',
        exercises: [
          { name: 'Back Squat', sets: [{ reps: 10, weight: 0 }, { reps: 10, weight: 0 }, { reps: 10, weight: 0 }, { reps: 8, weight: 0 }] },
          { name: 'Romanian Deadlift', sets: [{ reps: 12, weight: 0 }, { reps: 12, weight: 0 }, { reps: 12, weight: 0 }] },
          { name: 'Leg Press', sets: [{ reps: 15, weight: 0 }, { reps: 15, weight: 0 }, { reps: 15, weight: 0 }] },
          { name: 'Leg Curl', sets: [{ reps: 12, weight: 0 }, { reps: 12, weight: 0 }, { reps: 12, weight: 0 }] },
          { name: 'Standing Calf Raise', sets: [{ reps: 15, weight: 0 }, { reps: 15, weight: 0 }, { reps: 15, weight: 0 }, { reps: 15, weight: 0 }] },
        ],
      },
    ],
  },
  {
    name: 'Weight Loss',
    workouts: [
      {
        name: 'Full Body A',
        exercises: [
          { name: 'Goblet Squat', sets: [{ reps: 15, weight: 0 }, { reps: 15, weight: 0 }, { reps: 15, weight: 0 }] },
          { name: 'Push-Up', sets: [{ reps: 12, weight: 0 }, { reps: 12, weight: 0 }, { reps: 12, weight: 0 }] },
          { name: 'Dumbbell Row', sets: [{ reps: 12, weight: 0 }, { reps: 12, weight: 0 }, { reps: 12, weight: 0 }] },
          { name: 'Shoulder Press', sets: [{ reps: 12, weight: 0 }, { reps: 12, weight: 0 }, { reps: 12, weight: 0 }] },
          { name: 'Bicycle Crunch', sets: [{ reps: 20, weight: 0 }, { reps: 20, weight: 0 }, { reps: 20, weight: 0 }] },
        ],
      },
      {
        name: 'Full Body B',
        exercises: [
          { name: 'Dumbbell Lunge', sets: [{ reps: 12, weight: 0 }, { reps: 12, weight: 0 }, { reps: 12, weight: 0 }] },
          { name: 'Chest Press Machine', sets: [{ reps: 15, weight: 0 }, { reps: 15, weight: 0 }, { reps: 15, weight: 0 }] },
          { name: 'Seated Cable Row', sets: [{ reps: 15, weight: 0 }, { reps: 15, weight: 0 }, { reps: 15, weight: 0 }] },
          { name: 'Leg Press', sets: [{ reps: 15, weight: 0 }, { reps: 15, weight: 0 }, { reps: 15, weight: 0 }] },
          { name: 'Plank', sets: [{ reps: 60, weight: 0 }, { reps: 60, weight: 0 }, { reps: 60, weight: 0 }] },
        ],
      },
      {
        name: 'Cardio + Core',
        exercises: [
          { name: 'Treadmill Intervals', sets: [{ reps: 1, weight: 0 }, { reps: 1, weight: 0 }, { reps: 1, weight: 0 }] },
          { name: 'Kettlebell Swing', sets: [{ reps: 20, weight: 0 }, { reps: 20, weight: 0 }, { reps: 20, weight: 0 }] },
          { name: 'Mountain Climber', sets: [{ reps: 30, weight: 0 }, { reps: 30, weight: 0 }, { reps: 30, weight: 0 }] },
          { name: 'Russian Twist', sets: [{ reps: 30, weight: 0 }, { reps: 30, weight: 0 }, { reps: 30, weight: 0 }] },
        ],
      },
    ],
  },
  {
    name: 'Powerlifting',
    workouts: [
      {
        name: 'Squat Day',
        exercises: [
          { name: 'Back Squat', sets: [{ reps: 5, weight: 45 }, { reps: 5, weight: 45 }, { reps: 5, weight: 45 }, { reps: 5, weight: 45 }, { reps: 5, weight: 45 }] },
          { name: 'Pause Squat', sets: [{ reps: 3, weight: 0 }, { reps: 3, weight: 0 }, { reps: 3, weight: 0 }] },
          { name: 'Leg Press', sets: [{ reps: 8, weight: 0 }, { reps: 8, weight: 0 }, { reps: 8, weight: 0 }] },
          { name: 'Leg Curl', sets: [{ reps: 8, weight: 0 }, { reps: 8, weight: 0 }, { reps: 8, weight: 0 }] },
        ],
      },
      {
        name: 'Bench Day',
        exercises: [
          { name: 'Bench Press', sets: [{ reps: 5, weight: 45 }, { reps: 5, weight: 45 }, { reps: 5, weight: 45 }, { reps: 5, weight: 45 }, { reps: 5, weight: 45 }] },
          { name: 'Overhead Press', sets: [{ reps: 8, weight: 0 }, { reps: 8, weight: 0 }, { reps: 8, weight: 0 }] },
          { name: 'Dumbbell Row', sets: [{ reps: 8, weight: 0 }, { reps: 8, weight: 0 }, { reps: 8, weight: 0 }] },
          { name: 'Triceps Pushdown', sets: [{ reps: 10, weight: 0 }, { reps: 10, weight: 0 }, { reps: 10, weight: 0 }] },
        ],
      },
      {
        name: 'Deadlift Day',
        exercises: [
          { name: 'Deadlift', sets: [{ reps: 5, weight: 45 }, { reps: 5, weight: 45 }, { reps: 5, weight: 45 }] },
          { name: 'Deficit Deadlift', sets: [{ reps: 3, weight: 0 }, { reps: 3, weight: 0 }, { reps: 3, weight: 0 }] },
          { name: 'Barbell Row', sets: [{ reps: 8, weight: 0 }, { reps: 8, weight: 0 }, { reps: 8, weight: 0 }] },
          { name: 'Pull-Up', sets: [{ reps: 8, weight: 0 }, { reps: 8, weight: 0 }, { reps: 8, weight: 0 }] },
        ],
      },
    ],
  },
]

function buildSet(reps: number, weight: number, order: number): Record<string, unknown> {
  return { id: randomUUID(), reps, weight, weightUnit: 'lbs', order }
}

function buildWorkout(w: SeedWorkout): Record<string, unknown> {
  return {
    id: randomUUID(),
    name: w.name,
    exercises: w.exercises.map((ex, i) => ({
      id: randomUUID(),
      name: ex.name,
      weightUnit: 'lbs',
      order: i,
      sets: ex.sets.map((s, j) => buildSet(s.reps, s.weight, j)),
    })),
  }
}

export function buildStarterPrograms(): ProgramRow[] {
  const ts = Date.now()
  return STARTERS.map((p) => {
    const program = {
      id: randomUUID(),
      name: p.name,
      createdAt: new Date(ts).toISOString(),
      _ts: ts,
      workouts: p.workouts.map((w) => buildWorkout(w)),
    }
    return { id: program.id, ts, body: JSON.stringify(program) }
  })
}
