# Workout Goal Tracker

An offline-first progressive web app for tracking workouts. Create playlists (templates), start sessions, and work through exercises one set at a time in a focused fullscreen mode.

## Tech Stack

- **Vite + React + TypeScript** — build tooling and UI
- **Tailwind CSS** — styling (mobile-first, Android-native look)
- **Dexie.js** — IndexedDB wrapper; the live data store the UI renders from
- **React Router** — client-side routing
- **vite-plugin-pwa** — offline support and "Add to Home Screen"
- **Node + Express + `node:sqlite`** (`server/`) — auth and cloud sync, one SQLite file per account

## How sync works

Dexie/IndexedDB stays the source of truth for the UI, which keeps the app fully usable with no signal (gym mode). On top of it there is a small custom replication layer:

- Every write to a data table is stamped with a wall-clock `_ts` and logged to a local outbox (Dexie hooks, so no call sites change).
- While signed in, the app syncs on load, on reconnect, on focus, and every 30s: it **pushes** outbox entries and **pulls** anything newer than its last-seen revision.
- The server stores rows from all five tables as opaque JSON in a per-user SQLite file (`data/users/<id>.sqlite`), tagging each write with a monotonic revision.
- Conflicts resolve **last-write-wins by `_ts`** — including deletes (tombstones propagate).
- Deleting your browser history no longer loses data: a fresh device signs in and pulls everything back from the server.

### Sync protocol

| Endpoint | Purpose |
|---|---|
| `POST /api/sync/push` | Upload `{ table, id, ts, deleted, body }[]` mutations (LWW applied server-side) |
| `POST /api/sync/pull` | Fetch rows with `rev > since`, newest-first up to a limit |

