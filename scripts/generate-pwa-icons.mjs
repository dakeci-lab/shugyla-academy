#!/usr/bin/env node
/**
 * Generate Shugyla PWA icon sizes from public/icons/icon-master.png
 * (rounded green card + white geometric S on transparent canvas).
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
const MASTER = path.join(OUT_DIR, 'icon-master.png')

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

function gradientSvg(size) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2fad66"/>
      <stop offset="100%" stop-color="#228a4f"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
</svg>`)
}

async function writeAny(sharp, size, file, { maskable = false } = {}) {
  const bg = await sharp(gradientSvg(size)).png().toBuffer()
  // Maskable keeps ~82% content (safe zone). Standard icons are full-bleed
  // so iOS/Android can apply their own squircle mask without white corners.
  const scale = maskable ? 0.82 : 1
  const inner = Math.round(size * scale)
  const offset = Math.round((size - inner) / 2)
  const icon = await sharp(MASTER)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer()

  await sharp(bg)
    .composite([{ input: icon, left: offset, top: offset }])
    .png({ compressionLevel: 9, palette: true, colors: 64, effort: 10 })
    .toFile(path.join(OUT_DIR, file))
}

async function main() {
  if (!fs.existsSync(MASTER)) {
    console.error(`Missing master icon: ${MASTER}`)
    process.exit(1)
  }

  const sharp = await loadSharp()
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
    await writeAny(sharp, job.size, job.file, { maskable: !!job.maskable })
    console.log(`  ✓ ${job.file} (${job.size}×${job.size}${job.maskable ? ', maskable' : ''})`)
  }

  console.log(`\nIcons written to ${OUT_DIR}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
