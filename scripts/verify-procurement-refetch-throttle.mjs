#!/usr/bin/env node
/**
 * Verify that passive triggers no longer re-download the whole procurement
 * module (prod: ~150 full reloads/day, each paging every order item).
 *
 * Runs the REAL platformDataService + cloudStore against a stubbed fetch, so it
 * counts actual PostgREST requests instead of grepping source.
 *
 * Usage: npm run verify:procurement-refetch-throttle
 */
import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

globalThis.__VITE_ENV__ = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
}

let restRequests = 0
let responseDelayMs = 0
globalThis.fetch = async (input) => {
  const url = String(typeof input === 'string' ? input : input?.url ?? input)
  if (url.includes('/rest/v1/')) {
    restRequests += 1
    if (responseDelayMs) await new Promise((r) => setTimeout(r, responseDelayMs))
  }
  return new Response('[]', {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-range': '*/0' },
  })
}

let testsRun = 0
function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`)
  console.log(`  ✓ ${name}`)
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

async function main() {
  console.log('=== Procurement refetch throttle verification ===\n')

  const store = await import(pathToFileURL(path.join(ROOT, 'src/lib/cloudStore.js')))
  const service = await import(pathToFileURL(path.join(ROOT, 'src/services/platformDataService.js')))
  const freshness = await import(pathToFileURL(path.join(ROOT, 'src/lib/procurementFreshness.js')))

  console.log('Stage 1: module freshness in cloudStore')
  store.clearCloudStore()
  assert('never loaded → loadedAt 0', store.getModuleLoadedAt('procurement') === 0)
  assert('never loaded → not fresh', store.isModuleFresh('procurement', 60_000) === false)
  store.markModuleReady('procurement')
  assert('ready → fresh within window', store.isModuleFresh('procurement', 60_000) === true)
  assert('maxAgeMs 0 is never fresh', store.isModuleFresh('procurement', 0) === false)
  store.markModuleLoading('procurement')
  assert('loading → not fresh', store.isModuleFresh('procurement', 60_000) === false)
  store.clearCloudStore()
  assert('clearCloudStore resets loadedAt', store.getModuleLoadedAt('procurement') === 0)

  console.log('\nStage 2: refreshProcurementData against stubbed PostgREST')
  store.clearCloudStore()
  restRequests = 0
  await service.refreshProcurementData()
  const oneCycle = restRequests
  assert('forced refresh hits the network', oneCycle > 0, `requests=${oneCycle}`)

  restRequests = 0
  await service.refreshProcurementData({ maxAgeMs: freshness.PROCUREMENT_FRESH_MS })
  assert('soft refresh right after load makes 0 requests', restRequests === 0, `requests=${restRequests}`)

  restRequests = 0
  await Promise.all([
    service.refreshProcurementData({ maxAgeMs: freshness.PROCUREMENT_FRESH_MS }),
    service.refreshProcurementData({ maxAgeMs: freshness.PROCUREMENT_FRESH_MS }),
    service.refreshProcurementData({ maxAgeMs: freshness.PROCUREMENT_FRESH_MS }),
  ])
  assert('parallel soft refreshes make 0 requests while fresh', restRequests === 0)

  restRequests = 0
  await service.refreshProcurementData()
  assert('forced refresh still always fetches', restRequests === oneCycle, `requests=${restRequests}`)

  restRequests = 0
  responseDelayMs = 20
  await Promise.all([
    service.refreshProcurementData(),
    service.refreshProcurementData(),
    service.refreshProcurementData(),
    service.refreshProcurementData(),
  ])
  responseDelayMs = 0
  assert(
    'burst of 4 forced refreshes collapses to at most 2 network cycles',
    restRequests <= oneCycle * 2,
    `requests=${restRequests}, one cycle=${oneCycle}`
  )
  assert('burst still performs a trailing refresh (data may predate the mutation)', restRequests >= oneCycle * 2)

  console.log('\nStage 3: wiring')
  const page = read('src/pages/platform/orders/OrdersPage.jsx')
  const ctx = read('src/context/PlatformDataContext.jsx')
  const hook = read('src/hooks/useProcurementRealtime.js')
  const realtime = read('src/services/procurementRealtimeService.js')
  assert('orders page mount is freshness-gated', /reloadProcurement\(\{\s*maxAgeMs:\s*PROCUREMENT_FRESH_MS\s*\}\)/.test(page))
  assert('context forwards options', ctx.includes('refreshProcurementData(options)'))
  assert('passive realtime triggers are freshness-gated', hook.includes('maxAgeMs: PROCUREMENT_FRESH_MS'))
  assert('realtime debounce is >= 2s', freshness.PROCUREMENT_REALTIME_DEBOUNCE_MS >= 2_000)
  assert('realtime stale window is >= 60s', freshness.PROCUREMENT_FRESH_MS >= 60_000)
  assert('realtime burst has a max-wait cap', realtime.includes('MAX_WAIT_MS') && realtime.includes('burstStartedAt'))
  assert('mutation paths still force a refresh', /async function afterPurchaseMutation\(\)\s*\{\s*if \(isCloudMode\(\)\) \{\s*await refreshProcurementData\(\)/.test(read('src/services/purchaseDataService.js')))
  assert('verify script registered', read('package.json').includes('verify:procurement-refetch-throttle'))

  console.log(`\nAll ${testsRun} checks passed.`)
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(`\nFAILED: ${error.message}`)
  process.exit(1)
})
