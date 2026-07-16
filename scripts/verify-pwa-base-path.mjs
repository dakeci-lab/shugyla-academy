#!/usr/bin/env node
/**
 * Verification for GitHub Pages base path, PWA URLs, and logout/login routing.
 *
 * Usage:
 *   npm run verify:pwa-base-path
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

function buildAppUrl(relativePath, origin, basePath) {
  const normalized = String(relativePath).replace(/^\/+/, '')
  return new URL(normalized, new URL(basePath, origin)).toString()
}

function isInsideAppBase(pathname, origin, basePath) {
  const base = new URL(basePath, origin).pathname.replace(/\/$/, '') || ''
  const normalized = String(pathname).replace(/\/$/, '') || '/'
  if (!base) return normalized === '/' || normalized.startsWith('/')
  return normalized === base || normalized.startsWith(`${base}/`)
}

function main() {
  console.log('=== PWA base path verification ===\n')

  const viteConfig = read('vite.config.js')
  const basename = read('src/router/basename.js')
  const appJsx = read('src/App.jsx')
  const manifest = read('public/manifest.webmanifest')
  const registerSw = read('src/pwa/registerServiceWorker.js')
  const recovery = read('src/pwa/pwaRecovery.js')
  const errorBoundary = read('src/components/platform/PlatformErrorBoundary.jsx')
  const platformLayout = read('src/layouts/PlatformLayout.jsx')
  const appInstallBanner = read('src/components/platform/AppInstallBanner.jsx')
  const authService = read('src/services/authService.js')

  const productionOrigin = 'https://dakeci-lab.github.io'
  const productionBase = '/shugyla-academy/'

  console.log('Stage 1: Vite and router base')

  assert('vite base is /shugyla-academy/', viteConfig.includes("base: '/shugyla-academy/'"))
  assert('basename exports getAppBasePath', basename.includes('export function getAppBasePath'))
  assert('basename exports getAppUrl', basename.includes('export function getAppUrl'))
  assert('basename exports isInsideAppBase', basename.includes('export function isInsideAppBase'))
  assert('basename exports getRecoveryTargetUrl', basename.includes('export function getRecoveryTargetUrl'))
  assert('router uses getRouterBasename', appJsx.includes('basename={getRouterBasename()}'))

  console.log('Stage 2: Manifest and SW scope')

  assert('manifest start_url inside app base', manifest.includes('"/shugyla-academy/"'))
  assert('manifest scope inside app base', manifest.includes('"scope": "/shugyla-academy/"'))
  assert('manifest display standalone', manifest.includes('"display": "standalone"'))
  assert('SW registers via getAppUrl', registerSw.includes('getAppUrl('))
  assert('SW scope via getAppBasePath', registerSw.includes('getAppBasePath()'))
  assert('SW does not register /sw.js at domain root', !registerSw.includes("register('/sw.js'"))

  console.log('Stage 3: Hardcoded root URL regressions')

  assert('error boundary does not assign /login at domain root', !errorBoundary.includes("assign(LOGIN_PATH)"))
  assert('error boundary does not replace('/')', !errorBoundary.match(/replace\(['"]\/['"]\)/))
  assert('recovery does not assign origin only', !recovery.includes('location.origin'))
  assert('recovery uses getRecoveryTargetUrl', recovery.includes('getRecoveryTargetUrl'))
  assert('recovery redirects outside base on load', recovery.includes('isInsideAppBase'))
  assert('password reset uses getAppUrl', authService.includes("getAppUrl('reset-password')"))

  console.log('Stage 4: Logout and login stay inside app base')

  assert('platform layout logout uses navigate', platformLayout.includes('navigate(LOGIN_PATH'))
  assert('platform layout passes full logout handler', platformLayout.includes('onLogout={handleLogout}'))
  assert('error boundary delegates logout to parent', errorBoundary.includes('this.props.onLogout'))

  console.log('Stage 5: Runtime URL helper regression')

  assert(
    'production logout url',
    buildAppUrl('login', productionOrigin, productionBase) === `${productionOrigin}/shugyla-academy/login`
  )
  assert(
    'production home url',
    buildAppUrl('', productionOrigin, productionBase) === `${productionOrigin}/shugyla-academy/`
  )
  assert(
    'production recovery from wrong root',
    buildAppUrl('', productionOrigin, productionBase) === `${productionOrigin}/shugyla-academy/`
  )
  assert(
    'inside app base for platform route',
    isInsideAppBase('/shugyla-academy/platform', productionOrigin, productionBase)
  )
  assert(
    'outside app base for domain root',
    !isInsideAppBase('/', productionOrigin, productionBase)
  )
  assert(
    'localhost stays at root',
    isInsideAppBase('/login', 'http://localhost:5173', '/')
  )

  console.log('Stage 6: AppInstallBanner standalone guard')

  assert('AppInstallBanner uses isPwaStandalone in render', appInstallBanner.includes('isPwaStandalone()'))
  assert('AppInstallBanner has no isStandalone typo', !appInstallBanner.includes('isStandalone()'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
