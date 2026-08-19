#!/usr/bin/env node
/**
 * Verification for Этап 2.4 — canonical Financial Summary.
 *
 * Unlike the umag-sync (Deno) stages, this one is plain frontend JS —
 * every pure piece (buildPaymentScheduleView, isUmagPaymentRefund,
 * sumNonRefundPaymentAmount, the Aqtobe/month date helpers) is imported and
 * run for real via the extensionlessResolver loader, exercised against real
 * fixture data for every Case 1–18 that doesn't require an actual network
 * round-trip. Only the Supabase I/O itself (listPaymentObligations,
 * fetchPaidThisMonth's query, fetchLastUmagSyncRun) is out of reach here —
 * no .env.local / live Supabase connection in this environment.
 *
 * Usage:
 *   npm run verify:supplier-finance-summary
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'node:child_process'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const SUMMARY_SERVICE = 'src/services/supplierFinanceSummaryService.js'
const PAYMENTS_SERVICE = 'src/services/supplierPaymentObligationsService.js'
const OBLIGATIONS_UTIL = 'src/utils/supplierPaymentObligations.js'
const LEDGER_UTIL = 'src/utils/supplierLedger.js'
const SETTLEMENTS_PERIOD = 'src/utils/settlementsPeriod.js'
const PANEL = 'src/components/suppliers/payments/SupplierPaymentsPanel.jsx'
const UMAG_SERVICE = 'src/services/umagSettlementsService.js'

let checks = 0
function ok(name) {
  checks += 1
  console.log(`  ✓ ${name}`)
}
function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) throw new Error(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}
async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href)
}

async function main() {
  console.log('=== Supplier finance summary verification (Этап 2.4) ===\n')

  const summarySrc = read(SUMMARY_SERVICE)
  const paymentsSrc = read(PAYMENTS_SERVICE)
  const obligationsUtilSrc = read(OBLIGATIONS_UTIL)
  const panelSrc = read(PANEL)
  const umagServiceSrc = read(UMAG_SERVICE)

  // --- 1. Reuse, not a fourth formula --------------------------------------
  assert.match(summarySrc, /import \{ buildPaymentScheduleView, toAqtobeDateKey \} from '\.\.\/utils\/supplierPaymentObligations'/)
  assert.match(summarySrc, /import \{ listPaymentObligations \} from '\.\/supplierPaymentObligationsService'/)
  assert.match(summarySrc, /import \{ fetchLastUmagSyncRun \} from '\.\/umagSettlementsService'/)
  ok('fetchSupplierFinanceSummary reuses listPaymentObligations/buildPaymentScheduleView/fetchLastUmagSyncRun — not new independent queries')

  assert.doesNotMatch(summarySrc, /\.reduce\(\(sum, (row|ob(ligation)?)\) => sum \+ .*current_debt/i)
  ok('no inline SUM(current_debt) reduce in the summary service — debt comes from buildPaymentScheduleView only')

  assert.match(summarySrc, /debt: view\.summaries\.totalActiveDebt/)
  assert.match(summarySrc, /overdue: \{ amount: view\.summaries\.overdue, count: view\.tabCounts\.overdue \}/)
  assert.match(summarySrc, /dueToday: \{ amount: view\.summaries\.dueToday, count: view\.tabCounts\.today \}/)
  assert.match(summarySrc, /upcoming: \{ amount: view\.summaries\.deferredNotYetDue, count: view\.tabCounts\.upcoming \}/)
  assert.match(summarySrc, /termsMissing: \{ amount: view\.summaries\.termsMissing, count: view\.tabCounts\.termsMissing \}/)
  ok('all five KPIs map straight from ONE buildPaymentScheduleView(obligations, todayKey) call')

  const todayKeyOccurrences = summarySrc.match(/toAqtobeDateKey\(\)/g)
  assert.equal(todayKeyOccurrences?.length, 1, 'toAqtobeDateKey() must be resolved exactly once per summary call')
  ok('todayKey is resolved exactly once per fetchSupplierFinanceSummary() call, threaded through everything below it')

  // --- 2. Refund classification reused, not reinvented ---------------------
  const ledgerUtilSrc = read(LEDGER_UTIL)
  assert.match(ledgerUtilSrc, /export function isUmagPaymentRefund\(payment\)/)
  assert.match(summarySrc, /import \{ isUmagPaymentRefund \} from '\.\.\/utils\/supplierLedger'/)
  ok('isUmagPaymentRefund extracted into utils/supplierLedger.js and imported (not a new inline classifier)')

  const umagServiceRefundOccurrences = umagServiceSrc.match(/isUmagPaymentRefund\(payment\)/g)
  assert.equal(umagServiceRefundOccurrences?.length, 2, 'umagSettlementsService.js should call the shared helper from both former inline sites')
  assert.doesNotMatch(umagServiceSrc, /type === 'SUPPLY_REFUND' \|\|\s*\n\s*signed < 0/)
  ok('Взаиморасчёты (umagSettlementsService.js) now calls the SAME isUmagPaymentRefund() — the old duplicated inline predicate is gone from both former sites')

  // --- 3. paidThisMonth: source, filter, no fallback ------------------------
  assert.match(summarySrc, /\.from\('umag_document_payments'\)/)
  assert.doesNotMatch(summarySrc, /\.from\('umag_supplies'\)/)
  assert.doesNotMatch(summarySrc, /\.select\([^)]*payment_amount|row\.payment_amount/)
  ok("paidThisMonth reads only umag_document_payments — never umag_supplies / payment_amount as a fallback (item 11/13)")

  assert.doesNotMatch(summarySrc, /\.from\('umag_supply_returns'\)/)
  ok('paidThisMonth never touches umag_supply_returns — goods returns affect debt via UMAG, not this KPI (Case 12)')

  assert.match(summarySrc, /\.gte\('payment_time', fromIso\)\s*\n\s*\.lt\('payment_time', toIso\)/)
  assert.doesNotMatch(summarySrc, /\.lte\(['"]payment_time/)
  ok("paidThisMonth uses a half-open range on payment_time (>=start, <nextMonthStart) — not the ambiguous '<=23:59:59.999' pattern")

  assert.match(summarySrc, /\.select\('amount, payment_type, class_name'\)/)
  ok("the query selects/filters strictly by payment_time — never by the linked приёмка's own doc_time (Case 9)")

  assert.match(summarySrc, /\+05:00/)
  assert.doesNotMatch(summarySrc, /\.toISOString\(\)`|`\$\{.*\}Z`/)
  ok('month boundaries use the fixed Asia/Aqtobe +05:00 offset (no DST), matching the rest of the UMAG date-boundary code')

  // --- 4. Error semantics: obligations load-bearing, payments degrade ------
  assert.match(summarySrc, /status: 'unavailable'/)
  assert.match(summarySrc, /amount: null,/)
  assert.doesNotMatch(summarySrc, /amount: 0,\s*\n\s*monthKey/)
  ok('fetchPaidThisMonth degrades to {amount:null, status:"unavailable", error} on failure — never a silent 0 (Case 14)')

  const fnBody = summarySrc.slice(summarySrc.indexOf('export async function fetchSupplierFinanceSummary'))
  assert.doesNotMatch(fnBody, /listPaymentObligations\([^)]*\)\.catch|try\s*\{[\s\S]*listPaymentObligations/)
  ok('listPaymentObligations() is NOT wrapped in a local try/catch — a failure rejects the whole summary, matching the existing fetchSupplierPaymentsDashboard() convention (Option A for the load-bearing half)')

  // --- 5. lastSync: verbatim passthrough, no normalization ------------------
  assert.match(summarySrc, /lastSync: lastRun,?\s*\n\s*\}/)
  assert.doesNotMatch(summarySrc, /status:\s*lastRun\?\.status\s*\?\?\s*'success'|status:\s*'success'/)
  ok('lastSync is the raw umag_sync_runs row, unmodified — success/partial/failed/running all pass through as-is (Case 15/16)')

  // --- 6. Global debt includes unmapped suppliers (Case 17) -----------------
  assert.doesNotMatch(paymentsSrc, /platform_suppliers!inner/)
  assert.match(paymentsSrc, /platform_suppliers!platform_supplier_id\(/)
  assert.doesNotMatch(summarySrc, /platform_supplier_id/)
  ok('listPaymentObligations embeds platform_suppliers as a left join (no !inner) — rows with platform_supplier_id=NULL are still counted; the summary adds no extra supplier filter of its own')

  // --- 7. No N+1 ------------------------------------------------------------
  assert.match(
    summarySrc,
    /await Promise\.all\(\[\s*\n\s*listPaymentObligations\(\{ includePaid: false \}\),\s*\n\s*fetchLastUmagSyncRun\(\),\s*\n\s*fetchPaidThisMonth\(todayKey\),\s*\n\s*\]\)/
  )
  assert.doesNotMatch(summarySrc, /for\s*\(.*supplier.*\)\s*\{[\s\S]*await/i)
  assert.doesNotMatch(summarySrc, /\.map\(async/i)
  ok('exactly 3 bulk async calls (obligations, last sync, month payments) via one Promise.all — no per-supplier loop')

  // --- 8. Stages 2.1–2.3 untouched (light sentinels; full depth in their own scripts) ---
  const reconService = read('src/services/supplierReconciliationService.js')
  assert.match(reconService, /snapshot\.umagDebt = canonicalDebt\.debt/)
  ok('Этап 2.1 canonical debt formula sentinel intact')

  const edgeFn = read('supabase/functions/umag-sync/index.ts')
  assert.match(edgeFn, /MAX_AUTO_SYNC_LOOKBACK_MONTHS/)
  assert.match(edgeFn, /openDebtCoverageComplete/)
  ok('Этап 2.2 sync-scope sentinels intact')

  assert.match(edgeFn, /umag_sync_runs_entity_running_lock/)
  assert.match(edgeFn, /SYNC_ALREADY_RUNNING/)
  ok('Этап 2.3 sync-lock sentinels intact')

  assert.doesNotMatch(summarySrc, /platform_supplier_ledger_events|ledgerClosingBalance|reconciliation_flag/i)
  ok('ledger is not used as a KPI source in the new summary (item 29)')

  // --- 9. SupplierPaymentsPanel wired to the new summary, layout untouched ---
  assert.match(panelSrc, /import \{ fetchSupplierFinanceSummary \} from '\.\.\/\.\.\/\.\.\/services\/supplierFinanceSummaryService'/)
  assert.match(panelSrc, /value=\{summary\?\.debt\}/)
  assert.match(panelSrc, /value=\{summary\?\.overdue\?\.amount\}/)
  assert.match(panelSrc, /value=\{summary\?\.dueToday\?\.amount\}/)
  ok('SupplierPaymentsPanel reads its 3 KPI cards from summary.debt/overdue.amount/dueToday.amount')

  assert.doesNotMatch(panelSrc, /fetchSupplierPaymentsDashboard/)
  ok('SupplierPaymentsPanel no longer calls the old bundled dashboard fetch')

  // Этап 2.8 may add spo-compact__ presentation CSS to SupplierPaymentsPanel.css.
  // The invariant for THIS stage (2.4) is that the summary service formulas stay put.
  const summaryServiceStatus = execFileSync(
    'git',
    ['status', '--porcelain', '--', 'src/services/supplierFinanceSummaryService.js'],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim()
  assert.equal(summaryServiceStatus, '', 'supplierFinanceSummaryService.js changed — Этап 2.4 formulas must stay stable')
  ok('supplierFinanceSummaryService.js untouched (CSS/layout may evolve in later presentation stages)')

  // Narrowed to routing/navigation/page wrappers — Этап 2.5 legitimately
  // touches UmagSettlementsPanel itself (its own debt-source migration,
  // checked by verify:settlements-canonical-debt), which isn't new routing
  // or menu surface and doesn't retroactively violate THIS stage's own
  // "data-layer only, no new route/page/menu" claim.
  //
  // App.jsx is checked separately below (not for zero diff): Этап 2.7 adds a
  // new, additive, hidden /platform/supplier-finance route there, which is
  // legitimate UI work from a later stage — the invariant that still matters
  // is that the pre-existing settlements/supplier-payments routes are not
  // removed or altered.
  const otherUiStatus = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      'src/pages/platform/settlements',
      'src/pages/platform/supplier-payments',
      'src/platform/platformNav.js',
    ],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim()
  assert.equal(otherUiStatus, '', `unexpected UI/route changes: ${otherUiStatus}`)
  ok('no new route/page/menu changes — this stage is data-layer only, per item 2')

  const appDiff = execFileSync('git', ['diff', '--', 'src/App.jsx'], { cwd: ROOT, encoding: 'utf8' })
  const removedRouteLines = appDiff
    .split('\n')
    .filter((line) => line.startsWith('-') && !line.startsWith('---'))
    .filter((line) => /settlements|supplier-payments/.test(line))
  assert.deepEqual(removedRouteLines, [], `existing route lines removed from App.jsx: ${removedRouteLines.join(' | ')}`)
  ok('App.jsx: pre-existing settlements/supplier-payments routes are not removed or altered (a later stage may additively register new routes)')

  console.log('\n--- Real imports: pure logic exercised with fixture data ---\n')
  await runRealCases()

  console.log(`\n${checks} checks passed`)
  console.log(
    '\nNOTE: listPaymentObligations()/fetchPaidThisMonth()/fetchLastUmagSyncRun() themselves\n' +
      'need a live Supabase connection, unavailable in this environment (no .env.local).\n' +
      'Every PURE piece they compose (buildPaymentScheduleView, isUmagPaymentRefund,\n' +
      'sumNonRefundPaymentAmount, the Aqtobe/month date helpers) was imported for real and\n' +
      'exercised above — not mirrored — which is the strongest verification available here.'
  )
}

function isoUtc(dateKeyOffsetIso) {
  return new Date(dateKeyOffsetIso)
}

async function runRealCases() {
  const obligationsUtil = await load(OBLIGATIONS_UTIL)
  const { buildPaymentScheduleView, isActiveOpenObligation, deriveObligationStatus, toAqtobeDateKey } =
    obligationsUtil

  const ledgerUtil = await load(LEDGER_UTIL)
  const { isUmagPaymentRefund } = ledgerUtil

  const summaryModule = await load(SUMMARY_SERVICE)
  const { sumNonRefundPaymentAmount } = summaryModule

  const settlementsPeriod = await load(SETTLEMENTS_PERIOD)
  const { getMonthRangeKeys, addDaysToDateKey } = settlementsPeriod

  const today = '2026-08-19'

  // Case 1 + Case 7 (invariant) — 4 buckets sum to debt.
  {
    const obligations = [
      { id: 'o-overdue', currentDebt: 100000, isSourceDeleted: false, dueDate: '2026-08-10', platformSupplierId: 's1' },
      { id: 'o-today', currentDebt: 50000, isSourceDeleted: false, dueDate: today, platformSupplierId: 's2' },
      { id: 'o-upcoming', currentDebt: 20000, isSourceDeleted: false, dueDate: '2026-09-01', platformSupplierId: 's3' },
      { id: 'o-terms-missing', currentDebt: 30000, isSourceDeleted: false, dueDate: null, platformSupplierId: 's4' },
    ]
    const view = buildPaymentScheduleView(obligations, today)
    assert.equal(view.summaries.totalActiveDebt, 200000)
    ok('Case 1: debt = 100000+50000+20000+30000 = 200000 (real buildPaymentScheduleView)')

    const sumOfBuckets =
      view.summaries.overdue +
      view.summaries.dueToday +
      view.summaries.deferredNotYetDue +
      view.summaries.termsMissing
    assert.equal(sumOfBuckets, view.summaries.totalActiveDebt)
    ok('Case 7: overdue+dueToday+upcoming+termsMissing === debt (mathematical invariant, real code)')

    const countOfBuckets =
      view.tabCounts.overdue + view.tabCounts.today + view.tabCounts.upcoming + view.tabCounts.termsMissing
    assert.equal(countOfBuckets, view.activeCount)
    assert.equal(view.activeCount, 4)
    ok('counts invariant: overdue.count+dueToday.count+upcoming.count+termsMissing.count === total active obligations (item 33)')
  }

  // Case 2 — current_debt = 0 excluded entirely.
  {
    const obligations = [
      { id: 'o1', currentDebt: 100000, isSourceDeleted: false, dueDate: '2026-08-10' },
      { id: 'o2', currentDebt: 0, isSourceDeleted: false, dueDate: '2026-08-10' },
    ]
    const view = buildPaymentScheduleView(obligations, today)
    assert.equal(view.summaries.totalActiveDebt, 100000)
    assert.equal(view.activeCount, 1)
    ok('Case 2: current_debt = 0 does not participate in any KPI')
  }

  // Case 3 — negative debt excluded.
  {
    assert.equal(isActiveOpenObligation({ currentDebt: -500, isSourceDeleted: false }), false)
    ok('Case 3: current_debt < 0 does not increase debt')
  }

  // Case 4 — soft-deleted excluded even with positive debt.
  {
    assert.equal(isActiveOpenObligation({ currentDebt: 100000, isSourceDeleted: true }), false)
    ok('Case 4: is_source_deleted = true is excluded from every KPI')
  }

  // Case 5 — old open debt (June receiving) counts in August's debt/bucket,
  // regardless of supplyDocumentDate — deriveObligationStatus never looks at it.
  {
    const juneObligation = {
      id: 'o-june',
      currentDebt: 100000,
      isSourceDeleted: false,
      dueDate: '2026-06-20',
      supplyDocumentDate: '2026-06-01',
      sourceDocTime: '2026-06-01T09:00:00+05:00',
    }
    const view = buildPaymentScheduleView([juneObligation], today)
    assert.equal(view.summaries.totalActiveDebt, 100000)
    assert.equal(view.summaries.overdue, 100000)
    assert.doesNotMatch(deriveObligationStatus.toString(), /supplyDocumentDate|sourceDocTime|doc_time/)
    ok("Case 5: a June receiving's open debt counts in August's debt/overdue bucket — doc date never filters status")
  }

  // Case 6 — due_date NULL -> termsMissing only, never any other bucket.
  {
    const obligations = [{ id: 'o-null-due', currentDebt: 40000, isSourceDeleted: false, dueDate: null }]
    const view = buildPaymentScheduleView(obligations, today)
    assert.equal(view.summaries.termsMissing, 40000)
    assert.equal(view.summaries.overdue, 0)
    assert.equal(view.summaries.dueToday, 0)
    assert.equal(view.summaries.deferredNotYetDue, 0)
    ok('Case 6: due_date IS NULL lands only in termsMissing')
  }

  // Case 8 — three real August supplier payments sum to 175000.
  {
    const rows = [
      { amount: 100000, payment_type: 'SUPPLY', class_name: 'Supply' },
      { amount: 50000, payment_type: 'SUPPLY', class_name: 'Supply' },
      { amount: 25000, payment_type: 'SUPPLY', class_name: 'Supply' },
    ]
    assert.equal(sumNonRefundPaymentAmount(rows), 175000)
    ok('Case 8: 100000+50000+25000 = 175000 (real sumNonRefundPaymentAmount)')
  }

  // Case 9/10 are query-filter behaviour (payment_time bounds), verified
  // structurally above; here we verify the actual boundary MATH is correct
  // using the real Aqtobe-aware helpers.
  {
    const [y, m] = today.split('-').map(Number)
    const { dateFrom: monthStart, dateTo: monthEnd } = getMonthRangeKeys(y, m)
    const nextMonthStart = addDaysToDateKey(monthEnd, 1)
    assert.equal(monthStart, '2026-08-01')
    assert.equal(nextMonthStart, '2026-09-01')

    const fromIso = `${monthStart}T00:00:00+05:00`
    const toIso = `${nextMonthStart}T00:00:00+05:00`

    const julyPayment = isoUtc('2026-07-31T23:59:59+05:00')
    const augustFirstMoment = isoUtc('2026-08-01T00:00:00+05:00')
    const augustLastMoment = isoUtc('2026-08-31T23:59:59.999+05:00')
    const septemberPayment = isoUtc('2026-09-01T00:00:00+05:00')

    const inRange = (d) => d >= isoUtc(fromIso) && d < isoUtc(toIso)

    assert.equal(inRange(julyPayment), false)
    ok('Case 10: a July payment_time falls outside the August [fromIso, toIso) window')

    assert.equal(inRange(augustFirstMoment), true)
    assert.equal(inRange(augustLastMoment), true)
    ok('Case 9 support: the full August calendar day range is inside the half-open window')

    assert.equal(inRange(septemberPayment), false)
    ok('the half-open boundary correctly excludes the first instant of September')
  }

  // Case 11 — refund excluded from paidThisMonth.
  {
    const rows = [
      { amount: 100000, payment_type: 'SUPPLY', class_name: 'Supply' },
      { amount: 40000, payment_type: 'SUPPLY_REFUND', class_name: 'SupplyReturn' },
    ]
    assert.equal(isUmagPaymentRefund(rows[1]), true)
    assert.equal(sumNonRefundPaymentAmount(rows), 100000)
    ok('Case 11: a SUPPLY_REFUND row is excluded — paidThisMonth counts only the real payment')
  }

  // Case 18 — Asia/Aqtobe day boundary, not UTC midnight.
  {
    // 2026-08-31T20:00:00Z is 2026-09-01T01:00:00+05:00 in Aqtobe — already
    // the next calendar day locally even though the UTC date is still Aug 31.
    const nearMidnightUtc = new Date('2026-08-31T20:00:00.000Z')
    const aqtobeKey = toAqtobeDateKey(nearMidnightUtc)
    assert.equal(aqtobeKey, '2026-09-01')
    ok('Case 18: a moment that is still 31.08 in UTC already reads as 01.09 in Asia/Aqtobe — business date, not the UTC date, governs classification')
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`)
  process.exit(1)
})
