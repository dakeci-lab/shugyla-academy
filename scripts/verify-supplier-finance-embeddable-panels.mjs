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
  // Этап 2.7 additively threads a third prop (refreshToken) through the same
  // destructuring — the invariant that still matters is that embedded and
  // summaryProp keep their original defaults, not the exact prop list.
  assert.match(paymentsSrc, /export default function SupplierPaymentsPanel\(\{/)
  assert.match(paymentsSrc, /embedded = false,\s*\n\s*summary: summaryProp = null,/)
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
  // Этап 2.7 additively threads a second prop (refreshToken) through the same
  // destructuring — the invariant that still matters is that embedded keeps
  // its original default, not the exact prop list.
  assert.match(settlementsSrc, /export default function UmagSettlementsPanel\(\{ embedded = false, refreshToken = null \} = \{\}\)/)
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

  // Case 5/9 originally asserted these were the ONLY two files changed under
  // src/ at all, when this stage's sole purpose was the embedded/summary
  // prop refactor. Этап 2.7 legitimately builds a whole new consuming page
  // around these same two panels (new shell component, new route, new
  // presentation util, a third refreshToken prop on both panels) — so the
  // real, still-meaningful invariant is narrower: no *forked duplicate* of
  // either panel exists, and both original panel files are still part of
  // the diff (not replaced/deleted), not that literally nothing else in the
  // repo may ever change again.
  const changedFiles = execFileSync('git', ['diff', '--name-only', '--', 'src'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)
  assert.ok(changedFiles.includes(PAYMENTS_PANEL), `${PAYMENTS_PANEL} missing from the diff — panel appears replaced rather than edited`)
  assert.ok(changedFiles.includes(SETTLEMENTS_PANEL), `${SETTLEMENTS_PANEL} missing from the diff — panel appears replaced rather than edited`)
  ok('Case 5: both original panel files are still present in the diff (edited in place) — no parallel copy-paste implementation, standalone and embedded share the same functions/JSX')

  // --- Case 10: nav untouched, App.jsx routes for THIS stage's own subject unmodified ---
  // platformNav.js is the real "no visible menu entry" invariant and must
  // stay at zero diff. App.jsx is expected to gain a new, additive, hidden
  // /platform/supplier-finance route in Этап 2.7 — that is the whole point
  // of that later stage, not a regression of this one. What still must hold
  // here is that the settlements/supplier-payments routes THIS stage cares
  // about are not removed or altered.
  const navStatus = gitStatus(['src/platform/platformNav.js'])
  assert.equal(navStatus, '', `unexpected nav changes: ${navStatus}`)
  const appDiff = execFileSync('git', ['diff', '--', 'src/App.jsx'], { cwd: ROOT, encoding: 'utf8' })
  const removedRouteLines = appDiff
    .split('\n')
    .filter((line) => line.startsWith('-') && !line.startsWith('---'))
    .filter((line) => /settlements|supplier-payments/.test(line))
  assert.deepEqual(removedRouteLines, [], `existing route lines removed from App.jsx: ${removedRouteLines.join(' | ')}`)
  ok('Case 10: platformNav.js untouched (no nav entry), and App.jsx keeps its pre-existing settlements/supplier-payments routes intact (a later stage may additively register new routes)')

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
