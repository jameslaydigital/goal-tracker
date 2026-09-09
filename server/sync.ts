import { Router, type Response } from 'express'
import { authUser, requireAuth } from './auth.ts'
import { applyMutations, pullChanges } from './userdb.ts'
import { isFiniteInt } from './tables.ts'

const PULL_LIMIT = 500
const PULL_LIMIT_MAX = 1000

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: message })
}

export const syncRouter = Router()

// All sync routes are per-account: the authenticated user owns exactly one
// sqlite file, addressed through authUser(res).id.

syncRouter.post('/push', requireAuth, (req, res) => {
  const result = applyMutations(authUser(res).id, req.body?.mutations)
  if (!result) return badRequest(res, 'Invalid mutations payload.')
  res.json(result)
})

syncRouter.post('/pull', requireAuth, (req, res) => {
  const since = req.body?.since
  const limitRaw = req.body?.limit ?? PULL_LIMIT
  if (!isFiniteInt(since) || !Number.isInteger(limitRaw)) {
    return badRequest(res, 'Invalid pull payload.')
  }
  const limit = Math.min(Math.max(limitRaw as number, 1), PULL_LIMIT_MAX)
  res.json(pullChanges(authUser(res).id, since, limit))
})
