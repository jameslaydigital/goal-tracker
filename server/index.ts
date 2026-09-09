import { existsSync } from 'node:fs'
import { join } from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import { config } from './config.ts'
import { authRouter } from './auth.ts'
import { syncRouter } from './sync.ts'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '10mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})
app.use('/api/auth', authRouter)
app.use('/api/sync', syncRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

const distDir = join(config.root, 'dist')
const indexFile = join(distDir, 'index.html')

if (existsSync(indexFile)) {
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache')
        } else {
          // Vite emits content-hashed filenames, so these can be cached forever.
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }),
  )
  // SPA fallback for client-side routes (never shadows /api).
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(indexFile)
  })
} else {
  console.warn('[server] dist/ not found — API only. Run `npm run build` to serve the app.')
}

// Final 404 for anything unmatched (non-API, no SPA build).
app.use((_req, res) => {
  res.status(404).send('Not found')
})

// Centralized error handler — keeps malformed JSON and sqlite failures as JSON.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err)
    return
  }
  const isParseError = typeof err === 'object' && err !== null && 'type' in err
  const status = isParseError && (err as { type?: string }).type === 'entity.parse.failed' ? 400 : 500
  if (status === 500) console.error('[server] error', err)
  res.status(status).json({ error: status === 400 ? 'Invalid JSON body.' : 'Server error' })
})

const server = app.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`)
  console.log(`[server] data dir: ${config.dataDir}`)
})

function shutdown(): void {
  server.close(() => process.exit(0))
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
