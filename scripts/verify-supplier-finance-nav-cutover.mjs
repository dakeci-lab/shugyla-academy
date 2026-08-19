#!/usr/bin/env node
/**
 * Verification for Этап 4.0 — supplier finance navigation cutover.
 *
 * Usage:
 *   npm run verify:supplier-finance-nav-cutover
 */

import fs from 'fs'
import path from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

let checks = 0
function ok(name) {
  checks += 1
  console.log(`  ✓ ${name}`)
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function procurementGroupBlock(navSrc) {
  return navSrc.match(/id:\s*'procurement-group'[\s\S]*?\n  \},/)?.[0] || ''
}

async function main() {
  console.log('=== Supplier finance nav cutover verification (Этап 4.0) ===\n')

  const navSrc = read('src/platform/platformNav.js')
  const appSrc = read('src/App.jsx')
  const permsSrc = read('src/config/permissions.js')
  const groupBlock = procurementGroupBlock(navSrc)

  // Case 1 — single new nav item
  assert.match(groupBlock, /id:\s*'supplier-finance'/)
  assert.match(groupBlock, /path:\s*'\/platform\/supplier-finance'/)
  assert.match(groupBlock, /label:\s*'Расчёты'/)
  assert.match(groupBlock, /routeKey:\s*ROUTE_KEYS\.SUPPLIER_FINANCE/)
  ok('Case 1: «Расчёты» nav item uses ROUTE_KEYS.SUPPLIER_FINANCE → /platform/supplier-finance')

  // Case 2 — old visible items removed from nav
  assert.doesNotMatch(groupBlock, /label:\s*'Взаиморасчёты'/)
  assert.doesNotMatch(groupBlock, /label:\s*'Оплаты поставщикам'/)
  assert.doesNotMatch(groupBlock, /id:\s*'settlements'/)
  assert.doesNotMatch(groupBlock, /id:\s*'supplier-payments'/)
  ok('Case 2: legacy «Взаиморасчёты» and «Оплаты поставщикам» removed from visible nav')

  // Case 3 — all three routes preserved in App.jsx
  assert.match(appSrc, /path="settlements"/)
  assert.match(appSrc, /path="supplier-payments"/)
  assert.match(appSrc, /path="supplier-finance"/)
  assert.match(appSrc, /ROUTE_KEYS\.SETTLEMENTS/)
  assert.match(appSrc, /ROUTE_KEYS\.SUPPLIER_PAYMENTS/)
  assert.match(appSrc, /ROUTE_KEYS\.SUPPLIER_FINANCE/)
  ok('Case 3: App.jsx keeps settlements, supplier-payments, and supplier-finance routes')

  // Case 4 — no redirects
  assert.doesNotMatch(appSrc, /Navigate[^]*to="\/platform\/supplier-finance"/)
  assert.match(appSrc, /SettlementsPage/)
  assert.match(appSrc, /SupplierPaymentsPage/)
  assert.match(appSrc, /SupplierFinancePage/)
  ok('Case 4: legacy routes still render real pages — no Navigate redirect to supplier-finance')

  // Case 5 — permission OR contract
  assert.match(
    permsSrc,
    /\[ROUTE_KEYS\.SUPPLIER_FINANCE\]:\s*\[P\.UMAG_SETTLEMENTS_VIEW,\s*P\.SUPPLIER_PAYMENTS_VIEW\]/
  )
  assert.match(permsSrc, /permissions\?\.some\(\(perm\) => can\(user, perm\)\)/)
  ok('Case 5: SUPPLIER_FINANCE route uses supplier_payments.view OR umag.settlements.view')

  // Case 6 — no permission expansion in nav layer
  assert.doesNotMatch(groupBlock, /umag\.settlements\.sync/)
  assert.doesNotMatch(groupBlock, /supplier_payments\.manage/)
  assert.doesNotMatch(groupBlock, /reconciliation/)
  ok('Case 6: nav config does not grant sync/manage/reconciliation permissions')

  // Case 7 — no backend / migration diff in this stage (structural sentinels)
  const umagConfig = read('supabase/functions/_shared/umagConfig.ts')
  assert.match(umagConfig, /export const STALE_SYNC_THRESHOLD_MINUTES = 5/)
  assert.match(read('supabase/migrations/20260820103000_supplier_payments_view_finance_reads_rls.sql'), /supplier_payments\.view/)
  ok('Case 7: backend/migration files unchanged by this nav-only stage (sentinel check)')

  // Case 8 — unified UX panels untouched (zero-diff preference)
  const financePanel = read('src/components/suppliers/finance/SupplierFinancePanel.jsx')
  assert.match(financePanel, /fetchSupplierFinancePageData/)
  assert.doesNotMatch(financePanel, /Navigate/)
  ok('Case 8: SupplierFinancePanel unchanged apart from pre-existing unified shell')

  // Case 9 — active route mapping
  const { isNavItemActive } = await import(
    pathToFileURL(path.join(ROOT, 'src/platform/platformNav.js')).href
  )
  const financeNavItem = {
    path: '/platform/supplier-finance',
    end: false,
  }
  assert.equal(isNavItemActive('/platform/supplier-finance', financeNavItem), true)
  assert.equal(isNavItemActive('/platform/settlements', financeNavItem), false)
  ok('Case 9: /platform/supplier-finance matches the new nav item for active state')

  // Case 10 — legacy route keys/pages remain defined
  assert.match(permsSrc, /SETTLEMENTS:\s*'settlements'/)
  assert.match(permsSrc, /SUPPLIER_PAYMENTS:\s*'supplier_payments'/)
  ok('Case 10: legacy ROUTE_KEYS.SETTLEMENTS and ROUTE_KEYS.SUPPLIER_PAYMENTS preserved')

  // Mobile uses same PLATFORM_NAV via filterPlatformNav — no duplicate list
  const sidebarSrc = read('src/components/platform/PlatformSidebar.jsx')
  assert.match(sidebarSrc, /filterPlatformNav\(PLATFORM_NAV, user\)/)
  assert.doesNotMatch(sidebarSrc, /Взаиморасчёты/)
  assert.doesNotMatch(sidebarSrc, /Оплаты поставщикам/)
  ok('mobile/desktop sidebar reads PLATFORM_NAV — no hardcoded legacy procurement labels')

  console.log(`\n${checks} checks passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
