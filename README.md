# Workout Goal Tracker

An offline-first progressive web app for tracking workouts. Create playlists (templates), start sessions, and work through exercises one set at a time in a focused fullscreen mode.

## Tech Stack

- **Vite + React + TypeScript** — build tooling and UI
- **Tailwind CSS** — styling (mobile-first, Android-native look)
- **Dexie.js** — IndexedDB wrapper for reliable persistent storage
- **React Router** — client-side routing
- **vite-plugin-pwa** — offline support and "Add to Home Screen"

## Data Model

```
Playlist: id, name, exercises[]
  Exercise: id, name, defaultSets, defaultReps, defaultWeight, weightUnit, order

Session: id, playlistId, date, status (active|paused|completed),
         playhead { exerciseIndex, setIndex },
         exercises[]
  SessionExercise: id, exerciseName, sets[], order
    Set: id, reps, weight, weightUnit, completed, completedAt, order
```

Sessions snapshot playlist exercises on creation — modifying a template never affects in-progress or historical sessions.

## Naming

| Term | Definition |
|---|---|
| **Playlist** | A template / blueprint for a workout session |
| **Session** | An instance of a playlist, started from the playlist overview |
| **Exercise** | A named movement within a session (e.g. "bench press") |
| **Set** | A single round of an exercise: N reps @ weight |

## Routes

| Route | View |
|---|---|
| `/` | Dashboard |
| `/playlists` | Playlist overview |
| `/playlists/new` | Create playlist |
| `/playlists/:id/edit` | Edit playlist |
| `/playlists/:id/session` | Session view (+ top "Resume" bar if paused) |
| `/workout/:sessionId` | Workout mode (fullscreen overlay) |

## Workout Mode

- Fullscreen overlay with large touch targets on a dark background
- One set at a time with pre-filled reps/weight and +/- steppers
- A playhead advances through the session — proceeds only when the user checks off the current set
- Can skip/jump to any exercise or set at any time
- **Pause** drops to the session view with a top bar: "Session paused — [Resume]"
- Animated checkbox on set completion for RPG-like feedback

## CSV Export

One row per completed set, exported via the Web Share API (triggers Android share sheet → save to Google Drive, etc.):

```
datetime, exercise_name, reps, weight, weight_unit
2026-07-10T10:35:00, bench press, 30, 50, lbs
2026-07-10T10:37:00, curls, 15, 30, lbs
```

## Roadmap

1. Dashboard
2. Playlist overview, create, edit
3. Session view
4. Workout mode (fullscreen wizard)
5. CSV export
6. Logging module (measurements, supplements, body weight)
7. Reports module (interactive data views)
