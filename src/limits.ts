// Hard safety caps against runaway/bombed databases. The client enforces them
// before performing bulk operations; the roadmap tracks server-side push
// validation so a malicious or buggy client can't bypass them.
export const LIMITS = {
  programs: 256,
  workoutsPerProgram: 256,
  exercisesPerWorkout: 256,
  setsPerExercise: 256,
  sessionsPerDay: 50,
} as const

export function programLimitError(): Error {
  return new Error(`You've reached the maximum of ${LIMITS.programs} programs. Delete one to make room.`)
}

export function workoutsLimitError(): Error {
  return new Error(
    `A program can hold at most ${LIMITS.workoutsPerProgram} workouts. Trim your workout list first.`,
  )
}
