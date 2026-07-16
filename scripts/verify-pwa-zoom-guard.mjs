#!/usr/bin/env node
/**
 * Verification for PWA standalone zoom guard.
 *
 * Usage:
 *   npm run verify:pwa-zoom-guard
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let testsRun = 0
let testsPassed = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function main() {
  console.log('=== PWA zoom guard verification ===\n')

  const indexHtml = read('index.html')
  const indexCss = read('src/index.css')
  const mainJsx = read('src/main.jsx')
  const pwaStandalone = read('src/utils/pwaStandalone.js')
  const zoomGuard = read('src/pwa/pwaZoomGuard.js')
  const manifest = read('public/manifest.webmanifest')
  const sw = read('public/sw.js')

  console.log('Stage 1: Early viewport in index.html')

  assert('inline standalone detection script', indexHtml.includes('display-mode: standalone'))
  assert('inline fullscreen detection', indexHtml.includes('display-mode: fullscreen'))
  assert('inline navigator.standalone check', indexHtml.includes('navigator.standalone'))
  assert('inline pwa-standalone class', indexHtml.includes("classList.add('pwa-standalone')"))
  assert('inline fixed viewport for PWA', indexHtml.includes('user-scalable=no'))
  assert('inline maximum-scale=1', indexHtml.includes('maximum-scale=1'))
  assert(
    'single viewport meta',
    (indexHtml.match(/<meta\s+name="viewport"/g) || []).length === 1
  )

  console.log('Stage 2: Standalone utility')

  assert('shared isPwaStandalone export', pwaStandalone.includes('export function isPwaStandalone'))
  assert('fullscreen display mode', pwaStandalone.includes('display-mode: fullscreen'))
  assert('viewport helper', pwaStandalone.includes('applyPwaStandaloneViewport'))
  assert('root class helper', pwaStandalone.includes('markPwaStandaloneRoot'))

  console.log('Stage 3: Zoom guard handlers')

  assert('gesturestart blocked', zoomGuard.includes("'gesturestart'"))
  assert('gesturechange blocked', zoomGuard.includes("'gesturechange'"))
  assert('gestureend blocked', zoomGuard.includes("'gestureend'"))
  assert('multi-touch touchmove guard', zoomGuard.includes('event.touches.length > 1'))
  assert('passive false for zoom guard', zoomGuard.includes('passive: false'))
  assert('standalone-only guard', zoomGuard.includes('isPwaStandalone'))
  assert('cleanup removes listeners', zoomGuard.includes('removeEventListener'))

  console.log('Stage 4: CSS scoped to standalone')

  assert('pwa-standalone touch-action pan', indexCss.includes('html.pwa-standalone'))
  assert('touch-action pan-x pan-y', indexCss.includes('touch-action: pan-x pan-y'))
  assert('no global touch-action none', !indexCss.match(/html\.pwa-standalone[\s\S]*touch-action:\s*none/))
  assert('form font-size 16px in standalone', indexCss.includes('html.pwa-standalone input'))
  assert('no global body overflow hidden in zoom guard css', !indexCss.includes('html.pwa-standalone body {\n  overflow: hidden'))

  console.log('Stage 5: App bootstrap')

  assert('main initializes standalone document', mainJsx.includes('setupPwaStandaloneDocument'))
  assert('main initializes zoom guard', mainJsx.includes('setupPwaZoomGuard'))

  console.log('Stage 6: PWA manifest and SW cache')

  assert('manifest display standalone', manifest.includes('"display": "standalone"'))
  assert('manifest not browser mode', !manifest.includes('"display": "browser"'))
  assert('service worker cache bumped', sw.includes('shugyla-academy-shell-v3'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
