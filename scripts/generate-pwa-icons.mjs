#!/usr/bin/env node
/**
 * Generate Shugyla PWA icon sizes from brand sunmark on white.
 *
 * Source of truth: src/assets/brand/logo/icon-sunmark-on-white.png
 * Writes: public/icons/* (copied to dist/pwa-icons at build).
 *
 * Usage:
 *   node scripts/generate-pwa-icons.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'icons')
const BRAND_ON_WHITE = path.join(
  ROOT,
  'src',
  'assets',
  'brand',
  'logo',
  'icon-sunmark-on-white.png'
)
const MASTER = path.join(OUT_DIR, 'icon-master.png')

/** Maskable safe-zone ~20–25% inset each side → content scale 0.50–0.60. */
export const MASKABLE_CONTENT_SCALE = 0.55

async function loadSharp() {
  try {
    return (await import('sharp')).default
  } catch {
    console.error('Installing sharp…')
    const result = spawnSync('npm', ['install', '--no-save', 'sharp@0.34.2'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    if (result.status !== 0) process.exit(result.status || 1)
    return (await import('sharp')).default
  }
}

function whitePngOptions() {
  // Full color — avoid palette quantize that muddy brand orange/green.
  return { compressionLevel: 9, effort: 10 }
}

async function writeWhiteCanvas(sharp, size) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png(whitePngOptions())
    .toBuffer()
}

/**
 * @param {import('sharp').Sharp} sharp
 * @param {number} size
 * @param {string} file
 * @param {{ maskable?: boolean }} [opts]
 */
async function writeIcon(sharp, size, file, { maskable = false } = {}) {
  const bg = await writeWhiteCanvas(sharp, size)
  // any: fill canvas with on-white (already padded). maskable: shrink for safe-zone.
  const scale = maskable ? MASKABLE_CONTENT_SCALE : 1
  const inner = Math.max(1, Math.round(size * scale))
  const offset = Math.round((size - inner) / 2)
  const icon = await sharp(BRAND_ON_WHITE)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: sharp.kernel.lanczos3,
    })
    .png(whitePngOptions())
    .toBuffer()

  await sharp(bg)
    .composite([{ input: icon, left: offset, top: offset }])
    .png(whitePngOptions())
    .toFile(path.join(OUT_DIR, file))
}

async function writeMaster(sharp) {
  await sharp(BRAND_ON_WHITE)
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: sharp.kernel.lanczos3,
    })
    .png(whitePngOptions())
    .toFile(MASTER)
}

async function main() {
  if (!fs.existsSync(BRAND_ON_WHITE)) {
    console.error(`Missing brand icon: ${BRAND_ON_WHITE}`)
    process.exit(1)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const sharp = await loadSharp()

  await writeMaster(sharp)
  console.log('  ✓ icon-master.png (1024×1024 from on-white)')

  const jobs = [
    { file: 'icon-512.png', size: 512 },
    { file: 'icon-192.png', size: 192 },
    { file: 'apple-touch-icon.png', size: 180 },
    { file: 'icon-128.png', size: 128 },
    { file: 'icon-64.png', size: 64 },
    { file: 'icon-48.png', size: 48 },
    { file: 'icon-maskable-512.png', size: 512, maskable: true },
    { file: 'icon-maskable-192.png', size: 192, maskable: true },
  ]

  for (const job of jobs) {
    await writeIcon(sharp, job.size, job.file, { maskable: !!job.maskable })
    console.log(
      `  ✓ ${job.file} (${job.size}×${job.size}${job.maskable ? `, maskable scale ${MASKABLE_CONTENT_SCALE}` : ''})`
    )
  }

  console.log(`\nIcons written to ${OUT_DIR}`)
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
