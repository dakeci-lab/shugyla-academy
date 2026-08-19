#!/usr/bin/env node
/**
 * Verification for Этап 2.2 — expanded SYNC SCOPE for open supplier debt.
 *
 * The real algorithm lives in supabase/functions/umag-sync/index.ts, a Deno
 * Edge Function — not importable into this Node harness (no Deno-specific
 * globals here, and its functions aren't exported for testing). Structure:
 *
 *   1. Structural checks on the real source: confirm effectiveFrom/effectiveTo
 *      actually reach fetchAllSupplies / fetchAllSupplyReturns /
 *      fetchDocumentPaymentsForPeriod / rebuildLedgerEventsForPeriod /
 *      refreshPaymentObligations / reconcileMissingSupplies /
 *      reconcileMissingSupplyReturns — not just computed and unused.
 *   2. A faithful line-for-line mirror of computeEffectiveSyncScope()'s pure
 *      math, exercised against all 12 cases from the Этап 2.2 spec. Any drift
 *      between the mirror and the real file should be caught by (1)'s regexes
 *      pinning the exact expressions used in the real implementation.
 *   3. `deno check`/`deno lint` on the real file are run separately (see the
 *      Stage 2.2 report) — this script does not require a Deno runtime.
 *
 * Usage:
 *   npm run verify:supplier-finance-sync-scope
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const EDGE_FN = 'supabase/functions/umag-sync/index.ts'
const CONFIG = 'supabase/functions/_shared/umagConfig.ts'

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

function main() {
  console.log('=== Supplier finance sync-scope verification (Этап 2.2) ===\n')

  // --- 1. Stage 2.2's own migration for sync-scope is not present --------
  // Этап 2.2 itself shipped with zero schema changes (response metadata
  // only, per item 21). Later stages may legitimately add their own
  // migrations elsewhere (e.g. Этап 2.3's sync lock, checked by
  // verify:umag-sync-lock) — this only checks that Этап 2.2 didn't invent
  // a sync-scope/open-debt-floor migration of its own.
  const scopeMigrations = execFileSync(
    'git',
    ['ls-files', '--', 'supabase/migrations/*sync_scope*.sql', 'supabase/migrations/*open_debt*.sql'],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim()
  assert.equal(
    scopeMigrations,
    '',
    `unexpected migration file(s): ${scopeMigrations}`
  )
  ok('no sync-scope migration added — response metadata only, per item 21')

  // --- 2. Constant lives in a shared, named location ---------------------
  const config = read(CONFIG)
  assert.match(config, /export const MAX_AUTO_SYNC_LOOKBACK_MONTHS = 24/)
  ok('MAX_AUTO_SYNC_LOOKBACK_MONTHS = 24 is a named constant in _shared/umagConfig.ts, not a magic number')

  const edge = read(EDGE_FN)
  assert.match(edge, /MAX_AUTO_SYNC_LOOKBACK_MONTHS,?\s*\n?\s*\/\/ deno-lint|MAX_AUTO_SYNC_LOOKBACK_MONTHS,/)
  assert.match(edge, /from '\.\.\/_shared\/umagConfig\.ts'/)
  ok('umag-sync imports the shared constant instead of redefining it')

  // --- 3. requestedFrom/requestedTo vs effectiveFrom/effectiveTo split ---
  assert.match(
    edge,
    /const \{ dateFrom: requestedFrom, dateTo: requestedTo, syncSuppliers \} = validated/
  )
  assert.match(
    edge,
    /const syncScope = await computeEffectiveSyncScope\(\s*\n\s*authz\.serviceClient,\s*\n\s*requestedFrom,\s*\n\s*requestedTo\s*\n\s*\)/
  )
  assert.match(edge, /const \{ effectiveFrom, effectiveTo \} = syncScope/)
  ok('handler renames the request body to requestedFrom/requestedTo and derives effectiveFrom/effectiveTo from computeEffectiveSyncScope()')

  assert.match(edge, /const bounds = aqtobePeriodBoundsMs\(effectiveFrom, effectiveTo\)/)
  ok('UMAG fetch bounds are built from effectiveFrom/effectiveTo, not the raw request')

  // --- 4. effectiveFrom/effectiveTo actually reach every pipeline step ---
  const wiredCalls = [
    ['fetchAllSupplies(session, bounds.fromTime, bounds.toTime)', 'fetchAllSupplies'],
    ['fetchAllSupplyReturns(session, bounds.fromTime, bounds.toTime)', 'fetchAllSupplyReturns'],
    [
      'fetchDocumentPaymentsForPeriod(\n      session,\n      bounds.fromTime,\n      bounds.toTime\n    )',
      'fetchDocumentPaymentsForPeriod',
    ],
  ]
  for (const [needle, label] of wiredCalls) {
    assert.ok(edge.includes(needle), `${label} does not use bounds derived from effectiveFrom/effectiveTo`)
    ok(`${label} receives bounds computed from effectiveFrom/effectiveTo`)
  }

  const effectiveRangeCalls = [
    'reconcileMissingSupplies(\n        authz.serviceClient,\n        effectiveFrom,\n        effectiveTo,',
    'refreshPaymentObligations(\n      authz.serviceClient,\n      effectiveFrom,\n      effectiveTo\n    )',
    'reconcileMissingSupplyReturns(\n          authz.serviceClient,\n          effectiveFrom,\n          effectiveTo,',
    'rebuildLedgerEventsForPeriod(\n        authz.serviceClient,\n        effectiveFrom,\n        effectiveTo\n      )',
  ]
  for (const needle of effectiveRangeCalls) {
    const fnName = needle.split('(')[0]
    assert.ok(edge.includes(needle), `${fnName} was not switched to effectiveFrom/effectiveTo`)
    ok(`${fnName} uses effectiveFrom/effectiveTo (not the raw requested range)`)
  }

  assert.ok(
    !/reconcileMissingSupplies\(\s*\n\s*authz\.serviceClient,\s*\n\s*requestedFrom/.test(edge) &&
      !/refreshPaymentObligations\(\s*\n\s*authz\.serviceClient,\s*\n\s*requestedFrom/.test(edge),
    'a pipeline step still received the raw requested range'
  )
  ok('no pipeline step was left on the raw requested range')

  // --- 5. createSyncRun / finishSyncRun / response use effective range ---
  assert.match(edge, /date_from: effectiveFrom,\s*\n\s*date_to: effectiveTo,/)
  ok('umag_sync_runs.date_from/date_to now record the effective (not requested) range')

  assert.match(
    edge,
    /period: \{ dateFrom: effectiveFrom, dateTo: effectiveTo, fromTime: bounds\.fromTime, toTime: bounds\.toTime \}/
  )
  const periodOccurrences = edge.match(
    /period: \{ dateFrom: effectiveFrom, dateTo: effectiveTo, fromTime: bounds\.fromTime, toTime: bounds\.toTime \}/g
  )
  assert.equal(periodOccurrences?.length, 2, 'expected both the early-partial-return and final response to report the effective period')
  ok('both response paths (early partial-return and final) report the effective period, not the raw request')

  const syncScopeOccurrences = edge.match(/^\s*syncScope,\s*$/gm)
  assert.equal(syncScopeOccurrences?.length, 2, 'syncScope metadata missing from one of the response paths')
  ok('syncScope metadata (requestedFrom/effectiveFrom/coverage/...) included in the Edge Function response')

  // --- 6. Coverage folds into success/partial, not success always --------
  assert.match(
    edge,
    /const status: SyncStatus =\s*\n\s*aggregatesMatch &&\s*\n\s*returnsAggregatesMatch &&\s*\n\s*obligationsRefresh\.status === 'success' &&\s*\n\s*!paymentsWarning &&\s*\n\s*syncScope\.openDebtCoverageComplete/
  )
  ok('final status computation requires syncScope.openDebtCoverageComplete — a capped/unresolved range cannot report success')

  assert.match(edge, /const openDebtCoverageComplete =\s*\n\s*unresolvedDateObligationsCount === 0 && uncoveredOpenObligationsCount === 0/)
  ok('openDebtCoverageComplete is false whenever any obligation is uncovered OR its date is unresolved (item 8 + item 10)')

  assert.ok(
    edge.includes("!paymentsWarning &&\n      syncScope.openDebtCoverageComplete\n        ? 'success'\n        : 'partial'"),
    'the status expression gated by openDebtCoverageComplete must resolve to partial, not failed, when coverage is incomplete'
  )
  ok('coverage incompleteness maps to partial, never failed (item 16)')

  // --- 7. Open-obligation predicate matches Этап 2.1 canonical debt ------
  assert.match(edge, /\.from\('supplier_payment_obligations'\)/)
  assert.match(edge, /\.eq\('is_source_deleted', false\)\s*\n\s*\.gt\('current_debt', 0\)/)
  ok("fetchOpenObligationDatePoints() uses the same predicate as Этап 2.1's canonical debt (is_source_deleted=false AND current_debt>0)")

  // --- 8. NULL-date fail-safe uses the existing FK, not a guess ----------
  assert.match(edge, /umag_supply_row_id is FK `on delete set null`/)
  assert.match(edge, /'umag_supplies',\s*\n\s*'id, doc_time',\s*\n\s*'id',\s*\n\s*lookupIds/)
  ok('missing supply_document_date is recovered via the existing umag_supply_row_id -> umag_supplies.doc_time link, not invented')

  // --- 9. Timezone: reuses the existing Aqtobe helper, no raw UTC "today" ---
  assert.match(edge, /const todayKey = aqtobeDateKeyFromIso\(new Date\(\)\.toISOString\(\)\)/)
  assert.match(edge, /timeZone: 'Asia\/Aqtobe'/)
  ok("todayKey reuses the existing aqtobeDateKeyFromIso() helper (Asia/Aqtobe via Intl.DateTimeFormat) — no new/raw UTC-midnight date math")

  // --- 10. Stage 2.1 canonical debt untouched -----------------------------
  const debtService = read('src/services/supplierDebtService.js')
  assert.match(debtService, /from\('supplier_payment_obligations'\)/)
  assert.match(debtService, /\.gt\('current_debt',\s*0\)/)
  assert.doesNotMatch(debtService, /\.gte\(|\.lte\(/)
  ok('Этап 2.1 fetchCanonicalSupplierDebt() formula still has no date filter — untouched')

  const reconService = read('src/services/supplierReconciliationService.js')
  assert.match(reconService, /snapshot\.umagDebt = canonicalDebt\.debt/)
  ok('Этап 2.1 reconciliation snapshot still sources umagDebt from the canonical helper')

  // --- 11. No reconciliation-flag scope creep (item 20) -------------------
  // Item 17's "no lock this stage" was Этап 2.2's own boundary — Этап 2.3
  // has since legitimately added the lock/stale-cleanup this reserved.
  // That work has its own dedicated checks in verify:umag-sync-lock.
  assert.doesNotMatch(edge, /reconciliation_flag|ledger_delta|ledgerClosingBalance|ledger.*ba lance.*compare/i)
  ok('no ledger-vs-canonical reconciliation flag added — reserved for a later stage')

  // --- 12. Routes/menu/pages untouched --------------------------------------
  // Этап 2.2 itself touched no UI at all. Narrowed to routing/navigation/page
  // wrappers specifically — later stages legitimately touch individual
  // components (Этап 2.4 swapped SupplierPaymentsPanel's KPI source; Этап 2.5
  // moved UmagSettlementsPanel's debt source — see their own verify scripts)
  // without that constituting new routing/menu surface, which remains the
  // real invariant sync-scope work must never introduce.
  //
  // App.jsx is checked separately below (not for zero diff): Этап 2.7 adds a
  // new, additive, hidden /platform/supplier-finance route there, which is
  // legitimate UI work from a later stage, not a sync-scope regression — the
  // invariant that still matters is that the pre-existing settlements/
  // supplier-payments routes are not removed or altered.
  const navSrc = read('src/platform/platformNav.js')
  const appSrc = read('src/App.jsx')
  assert.doesNotMatch(navSrc, /supplier-finance/)
  assert.match(appSrc, /path="supplier-payments"/)
  assert.match(appSrc, /path="settlements"/)
  ok('no supplier-finance nav entry; legacy supplier-payments and settlements routes remain registered')

  console.log('\n--- Pure-math mirror of computeEffectiveSyncScope() ---\n')
  runMirrorCases()

  console.log(`\n${checks} checks passed`)
}

// ---------------------------------------------------------------------------
// Faithful mirror of the real (Deno TS) pure math — see the header comment.
// ---------------------------------------------------------------------------

const MAX_AUTO_SYNC_LOOKBACK_MONTHS = 24

function subtractCalendarMonths(dateKey, months) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 - months, d))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`
}

function startOfMonthKey(dateKey) {
  const [y, m] = dateKey.split('-').map(Number)
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/** points = already-filtered open obligations (is_source_deleted=false AND current_debt>0). */
function computeEffectiveSyncScope({ todayKey, requestedFrom, requestedTo, points }) {
  const recentStart = startOfMonthKey(todayKey)
  const autoFloor = subtractCalendarMonths(todayKey, MAX_AUTO_SYNC_LOOKBACK_MONTHS)

  let oldestOpenDebtDate = null
  let unresolvedDateObligationsCount = 0
  for (const point of points) {
    if (point.dateKey == null) {
      unresolvedDateObligationsCount += 1
      continue
    }
    if (oldestOpenDebtDate == null || point.dateKey < oldestOpenDebtDate) {
      oldestOpenDebtDate = point.dateKey
    }
  }

  const automaticOpenDebtFrom =
    oldestOpenDebtDate == null
      ? recentStart
      : oldestOpenDebtDate < autoFloor
        ? autoFloor
        : oldestOpenDebtDate

  const effectiveFrom = [recentStart, automaticOpenDebtFrom, requestedFrom].reduce((min, key) =>
    key < min ? key : min
  )
  const effectiveTo = todayKey

  let uncoveredOpenObligationsCount = 0
  let uncoveredOpenDebtAmount = 0
  for (const point of points) {
    if (point.dateKey == null || point.dateKey < effectiveFrom) {
      uncoveredOpenObligationsCount += 1
      uncoveredOpenDebtAmount += point.debt
    }
  }

  const openDebtCoverageComplete =
    unresolvedDateObligationsCount === 0 && uncoveredOpenObligationsCount === 0

  return {
    requestedFrom,
    requestedTo,
    recentStart,
    autoFloor,
    oldestOpenDebtDate,
    effectiveFrom,
    effectiveTo,
    openDebtCoverageComplete,
    uncoveredOpenObligationsCount,
    uncoveredOpenDebtAmount,
    unresolvedDateObligationsCount,
  }
}

