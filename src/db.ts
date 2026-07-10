import Dexie, { type EntityTable } from 'dexie'
import type { Playlist, Session, SessionExercise, ExerciseSet } from './types'

export const db = new Dexie('GoalTracker') as Dexie & {
  playlists: EntityTable<Playlist, 'id'>
  sessions: EntityTable<Session, 'id'>
  sessionExercises: EntityTable<SessionExercise, 'id'>
  sessionSets: EntityTable<ExerciseSet, 'id'>
}

db.version(1).stores({
  playlists: 'id',
  sessions: 'id',
  sessionExercises: 'id, sessionId',
  sessionSets: 'id, exerciseId, sessionId',
})
