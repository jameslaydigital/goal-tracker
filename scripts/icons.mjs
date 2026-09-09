// Rasterize public/favicon.svg into the PNG icons used for installs and the
// home screen. Run: node scripts/icons.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(ROOT, 'public', 'favicon.svg'))

const sizes = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
]

for (const { file, size } of sizes) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(join(ROOT, 'public', file))
  console.log(`wrote public/${file}`)
}
