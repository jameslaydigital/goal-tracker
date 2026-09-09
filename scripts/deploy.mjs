// Deploy the goal tracker to syncart (Linode) behind the existing Caddy.
//
//   npm run deploy                # rsync + build + restart service + install Caddy override
//   npm run deploy -- -n          # dry run (rsync -n, nothing changes remotely)
//   npm run deploy -- --app       # code + service only, leave Caddy alone
//   npm run deploy -- --caddy     # Caddy override only
//   npm run deploy -- --host x    # use a different ssh alias (default: $SYNCART_HOST or "syncart")
//   npm run deploy -- -m "msg"    # commit + push to origin first, then deploy
//
// What it does on the box:
//   1. rsync the repo to /opt/goal-tracker (excludes node_modules, dist, data, .git)
//   2. npm ci && npm run build there
//   3. install /etc/goal-tracker.env + the systemd unit, enable & restart goal-tracker
//   4. install deploy/Caddyfile as /etc/caddy/Caddyfile (validated), reload caddy
//
// Caddy routing after this: goal-tracker.progressive-apps.com -> 127.0.0.1:8080
// (this app); every other host keeps hitting the existing catch-all -> 127.0.0.1:8787 (syncart).

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REMOTE_DIR = '/opt/goal-tracker'

/* ---------------- arg parsing ---------------- */

const flags = { dryRun: false, app: true, caddy: true, push: false, message: null, host: null }
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '-n' || a === '--dry-run') flags.dryRun = true
  else if (a === '--app') flags.caddy = false
  else if (a === '--caddy') flags.app = false
  else if (a === '--push') flags.push = true
  else if (a === '-m' || a === '--message') flags.message = args[++i]
  else if (a === '--host') flags.host = args[++i]
  else {
    console.error(`Unknown argument: ${a}

Usage:
  npm run deploy [--app | --caddy] [-n] [--push] [-m "msg"] [--host <ssh-alias>]`)
    process.exit(2)
  }
}
if (!flags.app && !flags.caddy) {
  console.error('Cannot use --app and --caddy together (that is the default).')
  process.exit(2)
}

const host = flags.host || process.env.SYNCART_HOST || 'syncart'

/* ---------------- helpers ---------------- */

function run(cmd, cmdArgs, { cwd = ROOT, input = null } = {}) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(' ')}`)
  const r = input !== null
    ? spawnSync(cmd, cmdArgs, { cwd, stdio: ['pipe', 'inherit', 'inherit'], input })
    : spawnSync(cmd, cmdArgs, { cwd, stdio: 'inherit' })
  if (r.error) {
    console.error(`\nFailed to run ${cmd}: ${r.error.message}`)
    process.exit(1)
  }
  if (r.status !== 0) {
    console.error(`\n${cmd} failed (exit ${r.status})`)
    process.exit(r.status ?? 1)
  }
  return r
}

function gitStatus() {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  return (r.stdout || '').trim()
}

/* ---------------- optional commit + push ---------------- */

if (flags.message) {
  run('git', ['add', '-A'])
  run('git', ['commit', '-m', flags.message])
  flags.push = true
}

if (flags.push) {
  const dirty = gitStatus()
  if (dirty) {
    console.warn(`\n⚠️  Working tree is dirty (uncommitted changes will NOT be pushed):\n${dirty}`)
  }
  run('git', ['push', 'origin', 'main'])
}

/* ---------------- 1. rsync the app ---------------- */

const rsyncExcludes = ['--exclude', 'node_modules/', '--exclude', 'dist/', '--exclude', 'data/', '--exclude', '.git/', '--exclude', '*.log']

if (flags.app) {
  if (flags.dryRun) {
    run('rsync', ['-azv', '-n', '--delete', ...rsyncExcludes, '-e', 'ssh', './', `${host}:${REMOTE_DIR}/`])
    console.log('\nℹ️  Dry run — no remote changes were made. Caddy/env/service installs are skipped.')
    process.exit(0)
  }
  run('ssh', [host, `sudo mkdir -p ${REMOTE_DIR} && sudo chown deploy:deploy ${REMOTE_DIR}`])
  run('rsync', [
    '-az',
    '--delete',
    ...rsyncExcludes,
    '-e', 'ssh',
    './',
    `${host}:${REMOTE_DIR}/`,
  ])
}

/* ---------------- 2. build + service ---------------- */

if (flags.app) {
  run('ssh', [host, `cd ${REMOTE_DIR} && npm ci && npm run build`])

  const envFile = readFileSync(join(ROOT, 'deploy', 'goal-tracker.env.example'), 'utf8')
  const unitFile = readFileSync(join(ROOT, 'deploy', 'goal-tracker.service'), 'utf8')

  run('ssh', [host, 'sudo tee /etc/goal-tracker.env > /dev/null'], { input: envFile })
  run('ssh', [host, 'sudo tee /etc/systemd/system/goal-tracker.service > /dev/null'], { input: unitFile })
  run('ssh', [
    host,
    // DATA_DIR is confined via ReadWritePaths and must exist before the unit's
    // namespace mounts are set up — rsync excludes it, so create it up front.
    `sudo mkdir -p ${REMOTE_DIR}/data && sudo chown deploy:deploy ${REMOTE_DIR}/data && ` +
      'sudo systemctl daemon-reload && sudo systemctl enable goal-tracker && sudo systemctl restart goal-tracker && ' +
      'for i in $(seq 1 30); do systemctl is-active goal-tracker >/dev/null 2>&1 && break; systemctl is-failed goal-tracker >/dev/null 2>&1 && break; sleep 0.5; done; ' +
      'systemctl is-active goal-tracker && ' +
      'ok=""; for i in $(seq 1 20); do curl -sf http://127.0.0.1:8080/api/health >/dev/null && ok=1 && break; sleep 0.5; done; ' +
      '[ -n "$ok" ] && echo "  health: ok" || { echo "  health: FAILED"; exit 1; }',
  ])
}

/* ---------------- 3. Caddy override ---------------- */

if (flags.caddy) {
  const caddyFile = readFileSync(join(ROOT, 'deploy', 'Caddyfile'), 'utf8')

  // Write to a temp path, validate, then atomically replace the live file.
  run('ssh', [host, 'sudo tee /etc/caddy/Caddyfile.goal-tracker > /dev/null'], { input: caddyFile })
  run('ssh', [host, 'sudo caddy validate --config /etc/caddy/Caddyfile.goal-tracker'])
  run('ssh', [host, 'sudo mv /etc/caddy/Caddyfile.goal-tracker /etc/caddy/Caddyfile && sudo systemctl reload caddy && sleep 1 && systemctl is-active caddy'])
}

console.log(`\n✅ Deployed to ${host} — goal-tracker active behind Caddy.`)
console.log('   goal-tracker.progressive-apps.com → goal-tracker (127.0.0.1:8080)')
console.log('   everything else                    → syncart (127.0.0.1:8787)')
