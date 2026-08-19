#!/usr/bin/env node
/**
 * Verification for Этап 2.5 — «Взаиморасчёты» use canonical current debt.
 *
 * Structural checks against the real committed source, plus real (not
 * mirrored) imports of the pure pieces via extensionlessResolver:
 * resolveRowCanonicalDebt (new, Этап 2.5), isActiveOpenObligation (Этап 2.1,
 * unchanged). The Supabase I/O itself (fetchCanonicalSupplierDebts,
 * resolvePlatformSupplierIdsByUmagIds, fetchUmagSettlementsBySupplier) needs
 * a live connection, unavailable in this environment (no .env.local).
 *
 * Usage:
 *   npm run verify:settlements-canonical-debt
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

const UMAG_SERVICE = 'src/services/umagSettlementsService.js'
const DEBT_SERVICE = 'src/services/supplierDebtService.js'
const RECON_SERVICE = 'src/services/supplierReconciliationService.js'
const PANEL = 'src/components/suppliers/settlements/UmagSettlementsPanel.jsx'
const OBLIGATIONS_UTIL = 'src/utils/supplierPaymentObligations.js'

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
  console.log('=== Settlements canonical debt verification (Этап 2.5) ===\n')

  const umagSrc = read(UMAG_SERVICE)
  const debtSrc = read(DEBT_SERVICE)
  const reconSrc = read(RECON_SERVICE)
  const panelSrc = read(PANEL)

  // --- 1. Old formula gone: no ledger, no SUM(debt)-for-period fallback ---
  assert.doesNotMatch(
    umagSrc,
    /history\.operations\.length > 0 \? history\.closingBalance : row\.debt/
  )
  assert.doesNotMatch(umagSrc, /row\.debt \+= toNumber\(supply\.debt\)/)
  const ensureRowBody = umagSrc.slice(
    umagSrc.indexOf('function ensureSettlementRow'),
    umagSrc.indexOf('function resolveRowCanonicalDebt')
  )
  assert.doesNotMatch(ensureRowBody, /\bdebt: 0,/)
  ok('the old "closing balance if ledger present, else SUM(supply.debt)" fallback is gone from ensureSettlementRow/the supply loop/the final row builder')

  assert.match(umagSrc, /ledgerClosingBalance: history\.closingBalance,/)
  ok('ledger closing balance is kept under its own name (ledgerClosingBalance) — audit trail only, never written into the debt field (item 11)')

  // --- 2. New source: canonical, bulk, imported from supplierDebtService ---
  assert.match(umagSrc, /import \{\s*\n\s*fetchCanonicalSupplierDebts,\s*\n\s*resolvePlatformSupplierIdsByUmagIds,\s*\n\s*\} from '\.\/supplierDebtService'/)
  ok('umagSettlementsService.js imports the canonical batch helpers from supplierDebtService.js — not a 4th independent formula')

  assert.match(umagSrc, /export function resolveRowCanonicalDebt\(row, resolvedPlatformIdByUmagId, canonicalDebtByPlatformId\)/)
  assert.match(umagSrc, /const debt = resolveRowCanonicalDebt\(row, resolvedPlatformIdByUmagId, canonicalDebtByPlatformId\)/)
  ok('each row\'s debt comes from resolveRowCanonicalDebt(), which takes no date/period argument at all — period-independence by construction (Case 1/2)')

  // --- 3. supplierDebtService.js: one predicate for single AND bulk --------
  assert.match(debtSrc, /async function fetchOpenObligationRows\(/)
  const singleUsesShared = /const rows = await fetchOpenObligationRows\(\[canonicalId\]\)/.test(debtSrc)
  const bulkUsesShared = /const rows = await fetchOpenObligationRows\(/.test(
    debtSrc.slice(debtSrc.indexOf('export async function fetchCanonicalSupplierDebts'))
  )
  assert.ok(singleUsesShared && bulkUsesShared, 'single-supplier and bulk debt lookups must share one query builder')
  ok('fetchCanonicalSupplierDebt() (single) and fetchCanonicalSupplierDebts() (bulk) both call the same fetchOpenObligationRows() — one predicate, item 4')

  assert.match(debtSrc, /export async function fetchCanonicalSupplierDebts\(\{ platformSupplierIds \} = \{\}\)/)
  assert.doesNotMatch(debtSrc, /for\s*\(.*platformSupplierIds.*\)\s*\{[\s\S]{0,120}await/i)
  ok('fetchCanonicalSupplierDebts() takes a batch of ids and issues one query, never one query per id')

  // --- 4. Bulk wiring in the settlements service: exactly one call each ----
  const resolveCallCount = (umagSrc.match(/resolvePlatformSupplierIdsByUmagIds\(/g) || []).length
  const debtsCallCount = (umagSrc.match(/fetchCanonicalSupplierDebts\(\{ platformSupplierIds: canonicalIds \}\)/g) || []).length
  assert.equal(resolveCallCount, 1, 'resolvePlatformSupplierIdsByUmagIds must be called exactly once per fetchUmagSettlementsBySupplier() call')
  assert.equal(debtsCallCount, 1, 'fetchCanonicalSupplierDebts must be called exactly once per fetchUmagSettlementsBySupplier() call')
  assert.doesNotMatch(umagSrc, /rowsList\.map\([\s\S]{0,80}(resolvePlatformSupplierIdsByUmagIds|fetchCanonicalSupplierDebts)\(/)
  ok('Case 11: exactly one resolve query + one debt query for the whole table — no query inside the per-row .map() (no N+1)')

  // --- 5. Unmatched rows: null, never masked as 0 or someone else's debt --
  assert.match(umagSrc, /canonicalSupplierId != null \? canonicalDebtByPlatformId\.get\(canonicalSupplierId\) \?\? 0 : null/)
  ok('a row with a resolvable canonical supplier but zero open obligations gets a real 0; a row with NO canonical supplier at all gets null (never conflated)')

  const bulkDebtsSrc = debtSrc.slice(debtSrc.indexOf('export async function fetchCanonicalSupplierDebts'))
  assert.match(bulkDebtsSrc, /if \(!row\.platform_supplier_id\) continue/)
  ok('fetchCanonicalSupplierDebts() drops rows with platform_supplier_id=NULL from the map instead of bucketing them under one shared key — prevents cross-supplier debt bleed (item 9)')

  // --- 6. Merged suppliers: same canonical link umag-sync itself uses ------
  assert.match(debtSrc, /\.eq\('is_merged', false\)/)
  ok('resolvePlatformSupplierIdsByUmagIds() excludes merged duplicate platform_suppliers rows — same link as loadPlatformSupplierMap() in umag-sync, not new matching logic')

  // --- 7. Error semantics: no silent fallback on a failed debt query -------
  const debtBlockStart = umagSrc.indexOf('const rowsList = [...byKey.values()]')
  const debtBlockEnd = umagSrc.indexOf('let rows = rowsList.map(')
  const debtBlock = umagSrc.slice(debtBlockStart, debtBlockEnd)
  assert.match(debtBlock, /catch \(err\) \{\s*\n\s*return \{\s*\n\s*rows: \[\],\s*\n\s*totals: emptyTotals\(\),/)
  ok('Case 10: a failed canonical-debt bulk fetch returns the same {rows:[], totals:emptyTotals(), error} shape as the existing supplies/returns failures — never a fallback to ledger or SUM(debt)')

  assert.doesNotMatch(debtBlock, /closingBalance|SUM\(/i)
  ok('the error path has no reference to ledger/SUM — nothing to silently fall back to')

  // --- 8. Totals row: guarded against NaN from an unresolved row, documented ---
  assert.match(umagSrc, /acc\.debt \+= toNumber\(row\.debt\)/)
  ok("total row sums the visible rows' canonical debt (toNumber guards a null unresolved row from becoming NaN) — a per-page total of shown suppliers, not necessarily the global company debt (item 7)")

  // --- 9. Period-scoped fields untouched (Case 9) ---------------------------
  assert.match(umagSrc, /row\.amount \+= toNumber\(supply\.amount\)/)
  assert.match(umagSrc, /row\.returnAmount \+= Math\.abs\(toNumber\(ret\.amount\)\)/)
  assert.match(umagSrc, /paidFromDocuments > 0 \? paidFromDocuments : row\.paymentAmount/)
  assert.match(umagSrc, /\.gte\('doc_time', fromIso\)\s*\n\s*\.lte\('doc_time', toIso\)/)
  ok('receipts/returns/paid still accumulate from the period-scoped supplies/returns/payments queries — untouched by the debt change')

  // --- 10. Acts of reconciliation untouched (Case 12) -----------------------
  assert.match(reconSrc, /snapshot\.umagDebt = canonicalDebt\.debt/)
  assert.match(reconSrc, /fetchCanonicalSupplierDebt\(\{ platformSupplierId: canonicalId, umagSupplierId \}\)/)
  ok('Case 12: computeUmagSnapshotForSupplier() still calls the single-supplier fetchCanonicalSupplierDebt() unchanged')

  // --- 11. Financial Summary / sync scope / sync lock untouched ------------
  const summarySrc = read('src/services/supplierFinanceSummaryService.js')
  assert.match(summarySrc, /debt: view\.summaries\.totalActiveDebt/)
  ok('Этап 2.4 Financial Summary formula sentinel intact')

  const edgeFn = read('supabase/functions/umag-sync/index.ts')
  assert.match(edgeFn, /MAX_AUTO_SYNC_LOOKBACK_MONTHS/)
  assert.match(edgeFn, /umag_sync_runs_entity_running_lock/)
  ok('Этап 2.2 sync-scope / Этап 2.3 sync-lock sentinels intact')

  assert.doesNotMatch(umagSrc, /reconciliation_flag|ledger_delta/i)
  ok('no ledger-vs-canonical reconciliation flag added (item 19)')

  // --- 12. UI: label rename only, no layout/CSS/route change ---------------
  assert.match(panelSrc, /label="Текущий долг"/)
  const labelCount = (panelSrc.match(/label="Текущий долг"/g) || []).length
  const thCount = (panelSrc.match(/<th>Текущий долг<\/th>/g) || []).length
  const spanCount = (panelSrc.match(/<span>Текущий долг<\/span>/g) || []).length
  assert.equal(labelCount + thCount + spanCount, 5, 'expected all 5 debt-value labels renamed')
  assert.doesNotMatch(panelSrc, />Задолженность</)
  ok('debt-value labels renamed "Задолженность" → "Текущий долг" everywhere it appears — no other text/labels touched')

  const cssStatus = execFileSync(
    'git',
    ['status', '--porcelain', '--', 'src/components/suppliers/settlements/UmagSettlementsPanel.css'],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim()
  assert.equal(cssStatus, '', 'CSS changed — this stage must be text/data-source only')
  ok('no CSS/layout change to the settlements panel')

  // App.jsx is checked separately below (not for zero diff): Этап 2.7 adds a
  // new, additive, hidden /platform/supplier-finance route there, which is
  // legitimate UI work from a later stage — the invariant that still matters
  // is that the pre-existing settlements/supplier-payments routes are not
  // removed or altered.
  const routeStatus = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      'src/pages/platform/settlements',
      'src/pages/platform/supplier-payments',
      'src/platform/platformNav.js',
      'src/components/suppliers/settlements/SettlementsFilterPopover.jsx',
      'src/components/suppliers/settlements/CreateReconciliationModal.jsx',
      'src/components/suppliers/settlements/ReconciliationDetailView.jsx',
      'src/components/suppliers/settlements/OperationDetailSheet.jsx',
    ],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim()
  assert.equal(routeStatus, '', `unexpected route/menu/other-component changes: ${routeStatus}`)
  ok('no routes/menu/filter-popover/reconciliation-modal/detail-sheet changes — only the debt source + label in the main panel')

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
    '\nNOTE: fetchCanonicalSupplierDebts()/resolvePlatformSupplierIdsByUmagIds()/\n' +
      'fetchUmagSettlementsBySupplier() themselves need a live Supabase connection,\n' +
      'unavailable in this environment (no .env.local). resolveRowCanonicalDebt() —\n' +
      'the pure row-level composition Cases 1-9 exercise below — and\n' +
      'isActiveOpenObligation() were imported for real, not mirrored.'
  )
}

async function runRealCases() {
  const umagModule = await load(UMAG_SERVICE)
  const { resolveRowCanonicalDebt } = umagModule

  const obligationsUtil = await load(OBLIGATIONS_UTIL)
  const { isActiveOpenObligation } = obligationsUtil

  function mirrorOk(name) {
    checks += 1
    console.log(`  ✓ ${name}`)
  }

  // Case 1 — old (June) receiving's canonical debt shows up in an August table row.
  {
    const row = { platformSupplierId: 's-june', umagSupplierId: null }
    const debtMap = new Map([['s-june', 100000]])
    const debt = resolveRowCanonicalDebt(row, new Map(), debtMap)
    assert.equal(debt, 100000)
    mirrorOk('Case 1: канонический долг июньской приёмки (100000) виден в строке независимо от VIEW PERIOD')
  }

  // Case 2 — resolveRowCanonicalDebt takes no period argument at all: calling
  // it with the identical row/maps for "July"/"August"/"3 months" (i.e. no
  // period input exists to vary) always yields the same debt.
  {
    const row = { platformSupplierId: 's-x', umagSupplierId: null }
    const debtMap = new Map([['s-x', 42000]])
    const july = resolveRowCanonicalDebt(row, new Map(), debtMap)
    const august = resolveRowCanonicalDebt(row, new Map(), debtMap)
    const threeMonths = resolveRowCanonicalDebt(row, new Map(), debtMap)
    assert.equal(july, august)
    assert.equal(august, threeMonths)
    assert.equal(resolveRowCanonicalDebt.length, 3, 'resolveRowCanonicalDebt must not accept a period/date parameter')
    mirrorOk('Case 2: смена VIEW PERIOD не может изменить current debt — функция структурно не принимает период')
  }

  // Case 3 — a ledger closing balance (95000) is simply never seen by this
  // function at all; only the canonical map (100000) feeds row.debt.
  {
    const row = { platformSupplierId: 's-ledger-diff', umagSupplierId: null }
    const canonicalDebtMap = new Map([['s-ledger-diff', 100000]])
    const debt = resolveRowCanonicalDebt(row, new Map(), canonicalDebtMap)
    assert.equal(debt, 100000)
    assert.equal(resolveRowCanonicalDebt.toString().includes('ledger'), false)
    mirrorOk('Case 3: canonical debt (100000) побеждает — ledger closing balance (95000) не участвует в вычислении вообще')
  }

  // Case 4 — no ledger events at all: still just the canonical map value,
  // no SUM(debt)-for-period fallback (the function has no such fallback path).
  {
    const row = { platformSupplierId: 's-no-ledger', umagSupplierId: null }
    const debtMap = new Map([['s-no-ledger', 70000]])
    const debt = resolveRowCanonicalDebt(row, new Map(), debtMap)
    assert.equal(debt, 70000)
    mirrorOk('Case 4: нет ledger events — row.debt всё равно = canonical 70000, без отката на старый SUM(debt)')
  }

  // Case 5/6/7 — isActiveOpenObligation filtering that
  // fetchCanonicalSupplierDebts() applies before summing.
  {
    const rows = [
      { currentDebt: 100000, isSourceDeleted: false },
      { currentDebt: 50000, isSourceDeleted: false },
      { currentDebt: 0, isSourceDeleted: false },
    ]
    const sum = rows.filter(isActiveOpenObligation).reduce((s, r) => s + r.currentDebt, 0)
    assert.equal(sum, 150000)
    mirrorOk('Case 5: несколько obligations одного supplier (100000+50000+0) → канонический долг = 150000')

    assert.equal(isActiveOpenObligation({ currentDebt: 100000, isSourceDeleted: true }), false)
    mirrorOk('Case 6: is_source_deleted=true с положительным debt не входит')

    assert.equal(isActiveOpenObligation({ currentDebt: 0, isSourceDeleted: false }), false)
    assert.equal(isActiveOpenObligation({ currentDebt: -10, isSourceDeleted: false }), false)
    mirrorOk('Case 7: current_debt <= 0 не входит')
  }

  // Case 8 — merged supplier: two settlement rows keyed differently (one by
  // platformSupplierId directly, one only known via a since-resolved
  // umagSupplierId) both converge on the SAME canonical debt.
  {
    const resolvedMap = new Map([[555, 's-canonical']]) // umagSupplierId 555 -> canonical id
    const canonicalDebtMap = new Map([['s-canonical', 180000]]) // aggregated across merged UMAG records
    const rowDirect = { platformSupplierId: 's-canonical', umagSupplierId: null }
    const rowViaMerge = { platformSupplierId: null, umagSupplierId: 555 }
    const debtDirect = resolveRowCanonicalDebt(rowDirect, resolvedMap, canonicalDebtMap)
    const debtViaMerge = resolveRowCanonicalDebt(rowViaMerge, resolvedMap, canonicalDebtMap)
    assert.equal(debtDirect, 180000)
    assert.equal(debtViaMerge, 180000)
    mirrorOk('Case 8: merged supplier — строка, известная только по старому umagSupplierId, сходится к тому же каноническому долгу (180000), что и строка с прямым platformSupplierId')
  }

  // Case 9 — truly unresolved row: neither a direct platformSupplierId nor a
  // resolvable umagSupplierId link. Must be null, never 0, never someone
  // else's total.
  {
    const row = { platformSupplierId: null, umagSupplierId: 999 }
    const resolvedMap = new Map() // 999 not present — genuinely unmapped
    const canonicalDebtMap = new Map([['s-other', 500000]])
    const debt = resolveRowCanonicalDebt(row, resolvedMap, canonicalDebtMap)
    assert.equal(debt, null)
    mirrorOk('несопоставленная строка (item 9): debt = null, не 0 и не чужие 500000')
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`)
  process.exit(1)
})
