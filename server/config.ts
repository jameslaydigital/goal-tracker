import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const config = {
  root: ROOT,
  dataDir: process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(ROOT, 'data'),
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 8080),
  // Set COOKIE_SECURE=1 in production (HTTPS is terminated by Cloudflare).
  cookieSecure: process.env.COOKIE_SECURE === '1',
  isProd: process.env.NODE_ENV === 'production',
  sessionDays: 30,
} as const
