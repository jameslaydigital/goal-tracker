# AGENTS.md

## Commands

```bash
npm run dev        # dev server
npm run build      # typecheck (tsc -b) then vite build
npm run lint       # oxlint (no config file — defaults)
npm run preview    # preview production build
```

No test suite exists. No formatter is configured.

**Typecheck only:** `npx tsc -b`
**Lint a single file:** `npx oxlint src/path/to/file.ts`

## TypeScript Constraints

- **TypeScript 6** (`~6.0.2`) — not TS 5.x.
- `erasableSyntaxOnly: true` — no enums with computed values, no namespaces. Use interfaces, type aliases, and `const` object maps instead.
- `verbatimModuleSyntax: true` — all type-only imports must use `import type { ... }`.
- `noUnusedLocals` and `noUnusedParameters: true` — unused variables are compiler errors. Don't leave scaffolding.
- Use `tsc -b` (project references), not plain `tsc`.

## Architecture

Single-package PWA. No monorepo, no backend, no API calls.

| File | Role |
|---|---|
| `src/main.tsx` | React entry point |
| `src/App.tsx` | Route definitions (React Router 7) |
| `src/db.ts` | Dexie (IndexedDB) singleton — all persistence |
| `src/types.ts` | All TypeScript interfaces |
| `src/utils.ts` | `generateId()` (crypto.randomUUID), CSV export |
| `src/pages/` | One file per route |

## Toolchain Quirks

- **Tailwind CSS 4.x** uses `@tailwindcss/vite` plugin — no `tailwind.config.js`. Tailwind config lives in `vite.config.ts`.
- **PWA service worker** is generated at build time via `vite-plugin-pwa`. The `dist/` directory is committed (likely for static hosting).
- No `.env` files or environment variables anywhere.

## Data Model Notes

Sessions snapshot playlist data at creation time — editing a playlist does not affect existing sessions. `Session.playlistName` and `SessionExercise.name` are stored by value.

Only `ExerciseSet` rows where `logged === true` appear in CSV exports.

Database name: `"GoalTracker"` (IndexedDB via Dexie, schema version 1).