Authentication is email/password with scrypt hashing and httpOnly session cookies:

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/signup` `/login` `/logout` | Session lifecycle |
| `GET /api/auth/me` | Restore a session on app load |

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
| **Program** | A saved set of workout templates (a training plan) |
| **Playlist** | A template / blueprint for a workout session |
| **Session** | An instance of a playlist, started from the playlist overview |
| **Exercise** | A named movement within a session (e.g. "bench press") |
| **Set** | A single round of an exercise: N reps @ weight |

## Routes

| Route | View |
|---|---|
| `/` | Dashboard |
| `/programs` | Programs (saved workout sets) |
| `/programs/:id` | Program detail — apply / rename / overwrite / delete |
| `/playlists` | Playlist overview |
| `/playlists/new` | Create playlist |
| `/playlists/:id/edit` | Edit playlist |
| `/playlists/:id/session` | Session view (+ top "Resume" bar if paused) |
| `/workout/:sessionId` | Workout mode (fullscreen overlay) |

### Programs

A **program** is a saved set of workout templates. Apply one and your current
workouts are backed up to a program named after today's date (`2026-09-09`,
`2026-09-09 (2)`, …) before the program's workouts become active. Programs can
be renamed, overwritten with your current workouts, or deleted. New accounts
are seeded once with starter programs (Push/Pull Hypertrophy + Legs, Weight
Loss, Powerlifting); deleting them doesn't bring them back. Client-side caps
(256 programs / workouts per program / exercises per workout / sets per
exercise) guard the bulk operations.

## Running locally

The Vite dev server proxies `/api` to the backend, so run both:

```bash
npm install
npm run dev          # terminal 1 — frontend on :5173
npm run dev:server   # terminal 2 — API + auth on :8080
```

The backend stores data under `./data/` (gitignored) and will happily run API-only until you `npm run build`.

Signing in on a device with existing offline data migrates it automatically: the first sync uploads whatever the device already has (a one-time baseline). Signing in as a *different* account wipes the local copy and pulls that account's data instead, so accounts never bleed together on a shared device.

### End-to-end sync test

Spins up fake IndexedDB in Node and drives the real client modules against a running server:

```bash
npm run sync:test
# requires the API server running on :8080 first
```

### CLI (editing workouts)

`cli/run.ts` edits an account's **active workouts** through the sync API — rename/add/remove workouts, add/remove exercises, and scale weights:

```bash
export GOAL_TRACKER_URL=https://goal-tracker.progressive-apps.com
export GOAL_TRACKER_EMAIL=user@example.com
export GOAL_TRACKER_PASSWORD=...
npm run cli -- list
npm run cli -- add "Cardio"                     # then: exercise add "Cardio" "Treadmill" -s 3 -r 15
npm run cli -- bump --pct 10 --workout "Push Day"
npm run cli -- rename "Push Day" "Push A"
```

See `.opencode/skills/goal-tracker-cli/SKILL.md` for the full command reference and agent guidance.

## CSV Export

One row per completed set, exported via the Web Share API (triggers Android share sheet → save to Google Drive, etc.):

```
datetime, exercise_name, reps, weight, weight_unit
2026-07-10T10:35:00, bench press, 30, 50, lbs
2026-07-10T10:37:00, curls, 15, 30, lbs
```

## Deployment (syncart / Linode, behind Cloudflare)

The app runs on the `syncart` box (SSH alias in `~/.ssh/config`, Linode 23.239.29.165)
at `/opt/goal-tracker`. Cloudflare terminates HTTPS; Caddy on the box routes HTTP by
host. One Node process serves the built frontend **and** the API from `127.0.0.1:8080`.

### One-command deploy

```bash
npm run deploy            # rsync → npm ci/build → restart service → install Caddy override
npm run deploy -- -n      # dry run (rsync -n, no remote changes)
npm run deploy -- --app   # code + service only (leave Caddy alone)
npm run deploy -- --caddy # Caddy override only
npm run deploy -- -m "msg"   # commit + push to origin first, then deploy
```

The script (see `scripts/deploy.mjs`) does everything: rsyncs the repo to
`/opt/goal-tracker` (excluding `node_modules/`, `dist/`, `data/`, `.git`),
builds there, installs `/etc/goal-tracker.env` and the systemd unit
(`deploy/goal-tracker.service`), then installs the Caddy override.

### Caddy routing

`deploy/Caddyfile` is installed as `/etc/caddy/Caddyfile` (validated, then
reloaded). Caddy picks the most specific hostname, so:

```
goal-tracker.progressive-apps.com  → goal-tracker (127.0.0.1:8080)   ← this app
everything else (syncart, etc.)    → syncart      (127.0.0.1:8787)   ← unchanged
```

The site block uses an explicit `:80` so Caddy does **not** enable TLS on
443 — Cloudflare already terminates HTTPS and forwards plain HTTP to the origin.

### Service

The systemd unit runs `node server/index.ts` (Node native TS, no build step)
as `deploy`, hardened with `ProtectSystem=strict` and write access confined to
`DATA_DIR`. Environment comes from `/etc/goal-tracker.env`
(`deploy/goal-tracker.env.example`):

```
NODE_ENV=production
HOST=127.0.0.1
PORT=8080
DATA_DIR=/opt/goal-tracker/data
COOKIE_SECURE=1
```

### Checklist (first time / DNS)

1. `goal-tracker.progressive-apps.com` must have a proxied DNS record in Cloudflare pointing at this Linode.
2. Cloudflare SSL mode *Flexible* (origin is plain HTTP). `COOKIE_SECURE=1` stays on — the browser still sees HTTPS.
3. Don't cache the API: add a Cloudflare Cache Rule bypassing cache for `/api/*` so auth/sync responses are never cached.
4. **Backups**: the entire dataset is `DATA_DIR` (`auth.sqlite` + `users/*.sqlite`). Back that folder up and you can restore everything.

## Roadmap

1. Dashboard
2. Playlist overview, create, edit
3. Session view
4. Workout mode (fullscreen wizard)
5. CSV export
6. Logging module (measurements, supplements, body weight)
7. Reports module (interactive data views)

### Limits & abuse protection

Guardrails so a single account (or an attacker) can't balloon the databases.
Enforced server-side where it matters, with matching client-side caps so the
UI never lets you exceed them in the first place.

- **Per-account data caps** (256 each): programs, workouts per program, exercises per workout, sets per exercise.
- **Session throttle**: at most ~50 new sessions per account per day (rejects beyond that).
- **Tenant cap**: maximum number of signups the deployment accepts before new-account creation is denied (429/503), so one host isn't surprised by unbounded growth.
- **Payload/rate safety** (already present in spirit): push batches are capped and idempotent; keep those enforced and add per-IP + per-account request throttling on auth/sync endpoints.
