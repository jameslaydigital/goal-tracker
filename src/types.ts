export interface ExerciseTemplateSet {
  id: string;
  reps: number;
  weight: number;
  weightUnit: string;
  order: number;
}

export interface Exercise {
  id: string;
  name: string;
  weightUnit: string;
  order: number;
  sets: ExerciseTemplateSet[];
}

export interface Playlist {
  id: string;
  name: string;
  exercises: Exercise[];
}

// A saved set of workout templates. `workouts` are deep copies of playlists —
// editing the active workouts never mutates a saved program, and applying a
// program materializes fresh copies, never the program's own rows.
export interface Program {
  id: string;
  name: string;
  createdAt: string;
  workouts: Playlist[];
}

export interface ExerciseSet {
  id: string;
  exerciseId: string;
  sessionId: string;
  sessionName: string;
  exerciseName: string;
  order: number;
  reps: number;
  weight: number;
  weightUnit: string;
  completed: boolean;
  completedAt: string | null;
  logged: boolean;
}

export interface SessionExercise {
  id: string;
  sessionId: string;
  name: string;
  order: number;
}

export interface Session {
  id: string;
  playlistId: string;
  playlistName: string;
  startTime: string;
  status: 'active' | 'paused' | 'completed';
  playheadExerciseIndex: number;
  playheadSetIndex: number;
}
