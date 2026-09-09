---
name: goal-tracker-cli
description: Edit a goal-tracker account's active workouts (playlists) through the goal-tracker CLI — rename/add/remove workouts, add or remove exercises with sets/reps/weight, and scale set weights by percent or by amount. Use when the user asks to update their routine, bump/increase weights, add a cardio section or new workout, remove an exercise, or otherwise change the workout list that syncs to their app.
---

# goal-tracker CLI

The goal-tracker repo ships a small CLI (`cli/run.ts`, `npm run cli`) that edits
an account's **active workout list** (the playlists table — the workouts the app
shows and that you start sessions from). It talks to the same sync API the app
uses, so edits appear on the user's devices after their next sync.

It does **not** touch saved Programs. If the user means a saved program, tell
them programs are edited by exporting/importing in the app or apply the change
to the active list and re-save it as a program there.

## Running it

From the repo root, with credentials for the target account. Credentials come
from env vars or — much nicer for agents — from `~/.goal-tracker.env`
(chmod 600, one `KEY=value` per line). Set `GOAL_TRACKER_ENV` to point
elsewhere. Real env vars win over the file.

```bash
# ~/.goal-tracker.env
GOAL_TRACKER_URL=https://goal-tracker.progressive-apps.com
GOAL_TRACKER_EMAIL=user@example.com
GOAL_TRACKER_PASSWORD=...

npm run cli -- <command>
```

For local dev, point `GOAL_TRACKER_URL` at `http://localhost:8080`.

Never echo the password into the transcript — rely on the dotfile or the
shell env, and never print the file's contents.

## Commands

| Command | Purpose |
|---|---|
| `list` | List active workouts (name + exercise count). |
| `show <workout>` | Print a workout's exercises and sets (`reps × weight unit`). Add `--json` for full structured output (includes ids/orders). |
| `add <workout>` | Create a new **empty** workout, then populate with `exercise add`. |
| `rm <workout>` | Delete a workout. Existing sessions keep their own copies. |
| `rename <workout> <new>` | Rename a workout. |
| `exercise add <workout> <exercise> -s SETS -r REPS [-w WEIGHT] [-u UNIT]` | Add an exercise made of `SETS` identical sets. `-w`/`-u` default to `0`/`lbs`. |
| `exercise rm <workout> <exercise>` | Remove an exercise by name. |
| `bump (--pct P \| --add A) [--workout W] [--exercise E] [--zero]` | Scale (`--pct`, % up or down, e.g. `--pct 10`) or add (`--add 5`, lbs) to set weights. With no filters it affects every set in every workout. Weights of `0` are skipped unless `--zero`. |

## Workflow for an agent

1. **Look before you touch.** Run `list`, then `show <workout>` (or
   `show --json`) for anything you'll change. Match workout/exercise names
   exactly; the CLI errors with a hint if the name is off.
2. **Make targeted edits.** Prefer the smallest command that does the job:
   - add cardio → `add "Cardio"`, then `exercise add "Cardio" "Treadmill" -s 3 -r 15 -w 0` (repeat per exercise)
   - bump weights → `bump --pct 10 --workout "Push Day"` or narrower with `--exercise`
   - restructure → `rename`, `exercise rm`, `rm`
3. **Confirm the result.** Re-run `show` (or `list`) and summarize what
   changed so the user sees a diff-like picture.
4. If multiple separate edits are wanted, run them as discrete commands so
   failures are isolated. Every edit is last-write-wins on the server.

## Notes & gotchas

- Edits are **not backed up** and replace on the server by timestamp, so make
  them deliberate; read first.
- Names are compared exactly (case-sensitive); quotes matter for names with
  spaces.
- `bump` only changes the numeric `weight` field — reps, sets, and units are
  untouched. `--pct 100` doubles weights; `--pct -10` reduces 10%.
- Zero weights are treated as "not yet set" and are left alone by `bump`
  unless you pass `--zero`.
- The CLI needs the server's `GET /api/sync/table/:table` read endpoint; that
  shipped alongside the CLI — deploy the repo before relying on it in prod.
