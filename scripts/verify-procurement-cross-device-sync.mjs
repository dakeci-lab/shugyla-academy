#!/usr/bin/env node
/**
 * Verify procurement cross-device sync + secure RLS readiness.
 *
 * Usage:
 *   npm run verify:procurement-cross-device-sync
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
  console.log('=== Procurement cross-device sync verification ===\n')

  const platformCtx = read('src/context/PlatformDataContext.jsx')
  const cloudStore = read('src/lib/cloudStore.js')
  const supabaseAdapter = read('src/services/supabaseDataAdapter.js')
  const platformService = read('src/services/platformDataService.js')
  const page = read('src/pages/platform/procurement/ProcurementPage.jsx')
  const purchaseService = read('src/services/purchaseDataService.js')
  const optimistic = read('src/services/purchaseOptimisticService.js')
  const migration = read('supabase/migrations/20260717210000_secure_procurement_rls.sql')
  const sw = read('public/sw.js')

  console.log('Stage 1: Auth-gated cloud bootstrap')
  assert('waits for AUTH_STATUS', platformCtx.includes('AUTH_STATUS.LOADING'))
  assert('requires supabaseAuthenticated', platformCtx.includes('supabaseAuthenticated'))
  assert('exposes loadError', platformCtx.includes('loadError'))
  assert('classifies access errors', platformCtx.includes("code: 'access'"))

  console.log('Stage 2: Purchase fetch failure isolation (Stage 1)')
  assert('soft-fails non-procurement tables', supabaseAdapter.includes('settleTableResult'))
  assert(
    'fetchAllData does not hard-throw purchases',
    !/purchasesResult\.status === 'rejected'[\s\S]{0,120}throw purchasesResult/.test(supabaseAdapter)
  )
  assert(
    'fetchAllData does not hard-throw receiving',
    !/receivingResult\.status === 'rejected'[\s\S]{0,120}throw receivingResult/.test(supabaseAdapter)
  )
  assert('module load states for procurement', cloudStore.includes("'procurement'"))
  assert('purchases loading vs ready helpers', purchaseService.includes('isPurchasesDataReady'))

  console.log('Stage 3: Procurement refresh works after partial boot')
  assert('ensureCloudStoreReady exists', cloudStore.includes('ensureCloudStoreReady'))
  assert('patchCloudStore boots store if needed', cloudStore.includes('if (!store.loaded)'))
  assert('refreshProcurement uses ensureCloudStoreReady', platformService.includes('ensureCloudStoreReady()'))
  assert('refreshProcurement surfaces purchase errors', platformService.includes("throw purchasesResult.reason"))
  assert('refreshProcurement marks module error', platformService.includes("markModuleError('procurement'"))

  console.log('Stage 4: Procurement page sync + error UX')
  assert('page reloads procurement on open', page.includes('reloadProcurement()'))
  assert('page shows toast on load error', page.includes('showError(message)'))
  assert('empty state uses load error message', page.includes('if (procurementLoadError) return procurementLoadError'))
  assert('does not treat load error as empty catalog only', page.includes('procurementLoadError'))
  assert('empty state waits for module loading', page.includes('isPurchasesDataLoading'))
  assert('empty state shows loading copy', page.includes('Загрузка закупов'))
  assert('manual refresh button present', page.includes('Обновить'))

  console.log('Stage 4b: Realtime without aggressive polling')
  const realtime = read('src/services/procurementRealtimeService.js')
  const realtimeHook = read('src/hooks/useProcurementRealtime.js')
  const layout = read('src/layouts/PlatformLayout.jsx')
  assert('subscribes to purchase_orders', realtime.includes("'purchase_orders'"))
  assert('subscribes to purchase_order_items', realtime.includes("'purchase_order_items'"))
  assert('subscribes to receiving_documents', realtime.includes("'receiving_documents'"))
  assert('subscribes to receiving_items', realtime.includes("'receiving_items'"))
  assert('debounced sync', realtime.includes('DEBOUNCE_MS'))
  assert('no 5s polling', !/\b5000\b/.test(realtime) && !realtime.includes('setInterval'))
  assert('no 10s polling', !/\b10000\b/.test(realtime))
  assert('no 15s polling interval', !realtime.includes('POLL_INTERVAL') && !realtime.includes('setInterval'))
  assert('visibility refresh', realtime.includes('visibilitychange'))
  assert('online refresh', realtime.includes("'online'"))
  assert('channel cleanup', realtime.includes('removeChannel'))
  assert('hook uses realtime service', realtimeHook.includes('subscribeProcurementRealtime'))
  assert('layout enables realtime on procurement routes', layout.includes('useProcurementRealtime'))
  const itemPub = read('supabase/migrations/20260728220000_procurement_realtime_item_tables.sql')
  assert('item tables publication migration', itemPub.includes('purchase_order_items'))
  assert('receiving_items publication migration', itemPub.includes('receiving_items'))

  console.log('Stage 5: Source of truth')
  assert('cloud list reads cloudStore + overlay', purchaseService.includes('getCloudPurchases()'))
  assert('sync source gated on module ready', purchaseService.includes("isModuleReady('procurement')"))
  assert('optimistic create syncs to supabase', optimistic.includes('syncSimplePurchaseCloud'))
  assert('overlay is merge-only for pending/error', read('src/services/purchaseOptimisticStore.js').includes('getOptimisticOverlayForMerge'))
  console.log('Stage 6: Secure RLS migration')
  assert('migration revokes anon purchase_orders', migration.includes('revoke all on table public.purchase_orders from anon'))
  assert('migration requires active employee helper', migration.includes('current_employee_is_active'))
  assert(
    'no open all-access policy created',
    !/create policy[\s\S]{0,200}using\s*\(\s*true\s*\)/i.test(migration)
  )
  assert('authenticated select policy for purchase_orders', migration.includes('purchase_orders_select_active_employee'))
  assert('receiving tables secured', migration.includes('receiving_documents_select_active_employee'))

  console.log('Stage 7: Service worker does not cache Supabase')
  assert('supabase treated as external', sw.includes('isSupabaseOrExternal'))
  assert('external requests bypass shell cache', sw.includes('isSupabaseOrExternal(url)'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
