#!/usr/bin/env node
/**
 * Verification for platform bootstrap, RBAC session gate, and role start routes.
 *
 * Usage:
 *   npm run verify:app-bootstrap
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
  console.log('=== App bootstrap / role routes verification ===\n')

  const session = read('src/context/SessionContext.jsx')
  const protectedRoute = read('src/components/ProtectedRoute.jsx')
  const platformRoute = read('src/components/platform/PlatformRoute.jsx')
  const sessionGate = read('src/components/platform/PlatformSessionGate.jsx')
  const errorBoundary = read('src/components/platform/PlatformErrorBoundary.jsx')
  const layout = read('src/layouts/PlatformLayout.jsx')
  const bootstrap = read('src/platform/platformBootstrap.js')
  const permissions = read('src/config/permissions.js')
  const main = read('src/main.jsx')

  console.log('Stage 1: RBAC ready states')

  assert('setSessionUser sets rbacReady', session.includes('setRbacReady(true)'))
  assert('refreshSession sets rbacReady', /refreshSession[\s\S]*setRbacReady\(true\)/.test(session))
  assert('applyRestoredSession always sets rbacReady', /applyRestoredSession[\s\S]*setRbacReady\(true\)/.test(session))
  assert('ProtectedRoute waits for rbacReady', protectedRoute.includes('!rbacReady'))
  assert('PlatformRoute shows loader while rbac loading', platformRoute.includes('!rbacReady'))
  assert('PlatformRoute does not return bare null', !platformRoute.match(/return null/))

  console.log('Stage 2: Start route resolution')

  assert('getFirstAllowedPathFromNav exists', permissions.includes('getFirstAllowedPathFromNav'))
  assert('getFirstAllowedPlatformPath uses PLATFORM_NAV', bootstrap.includes('PLATFORM_NAV'))
  assert('resolvePlatformStartPath handles /platform index', bootstrap.includes("normalized !== '/platform'"))
  assert('getDefaultPlatformPath uses nav fallback', bootstrap.includes('getFirstAllowedPlatformPath'))
  assert('isPlatformProfileReady checks resolveUserRole', bootstrap.includes('resolveUserRole(user)'))

  console.log('Stage 3: Session gate and error boundary')

  assert('PlatformSessionGate shows AuthLoadingScreen', sessionGate.includes('AuthLoadingScreen'))
  assert('PlatformSessionGate profile error fallback', sessionGate.includes('Профиль не настроен'))
  assert('PlatformSessionGate retry action', sessionGate.includes('Повторить'))
  assert('PlatformSessionGate logout action', sessionGate.includes('Выйти из аккаунта'))
  assert('PlatformErrorBoundary title', errorBoundary.includes('Не удалось открыть платформу'))
  assert('PlatformErrorBoundary retry', errorBoundary.includes('Повторить'))
  assert('PlatformErrorBoundary logout', errorBoundary.includes('Выйти из аккаунта'))
  assert('PlatformLayout wraps shell with session gate', layout.includes('PlatformSessionGate'))
  assert('PlatformLayout wraps outlet with error boundary', layout.includes('PlatformErrorBoundary'))

  console.log('Stage 4: Role start routes (static)')

  assert('receiver in HOME route access', permissions.includes('ROLE_IDS.RECEIVER') && permissions.includes('[ROUTE_KEYS.HOME]: ALL_PLATFORM_ROLES'))
  assert('cashier in HOME route access', permissions.includes('ROLE_IDS.CASHIER'))
  assert('receiver in RECEIVING access', permissions.includes('[ROUTE_KEYS.RECEIVING]:'))
  assert('ProtectedRoute passes full user to default path', protectedRoute.includes('getDefaultPlatformPath(user)'))

  console.log('Stage 5: Chunk load recovery')

  const recovery = read('src/pwa/pwaRecovery.js')

  assert('shell recovery setup in main', main.includes('setupShellLoadRecovery'))
  assert('chunk recovery uses sessionStorage guard', recovery.includes('PWA_SHELL_RECOVERY_KEY'))
  assert('recovery flag cleared on load', recovery.includes("sessionStorage.removeItem"))
  assert('vite preload error handler', recovery.includes('vite:preloadError'))
  assert('error boundary reload uses recoverPwaShell for shell errors', errorBoundary.includes('recoverPwaShell'))
  assert('error boundary logout uses parent handler', errorBoundary.includes('this.props.onLogout'))

  console.log('Stage 6: Progressive data bootstrap (shell after Auth)')

  const academyCtx = read('src/context/AcademyDataContext.jsx')
  assert(
    'AcademyDataProvider unblocks shell before full cloud dump',
    !academyCtx.includes('(loading || !ready) && !isPublicRoute')
  )
  assert(
    'AcademyDataProvider still gates on AUTH loading',
    academyCtx.includes('AUTH_STATUS.LOADING')
  )

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
