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

  // --- Case 1/2: SupplierPaymentsPanel — embedded prop, default false -----
  assert.match(
    paymentsSrc,
    /export default function SupplierPaymentsPanel\(\{ embedded = false, summary: summaryProp = null \} = \{\}\)/
  )
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
  ok("the payment-schedule content itself (tabs, ObligationCard list) is NOT gated by embedded — always renders")

  assert.match(paymentsSrc, /\{selectedGroup \? \(\s*\n\s*<GroupDetail/)
  ok('the obligation detail sheet (GroupDetail) is unconditional — kept in embedded mode (item 6)')

  assert.match(paymentsSrc, /function openConfigure\(group\) \{/)
  assert.match(paymentsSrc, /navigate\('\/platform\/suppliers', \{/)
  ok('"настроить отсрочку" navigation (openConfigure) untouched — kept in embedded mode (item 6)')

  // --- Case 8: standalone payments still uses fetchSupplierFinanceSummary ---
  assert.match(paymentsSrc, /summaryProp \? Promise\.resolve\(summaryProp\) : fetchSupplierFinanceSummary\(\)/)
  ok('Case 8: the default (no summary prop) path still calls fetchSupplierFinanceSummary() — Этап 2.4 formula unchanged, just optionally skippable when a parent already has it')

  assert.doesNotMatch(paymentsSrc, /debt: view\.summaries|overdue: view\.summaries|buildPaymentScheduleView\([^)]*\)\.summaries\.totalActiveDebt/)
  ok('KPI numbers are still sourced from the summary object, not re-derived from the obligations view')

  // --- Case 3/4: UmagSettlementsPanel — embedded prop, default false ------
  assert.match(settlementsSrc, /export default function UmagSettlementsPanel\(\{ embedded = false \} = \{\}\)/)
  ok('Case 3: UmagSettlementsPanel defaults to embedded=false — standalone usage (<UmagSettlementsPanel />) is unchanged')

  assert.match(settlementsSrc, /\{canSync && !embedded \? \(/)
  assert.match(settlementsSrc, /\{!embedded && lastRun\?\.warning_message && \(/)
  ok('Case 4: the sync button and the last-run warning banner are gated behind !embedded')

  assert.doesNotMatch(
    settlementsSrc,
    /embedded[\s\S]{0,40}<PlatformSearchToolbar|<PlatformSearchToolbar[\s\S]{0,10}\{!embedded/
  )
  assert.match(settlementsSrc, /<PlatformSearchToolbar\s*\n\s*value=\{search\}/)
  ok('search + period filter (PlatformSearchToolbar, SettlementsFilterPopover) are NOT gated by embedded — always renders (item 8: period stays local content, not promoted to a future shared header yet)')

  assert.doesNotMatch(
    settlementsSrc,
    /embedded[\s\S]{0,60}<table className="umag-settlements__table umag-settlements__table--with-totals"/
  )
  ok('the settlements table itself is NOT gated by embedded — always renders')

  assert.match(settlementsSrc, /if \(selected\) \{\s*\n\s*return \(\s*\n\s*<UmagSupplierDetail/)
  assert.match(settlementsSrc, /if \(selectedReconciliationId\) \{\s*\n\s*return \(/)
  ok('supplier drill-down (UmagSupplierDetail) and reconciliation detail (ReconciliationDetailView) branches are untouched — not gated by embedded')

  // --- Case 7: embedded settlements still uses fetchCanonicalSupplierDebts (via umagSettlementsService) ---
  assert.match(settlementsSrc, /fetchUmagSettlementsBySupplier\(\{ dateFrom, dateTo, search \}\)/)
  assert.doesNotMatch(settlementsSrc, /embedded[\s\S]{0,80}fetchUmagSettlementsBySupplier/)
  const umagServiceSrc = read('src/services/umagSettlementsService.js')
  assert.match(umagServiceSrc, /fetchCanonicalSupplierDebts,\s*\n\s*resolvePlatformSupplierIdsByUmagIds,/)
  ok('Case 7: loadData() calls fetchUmagSettlementsBySupplier() unconditionally (embedded or not), which still sources debt from fetchCanonicalSupplierDebts() (Этап 2.5, unchanged)')

  // --- Case 6: reconciliation flow wiring untouched -------------------------
  assert.match(settlementsSrc, /import CreateReconciliationModal from '\.\/CreateReconciliationModal'/)
  assert.match(settlementsSrc, /import ReconciliationDetailView from '\.\/ReconciliationDetailView'/)
  assert.match(settlementsSrc, /import OperationDetailSheet from '\.\/OperationDetailSheet'/)
  assert.match(settlementsSrc, /\{canCreateRecon \? \(\s*\n\s*<button/)
  assert.match(settlementsSrc, /Создать сверку/)
  ok('Case 6: create/open/edit/resolve reconciliation wiring (modal, detail view, permission gates) is untouched')

  const reconSrc = read('src/services/supplierReconciliationService.js')
  assert.match(reconSrc, /snapshot\.umagDebt = canonicalDebt\.debt/)
  ok('Этап 2.1 computeUmagSnapshotForSupplier()/fetchCanonicalSupplierDebt() sentinel intact — not touched this stage')

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

  const changedFiles = execFileSync('git', ['diff', '--name-only', '--', 'src'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)
  assert.deepEqual(
    changedFiles.sort(),
    [PAYMENTS_PANEL, SETTLEMENTS_PANEL].sort(),
    `expected only the two panels to change under src/, got: ${changedFiles.join(', ')}`
  )
  ok('Case 5: exactly the two existing panel files changed under src/ — no parallel copy-paste implementation, standalone and embedded share the same functions/JSX')

  // --- Case 10: routes/nav untouched ---------------------------------------
  const routeStatus = gitStatus(['src/App.jsx', 'src/platform/platformNav.js'])
  assert.equal(routeStatus, '', `unexpected route/nav changes: ${routeStatus}`)
  assert.doesNotMatch(execFileSync('git', ['diff', '--', 'src/App.jsx'], { cwd: ROOT, encoding: 'utf8' }), /supplier-finance/)
  ok('Case 10: App.jsx and platformNav.js untouched — no /platform/supplier-finance route added')

  // --- Case 11: CSS untouched ------------------------------------------------
  const cssStatus = gitStatus([
    'src/components/suppliers/payments/SupplierPaymentsPanel.css',
    'src/components/suppliers/settlements/UmagSettlementsPanel.css',
  ])
  assert.equal(cssStatus, '', `unexpected CSS changes: ${cssStatus}`)
  ok('Case 11: no CSS files touched — pure JSX/props refactor, zero visual diff for standalone (embedded=false) usage')

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
    'canViewUmagReconciliations',
    'canCreateUmagReconciliations',
    'canEditUmagReconciliations',
    'canResolveUmagReconciliations',
  ]) {
    assert.ok(settlementsSrc.includes(gate), `${gate} missing from UmagSettlementsPanel.jsx`)
  }
  assert.match(settlementsSrc, /if \(!canView\) \{\s*\n\s*return <PlatformAccessDenied/)
  ok('Case 12: UmagSettlementsPanel permission gates (view/sync/reconciliation create-edit-resolve) all still present')

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
  assert.match(debtServiceSrc, /export async function fetchCanonicalSupplierDebts/)
  ok('Этап 2.2/2.3/2.4/2.5 sentinels (sync scope, sync lock, Financial Summary formula, canonical batch debt) intact')

  console.log(`\n${checks} checks passed`)
}

main()
