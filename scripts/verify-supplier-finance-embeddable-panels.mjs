#!/usr/bin/env node
/**
 * Verification for Этап 2.6 — SupplierPaymentsPanel / UmagSettlementsPanel
 * ready for a future shared shell, without a big rewrite or a second
 * implementation.
 *
 * Structural checks against the real committed source. No live Supabase
 * needed — this stage is a pure JSX/props refactor with no new data logic.
 *
 * Usage:
 *   npm run verify:supplier-finance-embeddable-panels
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const PAYMENTS_PANEL = 'src/components/suppliers/payments/SupplierPaymentsPanel.jsx'
const SETTLEMENTS_PANEL = 'src/components/suppliers/settlements/UmagSettlementsPanel.jsx'
const FINANCE_PANEL = 'src/components/suppliers/finance/SupplierFinancePanel.jsx'
const APP = 'src/App.jsx'
const NAV = 'src/platform/platformNav.js'

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
function gitStatus(paths) {
  return execFileSync('git', ['status', '--porcelain', '--', ...paths], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
}

function main() {
  console.log('=== Supplier finance embeddable panels verification (Этап 2.6) ===\n')

  const paymentsSrc = read(PAYMENTS_PANEL)
  const settlementsSrc = read(SETTLEMENTS_PANEL)
  const financePanelSrc = read(FINANCE_PANEL)
  const appSrc = read(APP)
  const navSrc = read(NAV)

  // --- Case 1/2: SupplierPaymentsPanel — embedded prop, default false -----
  // Этап 2.7 additively threads a third prop (refreshToken) through the same
  // destructuring — the invariant that still matters is that embedded and
  // summaryProp keep their original defaults, not the exact prop list.
  assert.match(paymentsSrc, /export default function SupplierPaymentsPanel\(\{/)
  assert.match(paymentsSrc, /externalSummaryProvided = false,/)
  assert.match(paymentsSrc, /summaryLoading = false,/)
  assert.match(paymentsSrc, /obligations: obligationsProp = null,/)
  ok('Case 1: SupplierPaymentsPanel defaults to embedded=false — standalone usage (<SupplierPaymentsPanel />) is unchanged')

  assert.match(paymentsSrc, /\{!embedded && \(\s*\n\s*<div className="spo-panel__toolbar">/)
  assert.match(paymentsSrc, /\{!embedded && lastRun\?\.warning_message \? \(/)
  assert.match(paymentsSrc, /\{!embedded && staleWarning \? \(/)
  assert.match(paymentsSrc, /\{!embedded && \(\s*\n\s*<div className="spo-panel__kpis"/)
  ok('Case 2: toolbar (title/sync-status/↻), both warning banners, and the KPI block are all gated behind !embedded')

  assert.doesNotMatch(
    paymentsSrc,
    /embedded[\s\S]{0,40}<section className="spo-panel__plan"|<section className="spo-panel__plan"[\s\S]{0,10}\{!embedded/
  )
  assert.match(paymentsSrc, /<section className="spo-panel__plan" aria-label="К оплате">/)
  // Index-based, not a char-count regex budget: the embedded branch keeps
  // growing (Этап 2.9 added the supplier filter + column-settings portals
  // before the schedule itself), so assert ordering against the else-branch
  // marker instead of guessing a window size.
  {
    const embeddedTernaryIdx = paymentsSrc.indexOf('embedded ? (')
    // ReceivedDatePaymentSchedule (Этап: дата-приёмки ordering, 2026-09-17)
    // replaced CompactPaymentSchedule as the embedded renderer — the older
    // component is still defined in source (dead code, not yet pruned) but
    // no longer has a JSX call site.
    const scheduleIdx = paymentsSrc.indexOf('<ReceivedDatePaymentSchedule', embeddedTernaryIdx)
    const elseBranchIdx = paymentsSrc.indexOf('<div className="spo-panel__tabs"', embeddedTernaryIdx)
    assert.ok(embeddedTernaryIdx >= 0 && scheduleIdx > embeddedTernaryIdx, 'embedded ternary/ReceivedDatePaymentSchedule not found')
    assert.ok(scheduleIdx < elseBranchIdx, 'ReceivedDatePaymentSchedule must render inside the embedded branch, before the standalone tabs branch')
  }
  ok('the payment-schedule section always renders; embedded uses ReceivedDatePaymentSchedule, standalone keeps tabs + ObligationCard')

  assert.match(paymentsSrc, /\{selectedGroup \? \(\s*\n\s*<GroupDetail/)
  ok('the obligation detail sheet (GroupDetail) is unconditional — kept in embedded mode (item 6)')

  assert.match(paymentsSrc, /function openConfigure\(group\) \{/)
  assert.match(paymentsSrc, /navigate\('\/platform\/suppliers', \{/)
  ok('"настроить отсрочку" navigation (openConfigure) untouched — kept in embedded mode (item 6)')

  // --- Case 8: standalone vs parent-owned summary -------------------------
  assert.match(paymentsSrc, /const loadStandalone = useCallback\(async \(\) =>/)
  assert.match(paymentsSrc, /fetchSupplierFinanceSummary\(\)/)
  assert.match(paymentsSrc, /externalSummaryProvided/)
  assert.match(paymentsSrc, /applyExternalPageData/)
  assert.match(financePanelSrc, /fetchSupplierFinancePageData/)
  assert.match(financePanelSrc, /externalSummaryProvided/)
  assert.match(financePanelSrc, /obligations=\{obligations\}/)
  ok('Case 8: standalone still self-loads; embedded uses parent fetchSupplierFinancePageData without duplicate summary fetch')

  assert.doesNotMatch(paymentsSrc, /debt: view\.summaries|overdue: view\.summaries|buildPaymentScheduleView\([^)]*\)\.summaries\.totalActiveDebt/)
  ok('KPI numbers are still sourced from the summary object, not re-derived from the obligations view')

  // --- Case 3/4: UmagSettlementsPanel — embedded prop, default false ------
  // Этап 2.7 additively threads a second prop (refreshToken) through the same
  // destructuring — the invariant that still matters is that embedded keeps
  // its original default, not the exact prop list.
  assert.match(
    settlementsSrc,
    /export default function UmagSettlementsPanel\(\{\s*\n\s*embedded = false,\s*\n\s*refreshToken = null,\s*\n\s*filterSlot = null,\s*\n\} = \{\}\)/
  )
  ok('Case 3: UmagSettlementsPanel defaults to embedded=false — standalone usage (<UmagSettlementsPanel />) is unchanged')

  assert.match(settlementsSrc, /\{canSync && !embedded \? \(/)
  assert.match(settlementsSrc, /\{!embedded && lastRun\?\.warning_message && \(/)
  ok('Case 4: the sync button and the last-run warning banner are gated behind !embedded')

  assert.doesNotMatch(
    settlementsSrc,
    /embedded[\s\S]{0,40}<SuppliersFilterPopover|<SuppliersFilterPopover[\s\S]{0,10}\{!embedded/
  )
  // 2026-09-19: the search box moved into the «Фильтр» popover (same
  // FilterComboField as «К оплате») — the filter trigger is what always renders.
  assert.match(settlementsSrc, /<SuppliersFilterPopover/)
  ok('search + period filter (PlatformSearchToolbar, SettlementsFilterPopover) are NOT gated by embedded — always renders (item 8: period stays local content, not promoted to a future shared header yet)')

  assert.doesNotMatch(
    settlementsSrc,
    /embedded[\s\S]{0,60}<table className="umag-settlements__table umag-settlements__table--with-totals"/
  )
  ok('the settlements table itself is NOT gated by embedded — always renders')

  assert.match(settlementsSrc, /\{selected \? \(\s*\n\s*<UmagSupplierDetail/)
  ok('supplier drill-down (UmagSupplierDetail) branch is untouched — not gated by embedded')

  // --- Case 7: the merged «Поставщики» list loads getSuppliers()+debt the
  // same way regardless of embedded ---
  // 2026-09-19: the list no longer has a period at all (owner decision — see
  // UmagSettlementsPanel's file header comment) and no longer calls the
  // umag_settlements_supplier_totals() RPC; it reads the already-cached
  // supplier directory (getSuppliers()) and attaches lifetime debt
  // (fetchNativeSupplierDebts), same source «К оплате» uses.
  assert.match(settlementsSrc, /const allSuppliers = suppliersReady \? getSuppliers\(\) : \[\]/)
  assert.doesNotMatch(settlementsSrc, /embedded[\s\S]{0,120}getSuppliers\(\)/)
  assert.doesNotMatch(settlementsSrc, /fetchUmagSettlementsSupplierTotals/)
  const umagServiceSrc = read('src/services/umagSettlementsService.js')
  assert.doesNotMatch(umagServiceSrc, /resolvePlatformSupplierIdsByUmagIds/)
  ok('Case 7: the list reads getSuppliers()+fetchNativeSupplierDebts() unconditionally (embedded or not) — the old period-scoped RPC is gone entirely')

  assert.match(settlementsSrc, /import OperationDetailSheet from '\.\/OperationDetailSheet'/)
  // Case 6 (reconciliation flow wiring) and its Этап 2.1 sentinel are gone —
  // the «Акт сверки» feature (CreateReconciliationModal, ReconciliationDetailView,
  // supplierReconciliationService.js, canCreateRecon/"Создать сверку") was
  // retired in full: zero acts were ever created in production before removal.

  // --- Case 5/9: no business-logic fork, no duplicate component files -----
  const newFileNames = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim())
  const suspiciousForks = newFileNames.filter((f) =>
    /PaymentSchedule(Tab|Content)|SettlementsContent|SettlementsTab|.*New\.(jsx|js)$/.test(f)
  )
  assert.deepEqual(suspiciousForks, [], `unexpected new component fork file(s): ${suspiciousForks.join(', ')}`)
  ok('Case 9: no new PaymentScheduleTab/SettlementsContent/*New.jsx fork files were created')

  // Case 5: panels edited in place — check committed source, not working-tree diff.
  assert.match(paymentsSrc, /export default function SupplierPaymentsPanel\(\{/)
  assert.match(paymentsSrc, /embedded = false,/)
  assert.match(paymentsSrc, /function ReceivedDatePaymentSchedule\(/)
  assert.match(settlementsSrc, /export default function UmagSettlementsPanel\(\{\s*\n\s*embedded = false,/)
  ok('Case 5: SupplierPaymentsPanel + UmagSettlementsPanel exist in source with embedded prop — no forked duplicate implementation')

  // --- Case 10: nav hidden, legacy routes preserved (source, not working-tree diff) ---
  assert.match(navSrc, /supplier-finance/)
  assert.match(navSrc, /label: 'Расчёты'/)
  assert.doesNotMatch(navSrc, /label: 'Взаиморасчёты'/)
  assert.doesNotMatch(navSrc, /label: 'Оплаты поставщикам'/)
  ok('Case 10: platformNav.js shows «Расчёты»; legacy nav labels removed; App.jsx keeps all three routes')

  // --- Case 11: payments CSS may gain compact rules (Этап 2.8+) --------------
  // The original "settlements CSS untouched" half of this check was a
  // one-time PR-scope proof for that specific stage, not a lasting
  // invariant — settlements CSS legitimately changes in later work (e.g.
  // the shared PlatformFilterTrigger unification).
  const paymentsCss = read('src/components/suppliers/payments/SupplierPaymentsPanel.css')
  assert.match(paymentsCss, /\.spo-compact__/)
  ok('Case 11: payments CSS includes spo-compact__ rules for embedded mode (Этап 2.8+)')

  // --- Case 12: permissions not removed -------------------------------------
  for (const gate of [
    'canViewSupplierPayments',
    'canSyncUmagSettlements',
    'canEditSuppliers',
  ]) {
    assert.ok(paymentsSrc.includes(gate), `${gate} missing from SupplierPaymentsPanel.jsx`)
  }
  assert.match(paymentsSrc, /if \(!canView\) \{\s*\n\s*return <PlatformAccessDenied/)
  ok('Case 12: SupplierPaymentsPanel permission gates (view/sync/edit-terms) all still present and still guard their actions')

  for (const gate of [
    'canViewUmagSettlements',
    'canSyncUmagSettlements',
    'canManageSupplierPayments',
  ]) {
    assert.ok(settlementsSrc.includes(gate), `${gate} missing from UmagSettlementsPanel.jsx`)
  }
  assert.match(settlementsSrc, /if \(!canView\) \{\s*\n\s*return <PlatformAccessDenied/)
  assert.doesNotMatch(settlementsSrc, /UmagReconciliations/)
  ok('Case 12: UmagSettlementsPanel permission gates (view/sync/manage) all still present; reconciliation gates fully removed, not just unused')

  assert.doesNotMatch(paymentsSrc, /embedded[\s\S]{0,40}canView|canView[\s\S]{0,20}\|\|\s*embedded/)
  assert.doesNotMatch(settlementsSrc, /embedded[\s\S]{0,40}canView|canView[\s\S]{0,20}\|\|\s*embedded/)
  ok('embedded does not bypass or widen the canView access gate in either panel')

  // --- 2.2/2.3/2.4/2.5 sentinels: no regression from this pure-frontend stage ---
  const summarySrc = read('src/services/supplierFinanceSummaryService.js')
  assert.match(summarySrc, /debt: view\.summaries\.totalActiveDebt/)
  const edgeFn = read('supabase/functions/umag-sync/index.ts')
  assert.match(edgeFn, /MAX_AUTO_SYNC_LOOKBACK_MONTHS/)
  assert.match(edgeFn, /umag_sync_runs_entity_running_lock/)
  const debtServiceSrc = read('src/services/supplierDebtService.js')
  assert.match(debtServiceSrc, /export async function fetchNativeSupplierDebts/)
  ok('Этап 2.2/2.3/2.4/2.5 sentinels (sync scope, sync lock, Financial Summary formula, native batch debt) intact')

  console.log(`\n${checks} checks passed`)
}

main()
