# AGENTS.md

## Commands

```bash
npm run dev          # vite dev server (frontend on :5173, proxies /api → :8080)
npm run dev:server   # node --watch server/index.ts  (API + auth on :8080)
npm run start        # run the server (serves dist/ if built)
npm run build        # typecheck (tsc -b) then vite build
npm run typecheck    # tsc -b only
npm run lint         # oxlint (no config file — defaults)
npm run preview      # preview production build
npm run sync:test    # end-to-end sync smoke test (needs API running on :8080)
npm run cli          # edit an account's active workouts via the sync API (see .opencode/skills/goal-tracker-cli)
npm run deploy       # deploy to syncart:/opt/goal-tracker (see scripts/deploy.mjs)
```

No formal test suite. `npm run sync:test` exercises the client sync modules
against a live server using fake IndexedDB.

**Typecheck only:** `npx tsc -b`
**Lint a single file:** `npx oxlint src/path/to/file.ts`

## TypeScript Constraints

- **TypeScript 6** (`~6.0.2`) — not TS 5.x.
- `erasableSyntaxOnly: true` — no enums with computed values, no namespaces. Use interfaces, type aliases, and `const` object maps instead. (This is also what lets the server run directly with Node's native type stripping.)
- `verbatimModuleSyntax: true` — all type-only imports must use `import type { ... }`.
- `noUnusedLocals` and `noUnusedParameters: true` — unused variables are compiler errors. Don't leave scaffolding.
- Use `tsc -b` (project references), not plain `tsc`.
- Three TS projects: `tsconfig.app.json` (src), `tsconfig.node.json` (vite config), `tsconfig.server.json` (server).

## Architecture

Single package: a Vite/PWA frontend plus a Node backend in `server/`. The UI
renders from Dexie/IndexedDB (works offline); while signed in a sync engine
replicates all five data tables to the server (per-user SQLite, LWW by `_ts`).

| File | Role |
|---|---|
| `src/main.tsx` | React entry point |
| `src/App.tsx` | Auth gate + route definitions (React Router 7) |
| `src/db.ts` | Dexie singleton + sync instrumentation (v2 schema, hooks, outbox/meta tables) |
| `src/api.ts` | Typed fetch client for `/api/*` |
| `src/sync.ts` | Push/pull sync engine |
| `src/auth.tsx` | AuthProvider (session restore, account switch wipe, sync scheduler) |
| `src/types.ts` | All TypeScript interfaces |
| `src/utils.ts` | `generateId()` (crypto.randomUUID), CSV export |
| `src/components/AuthScreen.tsx` | Sign in / sign up |
| `src/pages/` | One file per route |
| `server/index.ts` | Express bootstrap, static serving of `dist/`, error handling |
| `server/auth.ts` | Email/password + session cookie middleware |
| `server/globaldb.ts` | Global users/sessions DB (`data/auth.sqlite`) |
| `server/userdb.ts` | Per-user SQLite replication store + LWW logic |
| `server/config.ts` | Env config (`PORT`, `DATA_DIR`, `COOKIE_SECURE`, …) |
| `cli/run.ts` | Node CLI to edit an account's active workouts (`npm run cli`, see the goal-tracker-cli skill) |
| `.opencode/skills/goal-tracker-cli/` | Agent skill wrapping the CLI |
| `scripts/sync-test.ts` | E2E sync smoke test |

## Sync semantics (read before touching `src/db.ts` or `server/userdb.ts`)

- Every row across the 5 data tables replicates as an opaque JSON body; sync is row-level, not schema-aware.
- Client writes are captured by **Dexie hooks** — never add instrumentation to individual call sites. Hooks:
  - stamp `_ts` on create/update (the `updating` hook must *return* `{ _ts }`, not mutate `modifications`);
  - log to `__syncOutbox` **on transaction `complete`** (implicit single-table write transactions don't scope `__syncOutbox`, so logging from inside the hook would throw).
- `__syncOutbox` / `__syncMeta` are local-only tables (`++seq`, `key`).
- Remote rows are applied with stamp/log suppressed (module-level flags in `db.ts`) so server writes never echo back.
- Server assigns a global per-user revision per accepted write; clients pull `rev > lastRev`. LWW compares `_ts` (wall clock), deletes included.
- `baselineLocalData()` migrates pre-sync rows: only rows **without** `_ts` get stamped+queued.

## Toolchain Quirks

- **Tailwind CSS 4.x** uses `@tailwindcss/vite` plugin — no `tailwind.config.js`. Tailwind config lives in `vite.config.ts`.
- **PWA service worker** is generated at build time via `vite-plugin-pwa`. `dist/` is gitignored (built on the server during deploy).
- **`vite.config.ts`** sets `base: '/'` and proxies `/api` → `http://localhost:8080` for dev.
- The server runs via Node native TS (`node server/index.ts`) — requires Node 22.6+ (Node 24+ recommended). All relative server imports must use the `.ts` extension. No build step, no `tsx`.
- Runtime server deps: `express` only. SQLite via built-in `node:sqlite` (`DatabaseSync`). No `.env` files — server reads env vars (`PORT`, `HOST`, `DATA_DIR`, `COOKIE_SECURE`, `NODE_ENV`).

## Data Model Notes

Sessions snapshot playlist data at creation time — editing a playlist does not affect existing sessions. `Session.playlistName` and `SessionExercise.name` are stored by value.

Only `ExerciseSet` rows where `logged === true` appear in CSV exports.

Database name: `"GoalTracker"` (IndexedDB via Dexie, schema version 3).

Server data lives in `DATA_DIR` (default `<repo>/data`, gitignored): `auth.sqlite` for users/sessions plus `users/<userId>.sqlite` for workout data.
