#!/usr/bin/env node
/**
 * Verification — orders are loaded by period (a window), and a realtime event re-reads only the changed orders.
 *
 * Usage: npm run verify:orders-period-load
 */
import fs from 'fs'
import path from 'path'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}

const adapter = read('src/services/purchaseSupabaseAdapter.js')
assert.match(adapter, /fetchPurchasesDataCloud\(\{ fromDateKey = null \} = \{\}\)/)
assert.match(adapter, /created_at\.gte\.\$\{fromDateKey\}T00:00:00Z,expected_delivery_date\.gte\.\$\{fromDateKey\},status\.eq\.draft/)
ok('the list query is a window: created or delivered since the border, plus every draft')

const service = read('src/services/platformDataService.js')
assert.match(service, /ORDERS_WINDOW_DAYS = 45/)
assert.match(service, /export async function ensurePurchaseOrdersFrom/)
assert.match(service, /export async function refreshPurchaseOrdersByIds/)
assert.match(service, /fetchPurchasesModuleData\(purchasesFetchOptions\(\)\)/)
ok('45-day window by default; an earlier period in the filter widens it; full reloads keep the widened border')

for (const page of ['src/pages/platform/orders/OrdersPage.jsx', 'src/pages/platform/procurement/PurchaseDocumentsPage.jsx']) {
  assert.match(read(page), /ensureOrdersFrom\(filter\.dateFrom\)/)
}
ok('«Закуп» and «Приёмка» ask for older orders when the filter period starts before the window')

const realtime = read('src/services/procurementRealtimeService.js')
assert.match(realtime, /PROCUREMENT_REALTIME_TABLES = \['purchase_orders'\]/)
assert.match(realtime, /payload\?\.new\?\.id \?\? payload\?\.old\?\.id/)
assert.match(realtime, /onSync\(\{ source, orderIds \}\)/)
assert.match(read('src/hooks/useProcurementRealtime.js'), /reloadOrdersRef\.current\(orderIds\)/)
ok('a realtime event names the changed orders and only their headers are re-read (no full list reload per edit)')

const { mergeCloudPurchases, putCloudPurchase, getCloudStore, patchCloudStore, ensureCloudStoreReady } = await import(
  pathToFileURL(path.join(ROOT, 'src/lib/cloudStore.js')).href
)
ensureCloudStoreReady()
patchCloudStore({ purchases: [{ id: 'a', n: 1 }, { id: 'b', n: 1 }] })
mergeCloudPurchases([{ id: 'b', n: 2 }, { id: 'c', n: 1 }])
assert.deepEqual(
  getCloudStore().purchases.map((o) => `${o.id}${o.n}`),
  ['c1', 'a1', 'b2']
)
ok('mergeCloudPurchases updates known orders in place and puts new ones first')

console.log(`\n${checks} checks passed`)
