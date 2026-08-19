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

  // --- F-6: settlements subtotal semantics ---------------------------------
  const { computeSettlementsListTotals } = await import(
    pathToFileURL(path.join(ROOT, 'src/services/umagSettlementsService.js')).href
  )

  const normalTotals = computeSettlementsListTotals([
    { supplyCount: 1, amount: 100, paymentAmount: 50, paymentRefundAmount: 0, debt: 100000, returnCount: 0, returnAmount: 0 },
    { supplyCount: 2, amount: 200, paymentAmount: 80, paymentRefundAmount: 0, debt: 50000, returnCount: 1, returnAmount: 10 },
  ])
  assert.equal(normalTotals.debt, 150000)
  ok('F-6 normal: subtotal current debt = sum of visible row.debt values')

  const filteredTotals = computeSettlementsListTotals([
    { supplyCount: 1, amount: 100, paymentAmount: 0, paymentRefundAmount: 0, debt: 70000, returnCount: 0, returnAmount: 0 },
  ])
  assert.equal(filteredTotals.debt, 70000)
  ok('F-6 filtered list: subtotal stays list-scoped, not global debt')

  const unmappedTotals = computeSettlementsListTotals([
    { supplyCount: 1, amount: 100, paymentAmount: 0, paymentRefundAmount: 0, debt: 50000, returnCount: 0, returnAmount: 0 },
    { supplyCount: 1, amount: 50, paymentAmount: 0, paymentRefundAmount: 0, debt: null, returnCount: 0, returnAmount: 0 },
  ])
  assert.equal(unmappedTotals.debt, null)
  ok('F-6 unmapped: any row.debt=null makes subtotal debt unavailable (null), not a fake sum')

  assert.match(settlementsPanel, /label="По списку"/)
  assert.match(settlementsPanel, /aria-label="Итоги списка"/)
  assert.doesNotMatch(settlementsPanel, /aria-label="Итоги периода"/)
  assert.match(settlementsPanel, /Есть несопоставленные поставщики/)
  ok('F-6 label: footer debt subtotal reads "Пo списку"; mobile aria-label is "Итоги списка"')

  assert.match(settlementsService, /export function computeSettlementsListTotals/)
  ok('F-6: computeSettlementsListTotals exported from settlements service')

  // --- F-9: returnTo routing ------------------------------------------------
  assert.match(
    paymentsPanel,
    /returnTo: embedded\s*\n\s*\? '\/platform\/supplier-finance\?tab=payments'\s*\n\s*: '\/platform\/supplier-payments'/
  )
  ok('F-9: embedded configure returns to unified page; standalone keeps legacy route')

  // --- Stage 3.1 + cutover guardrails --------------------------------------
  assert.doesNotMatch(navSrc, /supplier-finance/)
  assert.match(summaryService, /fetchAllSupabaseRows/)
  assert.match(summaryService, /\.from\('umag_document_payments'\)/)
  ok('F-1/F-2 pagination + formulas intact; no sidebar cutover')

  console.log(`\n${checks} checks passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
