#!/usr/bin/env node
/**
 * Verification for Этап 2.7 — hidden unified «Расчёты» page.
 *
 * Structural checks against the real committed source, plus real (not
 * mirrored) imports of the pure presentation logic
 * (utils/supplierFinancePagePresentation.js) via extensionlessResolver.
 * No live Supabase connection was available to click through the
 * authenticated route itself (see the report's "M" section) — the login
 * redirect for /platform/supplier-finance was confirmed instead.
 *
 * Usage:
 *   npm run verify:supplier-finance-page
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

const APP = 'src/App.jsx'
const NAV = 'src/platform/platformNav.js'
const PANEL = 'src/components/suppliers/finance/SupplierFinancePanel.jsx'
const PAGE = 'src/pages/platform/supplier-finance/SupplierFinancePage.jsx'
const PRESENTATION = 'src/utils/supplierFinancePagePresentation.js'
const PAYMENTS_PANEL = 'src/components/suppliers/payments/SupplierPaymentsPanel.jsx'
const SETTLEMENTS_PANEL = 'src/components/suppliers/settlements/UmagSettlementsPanel.jsx'
const PERMISSIONS = 'src/config/permissions.js'
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
function gitStatus(paths) {
  return execFileSync('git', ['status', '--porcelain', '--', ...paths], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
}
function gitDiff(paths) {
  return execFileSync('git', ['diff', '--', ...paths], { cwd: ROOT, encoding: 'utf8' })
}

async function main() {
  console.log('=== Supplier finance page verification (Этап 2.7) ===\n')

  const appSrc = read(APP)
  const navSrc = read(NAV)
  const panelSrc = read(PANEL)
  const pageSrc = read(PAGE)
  const permsSrc = read(PERMISSIONS)

  // --- Case 1: route exists ------------------------------------------------
  assert.match(appSrc, /const SupplierFinancePage = lazy\(\s*\n\s*\(\) => import\('\.\/pages\/platform\/supplier-finance\/SupplierFinancePage'\)/)
  assert.match(appSrc, /path="supplier-finance"/)
  assert.match(appSrc, /<PlatformRoute routeKey=\{ROUTE_KEYS\.SUPPLIER_FINANCE\}>\s*\n\s*<SupplierFinancePage \/>/)
  ok('Case 1: /platform/supplier-finance is registered in App.jsx, wrapped in the existing PlatformRoute guard')

  // --- Case 2: nav hidden ---------------------------------------------------
  assert.doesNotMatch(navSrc, /supplier-finance/)
  assert.doesNotMatch(navSrc, /SUPPLIER_FINANCE/)
  const navStatus = gitStatus([NAV])
  assert.equal(navStatus, '', `platformNav.js changed unexpectedly: ${navStatus}`)
  ok('Case 2: platformNav.js has zero diff and contains no supplier-finance entry — no visible nav item')

  // --- Case 15 (permission scope): union of existing permissions, not broader ---
  assert.match(permsSrc, /SUPPLIER_FINANCE: 'supplier_finance'/)
  assert.match(permsSrc, /\[ROUTE_KEYS\.SUPPLIER_FINANCE\]: \[P\.UMAG_SETTLEMENTS_VIEW, P\.SUPPLIER_PAYMENTS_VIEW\]/)
  assert.doesNotMatch(pageSrc, /service_role|supabaseAdmin/i)
  assert.match(pageSrc, /canViewSupplierPayments\(user\) && !canViewUmagSettlements\(user\)/.source ? /!canViewSupplierPayments\(user\) && !canViewUmagSettlements\(user\)/ : /x/)
  ok('page-level gate is exactly canViewSupplierPayments(user) OR canViewUmagSettlements(user) — the union of the two existing routes, no service_role/RLS bypass')

  // --- Case 3/4: exactly 4 KPIs, all summary-sourced ------------------------
  const kpiTileCount = (panelSrc.match(/<KpiTile\b/g) || []).length
  assert.equal(kpiTileCount, 4, `expected exactly 4 <KpiTile> usages, found ${kpiTileCount}`)
  ok('Case 3: exactly 4 KpiTile renders — no 5th/6th card (Предстоящие/Без срока/counts excluded)')

  assert.match(panelSrc, /<KpiTile label="Долг" value=\{summary\?\.debt\}/)
  assert.match(panelSrc, /value=\{summary\?\.overdue\?\.amount\}/)
  assert.match(panelSrc, /value=\{summary\?\.dueToday\?\.amount\}/)
  assert.match(panelSrc, /value=\{summary\?\.paidThisMonth\?\.amount\}/)
  assert.doesNotMatch(panelSrc, /summary\?\.upcoming|summary\?\.termsMissing|openObligationsCount/)
  ok('Case 4: all 4 KPI values are summary.debt / summary.overdue.amount / summary.dueToday.amount / summary.paidThisMonth.amount — no new query, no re-derivation, no upcoming/termsMissing/count leaking into the top row')

  // --- Case 5: paid-unavailable never renders as 0 --------------------------
  assert.match(panelSrc, /const paidUnavailable = summary\?\.paidThisMonth\?\.status === 'unavailable'/)
  assert.match(panelSrc, /unavailable=\{paidUnavailable\}/)
  const kpiTileFn = panelSrc.slice(panelSrc.indexOf('function KpiTile'), panelSrc.indexOf('export default function'))
  assert.match(kpiTileFn, /unavailable \? '—' : formatUmagMoney\(value\)/)
  ok("Case 5: paidThisMonth.status==='unavailable' renders '—', never formatUmagMoney(null) (which would silently show '0 ₸' — Number(null)===0)")

  console.log('\n--- Real imports: pure logic exercised with fixture data ---\n')
  await runRealCases()

  // --- Case 12/14: VIEW PERIOD isolation ------------------------------------
  // Only the real import statements count — a code comment is allowed to
  // *name* SettlementsFilterPopover while explaining that it is deliberately
  // not imported (see the "Item 23/24" comment above handleSync()).
  const panelImportBlock = panelSrc.slice(0, panelSrc.indexOf('const TABS ='))
  assert.doesNotMatch(panelImportBlock, /SettlementsFilterPopover|getSettlementsPeriodDefaults/)
  assert.doesNotMatch(panelSrc, /useState\(currentMonth/)
  ok('Case 12/24: the shell never imports SettlementsFilterPopover or holds any period/dateFrom/dateTo state — VIEW PERIOD stays inside UmagSettlementsPanel only')

  assert.match(panelSrc, /const todayKey = summary\?\.todayKey \|\| toAqtobeDateKey\(\)/)
  assert.match(panelSrc, /const \{ dateFrom \} = getMonthRangeKeys\(year, month\)/)
  assert.match(panelSrc, /syncUmagSettlements\(\{ dateFrom, dateTo: todayKey, syncSuppliers: true \}\)/)
  ok('Case 14: handleSync() builds its requested range from todayKey/getMonthRangeKeys only — no settlements-period variable exists in this file to pass')

  // --- Case 13/21: reuses the existing sync pipeline, no new Edge Function ---
  assert.match(panelSrc, /import \{[\s\S]*syncUmagSettlements,?[\s\S]*\} from '\.\.\/\.\.\/\.\.\/services\/umagSettlementsService'/)
  assert.doesNotMatch(panelSrc, /functions\.invoke\(/)
  ok('Case 13: the global ↻ calls the existing syncUmagSettlements() wrapper directly — no new invoke() call, no new Edge Function')

  const syncFnStatus = gitStatus(['supabase/functions/umag-sync'])
  const migrationStatus = gitStatus(['supabase/migrations'])
  assert.equal(syncFnStatus, '', `umag-sync Edge Function changed unexpectedly: ${syncFnStatus}`)
  assert.equal(migrationStatus, '', `a migration changed unexpectedly: ${migrationStatus}`)
  ok('Case 21: supabase/functions/umag-sync and supabase/migrations have zero diff — sync scope (Этап 2.2) and sync lock (Этап 2.3) untouched')

  // --- Case 15: post-sync refresh (summary + embedded content), no full reload ---
  assert.match(panelSrc, /await loadSummary\(\)\s*\n\s*setRefreshToken\(\(token\) => token \+ 1\)/)
  assert.doesNotMatch(panelSrc, /window\.location\.reload|location\.href\s*=/)
  assert.doesNotMatch(panelSrc, /key=\{Date\.now\(\)\}|key=\{refreshToken\}/)
  ok('Case 15/26/27: success/partial refetches summary and bumps refreshToken (no full-page reload, no remount-via-key hack)')

  // --- Case 16: SYNC_ALREADY_RUNNING is a compact business conflict, not "unknown error" ---
  assert.match(read(UMAG_SERVICE), /SYNC_ALREADY_RUNNING: 'SYNC_ALREADY_RUNNING'/)
  assert.match(read(UMAG_SERVICE), /if \(normalized === 'SYNC_ALREADY_RUNNING'\) \{\s*\n\s*return UMAG_SETTLEMENTS_ERROR_CODES\.SYNC_ALREADY_RUNNING/)
  assert.match(
    panelSrc,
    /if \(result\.code === UMAG_SETTLEMENTS_ERROR_CODES\.SYNC_ALREADY_RUNNING\) \{\s*\n\s*showWarning\(result\.message\)/
  )
  ok('Case 16: a 409/SYNC_ALREADY_RUNNING result is shown via showWarning(result.message) — never funnelled into the generic showError("unknown") path')

  // --- Case 17/18/19: partial/running/failed compact states, never conflated ---
  assert.match(panelSrc, /disabled=\{!canSync \|\| syncing \|\| lastSync\?\.status === 'running'\}/)
  assert.match(panelSrc, /syncing=\{syncing \|\| lastSync\?\.status === 'running'\}/)
  ok('Case 18: the sync button is disabled/shows the spinner both while this tab is syncing AND while lastSync.status is already running')

  // --- Case 10/11: embedded panels wired, no duplicate shell -----------------
  assert.match(panelSrc, /<SupplierPaymentsPanel embedded summary=\{summary\} refreshToken=\{refreshToken\} \/>/)
  assert.match(panelSrc, /<UmagSettlementsPanel embedded refreshToken=\{refreshToken\} \/>/)
  ok('Case 10/11: both content panels are rendered with embedded (hides their own shell/KPIs/second ↻) — confirmed structurally in Этап 2.6')

  // Item 18: the payment schedule's own duplicate "К оплате" section title is
  // hidden in embedded mode (new this stage), while everything else in that
  // section stays.
  const paymentsSrc = read(PAYMENTS_PANEL)
  assert.match(paymentsSrc, /\{!embedded && \(\s*\n\s*<div className="spo-panel__plan-head">\s*\n\s*<h3 className="spo-panel__section-title">К оплате<\/h3>/)
  ok('item 18: embedded SupplierPaymentsPanel no longer shows a second "К оплате" title — tabs/list/detail sheet inside the section are untouched')

  // --- refreshToken plumbing on both embedded panels ------------------------
  assert.match(paymentsSrc, /refreshToken = null,?\s*\n\} = \{\}\)/)
  assert.match(paymentsSrc, /\[canView, load, refreshToken\]/)
  const settlementsSrc = read(SETTLEMENTS_PANEL)
  assert.match(settlementsSrc, /refreshToken = null \} = \{\}\)/)
  assert.match(settlementsSrc, /\[canView, loadData, refreshToken\]/)
  ok('refreshToken is threaded into both panels\' existing load-triggering effect — reload without remount, standalone (refreshToken=null, no-op) unaffected')

  // --- Case 9/20: legacy pages/routes still present and unmodified ----------
  const legacyStatus = gitStatus([
    'src/pages/platform/settlements/SettlementsPage.jsx',
    'src/pages/platform/supplier-payments/SupplierPaymentsPage.jsx',
  ])
  assert.equal(legacyStatus, '', `a legacy page changed unexpectedly: ${legacyStatus}`)
  assert.match(appSrc, /path="settlements"/)
  assert.match(appSrc, /path="supplier-payments"/)
  ok('Case 20: SettlementsPage.jsx/SupplierPaymentsPage.jsx are unmodified and both legacy routes are still registered — all three routes coexist')

  // --- Case 22: responsive — no obvious horizontal-overflow risk ------------
  const shellCss = read('src/components/suppliers/finance/SupplierFinancePanel.css')
  assert.match(shellCss, /@media \(max-width: 900px\) \{\s*\n\s*\.sfp-panel__kpis \{\s*\n\s*grid-template-columns: 1fr 1fr;/)
  assert.match(shellCss, /\.sfp-panel__bar \{\s*\n\s*display: flex;\s*\n\s*flex-wrap: wrap;/)
  // Exclude the intentional @media (max-width:…)/(min-width:…) breakpoints —
  // only a fixed *declaration* like `width: 900px;` on an element would risk
  // horizontal overflow.
  assert.doesNotMatch(shellCss, /(?<!max-)(?<!min-)width:\s*\d{3,}px;/)
  ok('Case 22: KPI grid collapses to 2 columns under 900px, the tabs/sync bar wraps (flex-wrap), and no large fixed pixel width was introduced that could force horizontal overflow')

  console.log(`\n${checks} checks passed`)
  console.log(
    '\nNOTE: no live Supabase/session was available in this environment (no .env.local) to click\n' +
      'through the authenticated page. A local dev server was started and /platform/supplier-finance\n' +
      'was navigated to directly — it correctly hit the existing login gate (ProtectedRoute),\n' +
      'confirming the route itself resolves before authentication, with zero console errors.\n' +
      'Full visual inspection of the rendered KPI/tabs/sync layout was not possible; this script\n' +
      'performs the structural CSS/JSX verification the task explicitly allows as a fallback.'
  )
}

async function runRealCases() {
  const presentation = await load(PRESENTATION)
  const { resolveActiveTab, describeSyncStatus, monthLabelFromDateKey } = presentation

  function mirrorOk(name) {
    checks += 1
    console.log(`  ✓ ${name}`)
  }

  // Case 6 — both permissions: default tab is payments.
  {
    const tab = resolveActiveTab(null, ['payments', 'settlements'])
    assert.equal(tab, 'payments')
    mirrorOk('Case 6: оба права доступны, ?tab= отсутствует → default = payments')
  }

  // Case 7 — settlements-only user: only settlements is ever offered/selected.
  {
    const tab = resolveActiveTab(null, ['settlements'])
    assert.equal(tab, 'settlements')
    const tabWithForbiddenRequest = resolveActiveTab('payments', ['settlements'])
    assert.equal(tabWithForbiddenRequest, 'settlements')
    mirrorOk('Case 7: нет supplier_payments.view → активна только Взаиморасчёты, даже если запрошен payments')
  }

  // Case 8 — an explicit, allowed ?tab= is honored (survives "refresh" — the
  // function is pure, so calling it again with the same input is exactly
  // what a refresh reload would do).
  {
    const tab = resolveActiveTab('settlements', ['payments', 'settlements'])
    assert.equal(tab, 'settlements')
    const tabAgain = resolveActiveTab('settlements', ['payments', 'settlements'])
    assert.equal(tabAgain, tab)
    mirrorOk('Case 8: ?tab=settlements выбирает нужную вкладку и даёт тот же результат при повторном вызове (переживает refresh)')
  }

  // Case 9 — a forbidden/unknown query tab is replaced by an allowed one.
  {
    const tab = resolveActiveTab('bogus', ['payments', 'settlements'])
    assert.equal(tab, 'payments')
    const tabForbidden = resolveActiveTab('settlements', ['payments'])
    assert.equal(tabForbidden, 'payments')
    mirrorOk('Case 9: неизвестный/недоступный ?tab= автоматически заменяется первым разрешённым')
  }

  // Case 17 — partial status visible and distinguishable.
  {
    const status = describeSyncStatus({
      status: 'partial',
      finished_at: '2026-08-20T01:00:00.000Z',
      warning_message: 'Расхождение агрегатов',
    })
    assert.equal(status.tone, 'partial')
    assert.match(status.text, /Частично/)
    assert.equal(status.title, 'Расхождение агрегатов')
    mirrorOk('Case 17: lastSync.status=partial виден как "· Частично" с tooltip из warning_message, не поглощается success-текстом')
  }

  // Case 18 — running status is its own compact state, not a stale timestamp.
  {
    const status = describeSyncStatus({
      status: 'running',
      started_at: '2026-08-20T01:00:00.000Z',
      finished_at: null,
    })
    assert.equal(status.tone, 'running')
    assert.equal(status.text, 'UMAG · синхронизация…')
    assert.doesNotMatch(status.text, /01:00/)
    mirrorOk('Case 18: running показывает "синхронизация…", а не старый started_at-таймстамп как будто sync завершён')
  }

  // Case 19 — a failed run is never presented as a normal "Обновлено".
  {
    const status = describeSyncStatus({
      status: 'failed',
      finished_at: '2026-08-20T01:00:00.000Z',
      error_message: 'Ошибка входа в UMAG',
    })
    assert.equal(status.tone, 'failed')
    assert.equal(status.text, 'UMAG · Ошибка')
    assert.equal(status.title, 'Ошибка входа в UMAG')
    mirrorOk('Case 19: failed показывает "UMAG · Ошибка" (не таймстамп) с доступом к error_message через title')
  }

  // Success — the plain, unlabeled compact case.
  {
    const status = describeSyncStatus({ status: 'success', finished_at: '2026-08-20T01:00:00.000Z' })
    assert.equal(status.tone, 'success')
    assert.doesNotMatch(status.text, /Частично|Ошибка|синхронизация…/)
    mirrorOk('success: компактный "UMAG · <дата, время>" без лишних слов (item 30)')
  }

  // Item 34 — finished_at preferred, started_at only as a fallback.
  {
    const withFinished = describeSyncStatus({
      status: 'success',
      started_at: '2026-08-19T20:00:00.000Z',
      finished_at: '2026-08-20T01:00:00.000Z',
    })
    const onlyStarted = describeSyncStatus({
      status: 'success',
      started_at: '2026-08-19T20:00:00.000Z',
      finished_at: null,
    })
    assert.notEqual(withFinished.text, onlyStarted.text)
    mirrorOk('item 34: timestamp предпочитает finished_at, started_at — только когда finished_at отсутствует')
  }

  // Item 9 — month label is derived from the given dateKey, not a fresh `new Date()`.
  {
    assert.equal(monthLabelFromDateKey('2026-08-20'), 'август')
    assert.equal(monthLabelFromDateKey('2026-01-05'), 'январь')
    mirrorOk('item 9: месяц карточки "Оплачено" читается из переданного todayKey, а не из независимого new Date()')
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`)
  process.exit(1)
})
