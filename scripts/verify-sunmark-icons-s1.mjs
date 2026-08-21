#!/usr/bin/env node
/**
 * Sunmark S1: PWA icons regenerated from brand on-white.
 *
 * Usage:
 *   npm run verify:sunmark-icons-s1
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let checks = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath))
}

function assert(label, condition) {
  checks += 1
  if (!condition) throw new Error(`FAIL: ${label}`)
  console.log(`  ✓ ${label}`)
}

async function loadSharp() {
  try {
    return (await import('sharp')).default
  } catch {
    const result = spawnSync('npm', ['install', '--no-save', 'sharp@0.34.2'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    if (result.status !== 0) process.exit(result.status || 1)
    return (await import('sharp')).default
  }
}

const gen = read('scripts/generate-pwa-icons.mjs')
const readme = read('src/assets/brand/README.txt')
const indexHtml = read('index.html')
const manifest = read('public/manifest.webmanifest')
const sw = read('public/sw.js')

assert(
  'brand on-white + source present',
  exists('src/assets/brand/logo/icon-sunmark-on-white.png') &&
    exists('src/assets/brand/logo/icon-sunmark-source.png')
)
assert(
  'generator reads icon-sunmark-on-white.png',
  gen.includes('icon-sunmark-on-white.png') && gen.includes('BRAND_ON_WHITE')
)
assert(
  'generator has no green gradientSvg',
  !gen.includes('gradientSvg') && !gen.includes('#2fad66') && !gen.includes('linearGradient')
)
assert(
  'maskable content scale is 0.50–0.60 (not legacy 0.82)',
  gen.includes('MASKABLE_CONTENT_SCALE') &&
    /MASKABLE_CONTENT_SCALE\s*=\s*0\.5[0-9]/.test(gen) &&
    !gen.includes('0.82')
)
assert(
  'palette quantize disabled for brand colors',
  !gen.includes('palette: true')
)
assert(
  'no favicon.ico created/required',
  !exists('public/favicon.ico') && !gen.includes('favicon.ico')
)
assert(
  'index/manifest/sw still use pwa-icons paths (unchanged)',
  indexHtml.includes('pwa-icons/icon-192.png') &&
    manifest.includes('pwa-icons/icon-192.png') &&
    sw.includes('pwa-icons/icon-192.png')
)

const required = [
  'icon-master.png',
  'icon-48.png',
  'icon-64.png',
  'icon-128.png',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
]

for (const file of required) {
  assert(`public/icons/${file} exists`, exists(`public/icons/${file}`))
}

assert(
  'README documents PWA generation from on-white',
  /PWA|pwa|generate-pwa-icons/i.test(readme) && /on-white/i.test(readme)
)

const sharp = await loadSharp()
const metaJobs = [
  ['icon-48.png', 48],
  ['icon-64.png', 64],
  ['icon-128.png', 128],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['icon-maskable-192.png', 192],
  ['icon-maskable-512.png', 512],
  ['icon-master.png', 1024],
]

for (const [file, size] of metaJobs) {
  const meta = await sharp(path.join(ROOT, 'public', 'icons', file)).metadata()
  assert(
    `${file} is ${size}×${size}`,
    meta.width === size && meta.height === size
  )
}

// Corner of any-192 should be near-white (not green gradient).
const { data, info } = await sharp(path.join(ROOT, 'public', 'icons', 'icon-192.png'))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })
const i = 0
const r = data[i]
const g = data[i + 1]
const b = data[i + 2]
assert(
  'icon-192 corner is white-ish (not green gradient)',
  r > 240 && g > 240 && b > 240
)

const maskMeta = await sharp(path.join(ROOT, 'public', 'icons', 'icon-maskable-512.png')).metadata()
assert('maskable-512 present at 512', maskMeta.width === 512 && maskMeta.height === 512)

// Re-import scale constant from generator module semantics via regex (already checked).
const { MASKABLE_CONTENT_SCALE } = await import(
  pathToFileURL(path.join(ROOT, 'scripts', 'generate-pwa-icons.mjs')).href
).catch(() => ({}))
if (typeof MASKABLE_CONTENT_SCALE === 'number') {
  assert(
    'exported MASKABLE_CONTENT_SCALE in range',
    MASKABLE_CONTENT_SCALE >= 0.5 && MASKABLE_CONTENT_SCALE <= 0.6
  )
}

console.log(`\n${checks}/${checks} checks passed`)