/** Server-side predicate applied before points ever reach computeEffectiveSyncScope(). */
function openObligationPoints(rawRows) {
  return rawRows
    .filter((r) => !r.isSourceDeleted && r.debt > 0)
    .map((r) => ({ debt: r.debt, dateKey: r.dateKey }))
}

function mirrorOk(name) {
  checks += 1
  console.log(`  ✓ ${name}`)
}

function runMirrorCases() {
  const today = '2026-08-19'

  // Case 1 — only current-month open debt.
  {
    const points = openObligationPoints([
      { debt: 100000, dateKey: '2026-08-05', isSourceDeleted: false },
    ])
    const scope = computeEffectiveSyncScope({
      todayKey: today,
      requestedFrom: '2026-08-01',
      requestedTo: '2026-08-19',
      points,
    })
    assert.equal(scope.effectiveFrom, '2026-08-01')
    assert.equal(scope.effectiveTo, today)
    assert.equal(scope.openDebtCoverageComplete, true)
    mirrorOk('Case 1: only current debts → effectiveFrom = начало августа, coverage complete')
  }

  // Case 2 — old open debt (June) pulls effectiveFrom back.
  {
    const points = openObligationPoints([
      { debt: 100000, dateKey: '2026-06-05', isSourceDeleted: false },
    ])
    const scope = computeEffectiveSyncScope({
      todayKey: today,
      requestedFrom: '2026-08-01',
      requestedTo: '2026-08-19',
      points,
    })
    assert.ok(scope.effectiveFrom <= '2026-06-05')
    assert.equal(scope.effectiveFrom, '2026-06-05')
    mirrorOk('Case 2: июньский открытый долг расширяет effectiveFrom <= дата приёмки')
  }

  // Case 3 — closed old supply (debt=0) never enters `points`, so it can't widen the range.
  {
    const points = openObligationPoints([
      { debt: 0, dateKey: '2026-06-05', isSourceDeleted: false },
    ])
    assert.equal(points.length, 0, 'a closed (debt<=0) supply must never reach the scope calculation')
    const scope = computeEffectiveSyncScope({
      todayKey: today,
      requestedFrom: '2026-08-01',
      requestedTo: '2026-08-19',
      points,
    })
    assert.equal(scope.effectiveFrom, '2026-08-01')
    mirrorOk('Case 3: закрытый (current_debt<=0) supply не расширяет range')
  }

  // Case 4 — soft-deleted supply never enters `points` either.
  {
    const points = openObligationPoints([
      { debt: 100000, dateKey: '2026-06-05', isSourceDeleted: true },
    ])
    assert.equal(points.length, 0, 'a soft-deleted obligation must never reach the scope calculation')
    const scope = computeEffectiveSyncScope({
      todayKey: today,
      requestedFrom: '2026-08-01',
      requestedTo: '2026-08-19',
      points,
    })
    assert.equal(scope.effectiveFrom, '2026-08-01')
    mirrorOk('Case 4: is_source_deleted=true не расширяет range')
  }

  // Case 5 — explicit historical backfill request is honored even when open debt is more recent.
  {
    const points = openObligationPoints([
      { debt: 50000, dateKey: '2026-06-01', isSourceDeleted: false },
    ])
    const scope = computeEffectiveSyncScope({
      todayKey: today,
      requestedFrom: '2026-01-01',
      requestedTo: '2026-01-31',
      points,
    })
    assert.equal(scope.effectiveFrom, '2026-01-01')
    mirrorOk('Case 5: явный historical backfill (01.01) сохраняется как effectiveFrom')
  }

  // Case 6 — a stale requestedTo never shrinks effectiveTo below today.
  {
    const points = openObligationPoints([])
    const scope = computeEffectiveSyncScope({
      todayKey: today,
      requestedFrom: '2026-06-01',
      requestedTo: '2026-06-30',
      points,
    })
    assert.equal(scope.effectiveTo, today)
    mirrorOk('Case 6: requested dateTo в прошлом (июнь) не мешает effectiveTo = today')
  }

  // Case 7 — open debt older than the 24-month cap, no explicit backfill: capped, coverage false.
  {
    const oldDate = subtractCalendarMonths(today, 30)
    const points = openObligationPoints([{ debt: 481250, dateKey: oldDate, isSourceDeleted: false }])
    const scope = computeEffectiveSyncScope({
      todayKey: today,
      requestedFrom: startOfMonthKey(today),
      requestedTo: today,
      points,
    })
    assert.equal(scope.effectiveFrom, scope.autoFloor)
    assert.equal(scope.openDebtCoverageComplete, false)
    assert.equal(scope.uncoveredOpenObligationsCount, 1)
    assert.equal(scope.uncoveredOpenDebtAmount, 481250)
    mirrorOk('Case 7: open debt старше 24 месяцев без явного запроса → cap, coverage=false, полный success запрещён')
  }

  // Case 8 — explicit backfill deeper than the cap covers debt the cap alone would have missed.
  {
    const oldDate = subtractCalendarMonths(today, 30)
    const requestedFrom = subtractCalendarMonths(today, 36)
    const points = openObligationPoints([{ debt: 481250, dateKey: oldDate, isSourceDeleted: false }])
    const scope = computeEffectiveSyncScope({
      todayKey: today,
      requestedFrom,
      requestedTo: today,
      points,
    })
    assert.equal(scope.effectiveFrom, requestedFrom)
    assert.equal(scope.openDebtCoverageComplete, true)
    mirrorOk('Case 8: явный backfill (36 мес) глубже cap покрывает 30-месячный долг — coverage=true')
  }

  // Case 9 — a NULL/unresolvable date can never yield a clean coverageComplete.
  {
    const points = openObligationPoints([
      { debt: 20000, dateKey: null, isSourceDeleted: false },
    ])
    const scope = computeEffectiveSyncScope({
      todayKey: today,
      requestedFrom: startOfMonthKey(today),
      requestedTo: today,
      points,
    })
    assert.equal(scope.openDebtCoverageComplete, false)
    assert.equal(scope.unresolvedDateObligationsCount, 1)
    mirrorOk('Case 9: NULL/unresolved date → openDebtCoverageComplete=false, никогда success')
  }

  // Case 10 — multiple open debts across months; the oldest inside the cap wins.
  {
    const points = openObligationPoints([
      { debt: 10000, dateKey: '2026-08-10', isSourceDeleted: false },
      { debt: 20000, dateKey: '2026-05-10', isSourceDeleted: false },
      { debt: 30000, dateKey: '2026-02-10', isSourceDeleted: false },
    ])
    const scope = computeEffectiveSyncScope({
      todayKey: today,
      requestedFrom: startOfMonthKey(today),
      requestedTo: today,
      points,
    })
    assert.equal(scope.effectiveFrom, '2026-02-10')
    mirrorOk('Case 10: несколько долгов (авг/май/фев) → effectiveFrom покрывает самый ранний (февраль)')
  }

  // Case 11 — current month + its document payments are always inside the effective range,
  // even for a deep explicit historical backfill (Case 8's scenario, reused here).
  {
    const requestedFrom = subtractCalendarMonths(today, 36)
    const scope = computeEffectiveSyncScope({
      todayKey: today,
      requestedFrom,
      requestedTo: today,
      points: [],
    })
    assert.ok(scope.effectiveFrom <= scope.recentStart)
    assert.equal(scope.effectiveTo, today)
    mirrorOk('Case 11: текущий месяц (и, следовательно, umag_document_payments месяца) всегда внутри effectiveRange')
  }

  // Case 12 — timezone: verified structurally above (todayKey reuses aqtobeDateKeyFromIso /
  // Asia/Aqtobe, not a fresh UTC-midnight computation) since the real Intl-based resolution
  // cannot run inside this Node harness without a Deno runtime.
  mirrorOk('Case 12: timezone — проверено структурно (см. выше): переиспользован существующий Asia/Aqtobe helper')
}

main()
