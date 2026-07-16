#!/usr/bin/env node
/**
 * Verification for PWA standalone zoom guard, shell recovery, and SW strategy.
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
  const recovery = read('src/pwa/pwaRecovery.js')
  const shellCache = read('src/pwa/pwaShellCache.js')
  const errorBoundary = read('src/components/platform/PlatformErrorBoundary.jsx')
  const manifest = read('public/manifest.webmanifest')
  const sw = read('public/sw.js')

  console.log('Stage 1: Early viewport in index.html')

  assert('inline standalone detection script', indexHtml.includes('display-mode: standalone'))
  assert('inline fullscreen detection', indexHtml.includes('display-mode: fullscreen'))
  assert('inline navigator.standalone check', indexHtml.includes('navigator.standalone'))
  assert('inline pwa-standalone class', indexHtml.includes("classList.add('pwa-standalone')"))
  assert('inline fixed viewport for PWA', indexHtml.includes('user-scalable=no'))
  assert('inline maximum-scale=1', indexHtml.includes('maximum-scale=1'))
  assert('inline script wrapped in try/catch', indexHtml.includes('Early PWA setup failed'))
  assert(
    'single viewport meta',
    (indexHtml.match(/<meta\s+name="viewport"/g) || []).length === 1
  )

  console.log('Stage 2: Standalone utility')

  assert('shared isPwaStandalone export', pwaStandalone.includes('export function isPwaStandalone'))
  assert('isPwaStandalone has try/catch', pwaStandalone.includes('Failed to detect PWA standalone mode'))
  assert('isPwaStandalone returns boolean', pwaStandalone.includes('return false'))
  assert('fullscreen display mode', pwaStandalone.includes('display-mode: fullscreen'))
  assert('viewport helper', pwaStandalone.includes('applyPwaStandaloneViewport'))
  assert('root class helper', pwaStandalone.includes('markPwaStandaloneRoot'))

  console.log('Stage 3: Zoom guard handlers')

  assert('installPwaZoomGuard export', zoomGuard.includes('export function installPwaZoomGuard'))
  assert('gesturestart blocked', zoomGuard.includes("'gesturestart'"))
  assert('gesturechange blocked', zoomGuard.includes("'gesturechange'"))
  assert('gestureend blocked', zoomGuard.includes("'gestureend'"))
  assert('multi-touch touchmove guard', zoomGuard.includes('event.touches.length > 1'))
  assert('passive false for zoom guard', zoomGuard.includes('passive: false'))
  assert('standalone-only guard', zoomGuard.includes('isPwaStandalone'))
  assert('cleanup removes listeners', zoomGuard.includes('removeEventListener'))
  assert('zoom guard isolated with try/catch', zoomGuard.includes('PWA zoom guard could not be installed'))

  console.log('Stage 4: CSS scoped to standalone')

  assert('pwa-standalone touch-action pan', indexCss.includes('html.pwa-standalone'))
  assert('touch-action pan-x pan-y', indexCss.includes('touch-action: pan-x pan-y'))
  assert('no global touch-action none', !indexCss.match(/html\.pwa-standalone[\s\S]*touch-action:\s*none/))
  assert('form font-size 16px in standalone', indexCss.includes('html.pwa-standalone input'))
  assert('no global body overflow hidden in zoom guard css', !indexCss.includes('html.pwa-standalone body {\n  overflow: hidden'))

  console.log('Stage 5: App bootstrap order')

  const renderCall = "createRoot(document.getElementById('root')).render("

  assert('main renders React before zoom guard', mainJsx.indexOf(renderCall) < mainJsx.indexOf('installPwaZoomGuard()'))
  assert('main initializes standalone document after render', mainJsx.indexOf(renderCall) < mainJsx.indexOf('setupPwaStandaloneDocument()'))
  assert('zoom guard wrapped in try/catch', mainJsx.includes('Optional PWA zoom protection failed'))
  assert('shell recovery setup before render', mainJsx.indexOf('setupShellLoadRecovery') < mainJsx.indexOf(renderCall))

  console.log('Stage 6: PWA shell recovery')

  assert('recoverPwaShell export', recovery.includes('export async function recoverPwaShell'))
  assert('recovery uses sessionStorage guard', recovery.includes('PWA_SHELL_RECOVERY_KEY'))
  assert('recovery clears shell caches only', recovery.includes('clearShellCaches'))
  assert('recovery does not clear auth storage', !recovery.includes('localStorage.clear'))
  assert('isPwaShellLoadError export', recovery.includes('export function isPwaShellLoadError'))
  assert('recovery uses getRecoveryTargetUrl', recovery.includes('getRecoveryTargetUrl'))
  assert('bootstrap failure logging includes href', recovery.includes('href:'))
  assert('shell cache prefix matches SW', shellCache.includes('shugyla-academy-shell-'))

  console.log('Stage 7: Error boundary recovery')

  assert('error boundary shows error id', errorBoundary.includes('errorId'))
  assert('error boundary logs bootstrap failure', errorBoundary.includes('logPlatformBootstrapFailure'))
  assert('reload triggers recoverPwaShell for shell errors', errorBoundary.includes('recoverPwaShell'))
  assert('retry resets error state only', errorBoundary.includes('handleRetry') && errorBoundary.includes('retryKey'))

  console.log('Stage 8: PWA manifest and SW cache')

  assert('manifest display standalone', manifest.includes('"display": "standalone"'))
  assert('manifest not browser mode', !manifest.includes('"display": "browser"'))
  assert('service worker cache v4', sw.includes('shugyla-academy-shell-v4'))
  assert('SW deletes old shell caches', sw.includes('SHELL_CACHE_PREFIX'))
  assert('SW network-first navigation', sw.includes('handleNavigate'))
  assert('SW does not cache Supabase', sw.includes('supabase.co'))
  assert('SW validates response.ok before cache', sw.includes('response.ok'))
  assert('SW hashed assets network-only', sw.includes('isHashedAsset') && sw.includes('return fetch(request)'))
  assert('SW SKIP_WAITING message handler', sw.includes("type === 'SKIP_WAITING'"))
  assert('SW does not cache non-GET', sw.includes("request.method !== 'GET'"))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
