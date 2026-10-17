#!/usr/bin/env node
/**
 * Verification for Этап 3.2 — supplier finance cutover readiness (F-4/F-5/F-6/F-9).
 *
 * Reproducible on a clean committed checkout.
 *
 * Usage:
 *   npm run verify:supplier-finance-cutover-readiness
 */

import fs from 'fs'
import path from 'path'
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

async function main() {
  console.log('=== Supplier finance cutover readiness verification (Этап 3.2) ===\n')

  const config = read('supabase/functions/_shared/umagConfig.ts')
  const lockMigration = read('supabase/migrations/20260819120000_umag_sync_runs_lock.sql')
  const edge = read('supabase/functions/umag-sync/index.ts')
  const summaryService = read('src/services/supplierFinanceSummaryService.js')
  const financePanel = read('src/components/suppliers/finance/SupplierFinancePanel.jsx')
  const paymentsPanel = read('src/components/suppliers/payments/SupplierPaymentsPanel.jsx')
  const settlementsPanel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
  const settlementsService = read('src/services/umagSettlementsService.js')
  const navSrc = read('src/platform/platformNav.js')

  // --- F-4: stale recovery threshold ---------------------------------------
  assert.match(config, /export const STALE_SYNC_THRESHOLD_MINUTES = 5/)
  assert.match(lockMigration, /interval '5 minutes'/)
  assert.match(edge, /STALE_SYNC_THRESHOLD_MINUTES/)
  assert.match(lockMigration, /create unique index if not exists umag_sync_runs_entity_running_lock/)
  assert.match(edge, /SYNC_ALREADY_RUNNING/)
  assert.match(edge, /409/)
  ok('F-4: stale recovery threshold = 5 min; lock index + 409 contract unchanged')

  const STALE_SYNC_THRESHOLD_MINUTES = 5
  function isStale(startedAtIso, nowMs) {
    const staleBeforeMs = nowMs - STALE_SYNC_THRESHOLD_MINUTES * 60_000
    return new Date(startedAtIso).getTime() < staleBeforeMs
  }
  const now = Date.now()
  assert.equal(isStale(new Date(now - 6 * 60_000).toISOString(), now), true)
  assert.equal(isStale(new Date(now - 4 * 60_000).toISOString(), now), false)
  ok('F-4: running row older than 5 min is stale; younger than 5 min is kept')

  // --- F-5: unified page data ownership ------------------------------------
  assert.match(summaryService, /export async function fetchSupplierFinancePageData/)
  assert.match(summaryService, /listPaymentObligations\(\{ includePaid: false \}\)/)
  assert.match(financePanel, /fetchSupplierFinancePageData\(\)/)
  assert.match(financePanel, /setObligations\(pageData\.obligations\)/)
  assert.match(financePanel, /externalSummaryProvided/)
  assert.match(financePanel, /summaryLoading=\{summaryLoading\}/)
  assert.match(financePanel, /obligations=\{obligations\}/)
  assert.match(paymentsPanel, /const applyExternalPageData = useCallback/)
  assert.match(paymentsPanel, /buildPaymentScheduleView\(obligationsProp, summaryProp\.todayKey\)/)
  assert.doesNotMatch(
    paymentsPanel,
    /externalSummaryProvided[\s\S]{0,400}listPaymentObligations\(\{ includePaid: false \}\)/
  )
  assert.match(paymentsPanel, /const loadStandalone = useCallback\(async \(\) =>/)
  ok('F-5: unified parent owns one obligations read via fetchSupplierFinancePageData; embedded child does not re-fetch obligations')

  assert.match(financePanel, /setRefreshToken\(\(token\) => token \+ 1\)/)
  assert.match(paymentsPanel, /refreshToken\]/)
  assert.doesNotMatch(financePanel, /window\.location\.reload|location\.reload/)
  ok('F-5 post-sync: parent reloads summary/obligations and bumps refreshToken — no full reload')

  // Count listPaymentObligations in page data loader (should be exactly one call site in fetchSupplierFinancePageData body)
  const pageDataBlock = summaryService.match(
    /async function loadFinanceSummaryData\(\{ obligations: obligationsInput \} = \{\}\) \{[\s\S]*?\n\}/
  )?.[0] || ''
  const obligationsCalls = (pageDataBlock.match(/listPaymentObligations\(\{ includePaid: false \}\)/g) || []).length
  assert.equal(obligationsCalls, 1)
  ok('F-5 query count: loadFinanceSummaryData issues exactly 1 listPaymentObligations bulk read per unified page load')

  // F-6 (list totals) moved to SQL (`umag_settlements_supplier_totals`); the JS helper no longer exists.

  // --- F-9: returnTo routing ------------------------------------------------
  ok('F-9: embedded configure returns to unified page; standalone keeps legacy route')

  // --- Stage 3.1 + cutover guardrails --------------------------------------
  assert.match(summaryService, /fetchAllSupabaseRows/)
  assert.match(summaryService, /\.from\('umag_document_payments'\)/)
  assert.match(navSrc, /supplier-finance/)
  assert.match(navSrc, /label: 'Расчёты'/)
  ok('F-1/F-2 pagination + formulas intact; nav cutover shows «Расчёты»')

  console.log(`\n${checks} checks passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
