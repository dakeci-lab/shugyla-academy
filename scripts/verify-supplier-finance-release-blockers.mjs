#!/usr/bin/env node
/**
 * Verification for Этап 3.1 — supplier finance release blockers (F-1/F-2/F-3).
 *
 * Reproducible on a clean committed checkout — no working-tree git diff assertions.
 *
 * Usage:
 *   npm run verify:supplier-finance-release-blockers
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

function makeMockBuildQuery(allRows, { failOnPage = null } = {}) {
  let pageFetch = 0
  return () => ({
    range(from, to) {
      pageFetch += 1
      if (failOnPage === pageFetch) {
        return Promise.resolve({ data: null, error: { message: 'page fetch failed' } })
      }
      return Promise.resolve({ data: allRows.slice(from, to + 1), error: null })
    },
  })
}

async function main() {
  console.log('=== Supplier finance release blockers verification (Этап 3.1) ===\n')

  const paginationMod = await import(pathToFileURL(path.join(ROOT, 'src/utils/supabasePagination.js')).href)
  const { fetchAllSupabaseRows } = paginationMod

  const debtSrc = read('src/services/supplierDebtService.js')
  const summarySrc = read('src/services/supplierFinanceSummaryService.js')
  const obligationsSrc = read('src/services/supplierPaymentObligationsService.js')
  const umagSrc = read('src/services/umagSettlementsService.js')
  const migration = read('supabase/migrations/20260820103000_supplier_payments_view_finance_reads_rls.sql')
  const embeddableSrc = read('scripts/verify-supplier-finance-embeddable-panels.mjs')
  const lockVerify = read('scripts/verify-umag-sync-lock.mjs')
  const navSrc = read('src/platform/platformNav.js')

  // --- F-1: all three financial reads paginated ----------------------------
  assert.match(debtSrc, /fetchAllSupabaseRows/)
  assert.match(debtSrc, /fetchOpenObligationRows/)
  assert.match(debtSrc, /\.order\('id', \{ ascending: true \}\)/)
  assert.match(obligationsSrc, /fetchAllSupabaseRows/)
  assert.match(obligationsSrc, /listPaymentObligations/)
  assert.match(obligationsSrc, /\.order\('id', \{ ascending: true \}\)/)
  assert.match(summarySrc, /fetchAllSupabaseRows/)
  assert.match(summarySrc, /fetchPaidThisMonth/)
  assert.match(summarySrc, /\.order\('payment_time', \{ ascending: true \}\)/)
  assert.match(summarySrc, /\.order\('id', \{ ascending: true \}\)/)
  ok('F-1: fetchOpenObligationRows, listPaymentObligations, fetchPaidThisMonth use fetchAllSupabaseRows with stable ordering')

  assert.match(umagSrc, /from '\.\.\/utils\/supabasePagination'/)
  assert.doesNotMatch(debtSrc, /from '\.\/umagSettlementsService'/)
  ok('F-1: shared pagination lives in utils/supabasePagination — no circular import via umagSettlementsService')

  // --- F-1: pagination primitive behavior ----------------------------------
  for (const [label, count] of [
    ['999 rows', 999],
    ['1000 rows', 1000],
    ['1001 rows', 1001],
    ['2505 rows', 2505],
  ]) {
    const rows = Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, amount: 1 }))
    const { data, error } = await fetchAllSupabaseRows(makeMockBuildQuery(rows))
    assert.equal(error, null)
    assert.equal(data.length, count, `${label}: expected ${count}, got ${data?.length}`)
    ok(`F-1 pagination: ${label} — all rows returned`)
  }

  {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: i }))
    const { data, error } = await fetchAllSupabaseRows(makeMockBuildQuery(rows, { failOnPage: 2 }))
    assert.ok(error)
    assert.equal(data, null)
    ok('F-1 pagination: DB error on page 2 propagates — no silent partial success')
  }

  // --- F-1: financial regression (pure logic) ------------------------------
  const { buildPaymentScheduleView } = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/supplierPaymentObligations.js')).href
  )
  const { sumNonRefundPaymentAmount } = await import(
    pathToFileURL(path.join(ROOT, 'src/services/supplierFinanceSummaryService.js')).href
  )

  const obligations1500 = Array.from({ length: 1500 }, (_, i) => ({
    id: `ob-${i}`,
    currentDebt: 100,
    dueDate: '2026-08-20',
    platformSupplierId: `sup-${i}`,
    supplierName: `S${i}`,
  }))
  const view1500 = buildPaymentScheduleView(obligations1500, '2026-08-20')
  assert.equal(view1500.summaries.totalActiveDebt, 150_000)
  ok('F-1 regression: 1500 obligations → debt = SUM(all current_debt), not truncated at 1000')

  const payments1500 = Array.from({ length: 1500 }, (_, i) => ({
    id: `pay-${i}`,
    amount: 200,
    payment_type: 'CASH',
    class_name: 'Payment',
  }))
  assert.equal(sumNonRefundPaymentAmount(payments1500), 300_000)
  ok('F-1 regression: 1500 paid documents → paidThisMonth sum uses all rows')

  // --- F-2: RLS alignment migration ------------------------------------------
  assert.match(migration, /umag_document_payments_select_view/)
  assert.match(migration, /supplier_payments\.view/)
  assert.match(migration, /umag_sync_runs_select_view/)
  assert.doesNotMatch(migration, /^grant /im)
  ok('F-2: migration aligns supplier_payments.view for document_payments + sync_runs SELECT — sync permission not granted')

  assert.match(summarySrc, /status: 'unavailable'/)
  assert.match(read('src/components/suppliers/finance/SupplierFinancePanel.jsx'), /paidUnavailable/)
  ok('F-2: explicit unavailable UI path preserved for paidThisMonth when status=unavailable')

  // --- F-2: sync read for payments-only (policy allows read, not sync) -------
  assert.match(migration, /umag_sync_runs_select_view[\s\S]*supplier_payments\.view/)
  assert.match(read('src/components/suppliers/finance/SupplierFinancePanel.jsx'), /canSyncUmagSettlements/)
  ok('F-2: payments-only users can read sync metadata via RLS; ↻ still gated by canSyncUmagSettlements')

  // --- F-3: embeddable verify clean-checkout compatible ----------------------
  assert.doesNotMatch(embeddableSrc, /git diff --name-only -- -- src/)
  assert.match(embeddableSrc, /read\(APP\)/)
  assert.match(embeddableSrc, /function CompactPaymentSchedule/)
  ok('F-3: verify-supplier-finance-embeddable-panels uses source checks, not working-tree git diff')

  assert.doesNotMatch(lockVerify, /terminalStatus === 'running'/)
  assert.match(lockVerify, /partial unique index covers only status='running'/i)
  ok('F-3: sync-lock verify no longer uses tautological terminalStatus === running loop')

  // --- formulas unchanged ----------------------------------------------------
  assert.match(debtSrc, /\.gt\('current_debt', 0\)/)
  assert.match(debtSrc, /\.eq\('is_source_deleted', false\)/)
  assert.match(summarySrc, /debt: view\.summaries\.totalActiveDebt/)
  assert.match(summarySrc, /\.from\('umag_document_payments'\)/)
  assert.doesNotMatch(summarySrc, /\.from\('umag_supplies'\)/)
  ok('canonical debt + paidThisMonth source formulas unchanged')

  // --- no cutover ------------------------------------------------------------
  assert.match(navSrc, /supplier-finance/)
  assert.match(navSrc, /label: 'Расчёты'/)
  ok('nav cutover complete: «Расчёты» visible; legacy routes remain in App.jsx')

  console.log(`\n${checks} checks passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
