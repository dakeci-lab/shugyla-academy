#!/usr/bin/env node
/**
 * Structural verification for Stage 1 progressive bootstrap + failure isolation.
 *
 * Usage:
 *   npm run verify:progressive-bootstrap
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
  console.log('=== Progressive bootstrap verification ===\n')

  const cloudStore = read('src/lib/cloudStore.js')
  const academyCtx = read('src/context/AcademyDataContext.jsx')
  const academySvc = read('src/services/academyDataService.js')
  const adapter = read('src/services/supabaseDataAdapter.js')
  const layout = read('src/layouts/PlatformLayout.jsx')
  const purchaseSvc = read('src/services/purchaseDataService.js')
  const receivingSvc = read('src/services/receivingDataService.js')
  const session = read('src/context/SessionContext.jsx')
  const sessionGate = read('src/components/platform/PlatformSessionGate.jsx')
  const procurementPage = read('src/pages/platform/procurement/ProcurementPage.jsx')

  console.log('Stage 1: Module load states')
  assert('cloudStore exports getModuleLoadState', cloudStore.includes('export function getModuleLoadState'))
  assert('cloudStore exports isModuleReady', cloudStore.includes('export function isModuleReady'))
  assert('cloudStore has procurement module', cloudStore.includes("'procurement'"))
  assert('cloudStore has receiving module', cloudStore.includes("'receiving'"))
  assert('isCloudStoreLoaded kept for compatibility', cloudStore.includes('export function isCloudStoreLoaded'))

  console.log('Stage 2: Shell does not wait for full dump')
  assert(
    'AcademyDataProvider does not await initializeData before ready',
    /setReady\(true\)[\s\S]*setLoading\(false\)[\s\S]*initializeData\(/.test(academyCtx)
  )
  assert(
    'DataLoadingScreen only during AUTH loading',
    academyCtx.includes("authStatus === AUTH_STATUS.LOADING") &&
      academyCtx.includes('DataLoadingScreen')
  )
  assert(
    'no global gate on loading || !ready for all routes',
    !academyCtx.includes('(loading || !ready) && !isPublicRoute')
  )
  assert('Session gate still waits for rbacReady', sessionGate.includes('!rbacReady'))

  console.log('Stage 3: Failure isolation')
  assert('fetchAllData does not throw on purchases reject', !/purchasesResult\.status === 'rejected'[\s\S]{0,80}throw/.test(adapter))
  assert('fetchAllData does not throw on receiving reject', !/receivingResult\.status === 'rejected'[\s\S]{0,80}throw/.test(adapter))
  assert('ensureModuleLoaded exists', academySvc.includes('export async function ensureModuleLoaded'))
  assert('progressive initializeData mode', academySvc.includes("mode = 'progressive'"))

  console.log('Stage 4: Loading vs empty')
  assert('purchases ready helper', purchaseSvc.includes('isPurchasesDataReady'))
  assert('purchases loading helper', purchaseSvc.includes('isPurchasesDataLoading'))
  assert('receiving ready helper', receivingSvc.includes('isReceivingDataReady'))
  assert(
    'procurement empty waits for module ready',
    procurementPage.includes('isPurchasesDataLoading') &&
      procurementPage.includes('Загрузка закупов')
  )

  console.log('Stage 5: Route-scoped realtime + bootstrap hygiene')
  assert(
    'procurement realtime gated to procurement/receiving routes',
    layout.includes('/platform/procurement') && layout.includes('/platform/receiving')
  )
  assert('getEmployees does not call fetchAllData', !/export async function getEmployees\(\)[\s\S]*fetchAllData/.test(academySvc))
  assert('getCourses does not call fetchAllData', !/export async function getCourses\(\)[\s\S]*fetchAllData/.test(academySvc))
  assert('purchase mutations refresh procurement only', purchaseSvc.includes('refreshProcurementData'))
  assert('TOKEN_REFRESHED does not clear store', /TOKEN_REFRESHED[\s\S]*setSupabaseAuthenticated\(true\)\s*return/.test(session))
  assert('logout clears cloud bootstrap', session.includes('resetCloudBootstrapState'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
