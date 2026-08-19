#!/usr/bin/env node
/**
 * Verification for Этап 2.1 — canonical current supplier debt.
 *
 * Checks that:
 *   - a single reusable helper (fetchCanonicalSupplierDebt) computes the
 *     canonical debt from supplier_payment_obligations, with no date filter;
 *   - the acts-of-reconciliation snapshot reuses that helper instead of
 *     re-deriving SUM(umag_supplies.debt) inline (no 4th formula);
 *   - the underlying open-obligation predicate is shared with the existing
 *     "Оплаты поставщикам" dashboard logic (src/utils/supplierPaymentObligations.js);
 *   - existing acts (updateDraftReconciliation / resolveReconciliation) never
 *     recompute umag_debt;
 *   - unmapped-supplier lookups fail loudly instead of silently returning 0.
 *
 * Usage:
 *   npm run verify:canonical-supplier-debt
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'node:child_process'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const DEBT_SERVICE = 'src/services/supplierDebtService.js'
const RECON_SERVICE = 'src/services/supplierReconciliationService.js'
const CREATE_MODAL = 'src/components/suppliers/settlements/CreateReconciliationModal.jsx'
const OBLIGATIONS_UTIL = 'src/utils/supplierPaymentObligations.js'

let checks = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  if (!condition) fail(`${name}${detail ? ` — ${detail}` : ''}`)
  checks += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) fail(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}

async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href)
}

async function main() {
  console.log('=== Canonical supplier debt verification (Этап 2.1) ===\n')

  // --- 1. Stage 2.1's own migration for canonical debt is not present -----
  // Этап 2.1 itself shipped with zero schema changes (this table already had
  // everything it needed). Later stages may legitimately add their own
  // migrations elsewhere (e.g. Этап 2.3's sync lock, checked by
  // verify:umag-sync-lock) — this only checks that Этап 2.1 didn't invent
  // a supplier_payment_obligations/debt-formula migration of its own.
  const debtMigrations = execFileSync(
    'git',
    ['ls-files', '--', 'supabase/migrations/*debt*.sql', 'supabase/migrations/*canonical*.sql'],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim()
  assert(
    'no supplier-debt-formula migration exists — Этап 2.1 shipped without a schema migration',
    debtMigrations === '',
    `unexpected migration file(s): ${debtMigrations}`
  )

  // --- 2. supplierDebtService.js: formula shape ----------------------------
  const debtService = read(DEBT_SERVICE)
  assert(
    'debt helper reads supplier_payment_obligations',
    /from\('supplier_payment_obligations'\)/.test(debtService)
  )
  assert(
    'debt helper filters is_source_deleted = false',
    /\.eq\('is_source_deleted',\s*false\)/.test(debtService)
  )
  assert(
    'debt helper filters current_debt > 0',
    /\.gt\('current_debt',\s*0\)/.test(debtService)
  )
  assert(
    'debt helper has NO date-range filter (period-independent by construction)',
    !/\.(gte|lte)\(\s*'(doc_time|document_time|payment_time|due_date|created_at)'/.test(
      debtService
    )
  )
  assert(
    'debt helper reuses the existing open-obligation predicate, not a new inline one',
    /isActiveOpenObligation/.test(debtService) &&
      /from '\.\.\/utils\/supplierPaymentObligations'/.test(debtService)
  )
  assert(
    'unmapped UMAG-only supplier throws a typed error instead of silently returning 0',
    /class UnresolvedSupplierDebtError extends Error/.test(debtService) &&
      /throw new UnresolvedSupplierDebtError\(umagSupplierId\)/.test(debtService)
  )
  assert(
    // Этап 2.5 batched the single lookup into resolvePlatformSupplierIdsByUmagIds()
    // (.in() instead of a lone .eq()) — same canonical link, now shared with the
    // bulk path, per Этап 2.5 item 4. Not name matching either way.
    'unmapped-supplier resolution reuses the existing canonical link (platform_suppliers.umag_supplier_id, is_merged=false) — not name matching',
    /from\('platform_suppliers'\)/.test(debtService) &&
      /\.in\('umag_supplier_id',\s*ids\)/.test(debtService) &&
      /\.eq\('is_merged',\s*false\)/.test(debtService) &&
      !/ilike|\.eq\('name'/.test(debtService)
  )

  // --- 3. supplierReconciliationService.js: reuses the helper, no 4th formula --
  const reconService = read(RECON_SERVICE)
  assert(
    'reconciliation service imports fetchCanonicalSupplierDebt (reuse, not duplication)',
    /import \{ fetchCanonicalSupplierDebt \} from '\.\/supplierDebtService'/.test(reconService)
  )
  assert(
    'computeUmagSnapshotForSupplier no longer sums umag_supplies.debt inline',
    !/snapshot\.umagDebt\s*\+=/.test(reconService) &&
      !/\.select\('amount, payment_amount, payment_refund_amount, debt'\)/.test(reconService)
  )
  assert(
    'computeUmagSnapshotForSupplier assigns umagDebt from the canonical helper result',
    /snapshot\.umagDebt = canonicalDebt\.debt/.test(reconService)
  )
  assert(
    'canonical debt call passes only supplier identity, NOT dateFrom/dateTo — proves period-independence',
    /fetchCanonicalSupplierDebt\(\{\s*platformSupplierId:\s*canonicalId,\s*umagSupplierId\s*\}\)/.test(
      reconService
    )
  )
  assert(
    'existing supplier matching (platformSupplierId || supplierId, umagSupplierId fallback) preserved',
    /const canonicalId = platformSupplierId \|\| supplierId/.test(reconService)
  )
  assert(
    'updateDraftReconciliation does not recompute umag_debt (old acts stay frozen)',
    (() => {
      const start = reconService.indexOf('export async function updateDraftReconciliation')
      const end = reconService.indexOf('\nexport async function', start + 1)
      const body = reconService.slice(start, end === -1 ? undefined : end)
      return (
        !body.includes('computeUmagSnapshotForSupplier') &&
        !body.includes('fetchCanonicalSupplierDebt') &&
        !/umag_debt\s*:/.test(body)
      )
    })()
  )
  assert(
    'resolveReconciliation does not recompute umag_debt (old acts stay frozen)',
    (() => {
      const start = reconService.indexOf('export async function resolveReconciliation')
      const end = reconService.indexOf('\nexport async function', start + 1)
      const body = reconService.slice(start, end === -1 ? undefined : end)
      return (
        !body.includes('computeUmagSnapshotForSupplier') &&
        !body.includes('fetchCanonicalSupplierDebt') &&
        !/umag_debt\s*:/.test(body)
      )
    })()
  )

  // --- 4. Ledger / sync untouched; settlements now uses the SAME canonical helper ---
  const umagService = read('src/services/umagSettlementsService.js')
  assert(
    // Этап 2.5 deliberately replaces this exact fallback expression with the
    // canonical bulk debt lookup — see verify:settlements-canonical-debt for
    // the full depth of that change. What must survive is that it now goes
    // through THIS module's own canonical helper, not a reinvented formula.
    'umagSettlementsService.js (Взаиморасчёты) now sources debt from supplierDebtService — the old ledger/SUM(debt) fallback is gone',
    !/history\.operations\.length > 0 \? history\.closingBalance : row\.debt/.test(umagService) &&
      /from '\.\/supplierDebtService'/.test(umagService) &&
      /fetchCanonicalSupplierDebts/.test(umagService)
  )
  const ledgerUtil = read('src/utils/supplierLedger.js')
  assert(
    'supplierLedger.js (ledger balance math) not touched this stage',
    /case LEDGER_EVENT_TYPES\.SUPPLIER_REFUND:\s*\n\s*return 0/.test(ledgerUtil)
  )
  const edgeFn = read('supabase/functions/umag-sync/index.ts')
  assert(
    // Sync-scope widening (Этап 2.2) legitimately changes how the request's
    // dateFrom/dateTo feed the pipeline — what must NEVER change is the
    // canonical mirror formula itself: current_debt = umag_supplies.debt.
    'refreshPaymentObligations still mirrors current_debt = umag_supplies.debt verbatim (canonical formula untouched)',
    /const debt = asNumber\(supply\.debt\)/.test(edgeFn) && /current_debt: debt,/.test(edgeFn)
  )

  // --- 5. CreateReconciliationModal.jsx: label matches new meaning --------
  const modal = read(CREATE_MODAL)
  assert(
    'create-act hint no longer claims debt = SUM(debt) by period (stale after formula change)',
    !/SUM\(debt\) активных приёмок за период/.test(modal)
  )
  assert(
    'create-act hint now describes debt as current/open, independent of act period',
    /Задолженность — открытый\s*\n?\s*долг поставщику на сегодня/.test(modal) ||
      /долг поставщику на сегодня, не ограничен периодом акта/.test(modal)
  )

  // --- 6. Pure-logic import: shared predicate behaves per ТЗ test cases ---
  const obligationsUtil = await load(OBLIGATIONS_UTIL)
  const { isActiveOpenObligation } = obligationsUtil

  // Case 1 — old (June) open supply counts in "current debt" regardless of when it was created.
  assert(
    'Case 1: обязательство с давней датой документа считается открытым, если current_debt > 0',
    isActiveOpenObligation({
      current_debt: 100000,
      is_source_deleted: false,
      supply_document_date: '2026-06-05',
    }) === true
  )

  // Case 2 — multiple open supplies sum; a zero-debt one contributes nothing.
  const rowsCase2 = [
    { current_debt: 100000, is_source_deleted: false },
    { current_debt: 50000, is_source_deleted: false },
    { current_debt: 0, is_source_deleted: false },
  ]
  const sumCase2 = rowsCase2
    .filter(isActiveOpenObligation)
    .reduce((s, r) => s + r.current_debt, 0)
  assert('Case 2: несколько открытых приёмок суммируются, закрытая (0) не учитывается', sumCase2 === 150000)

  // Case 3 — current_debt <= 0 excluded.
  assert(
    'Case 3: current_debt <= 0 не увеличивает текущую задолженность',
    isActiveOpenObligation({ current_debt: 0, is_source_deleted: false }) === false &&
      isActiveOpenObligation({ current_debt: -10, is_source_deleted: false }) === false
  )

  // Case 4 — soft-deleted excluded even with positive debt.
  assert(
    'Case 4: is_source_deleted = true исключается из суммы, даже если current_debt > 0',
    isActiveOpenObligation({ current_debt: 100000, is_source_deleted: true }) === false
  )

  // --- 7. Guard behaviour of the debt service without live Supabase --------
  const debtServiceModule = await load(DEBT_SERVICE)
  const { fetchCanonicalSupplierDebt, UnresolvedSupplierDebtError } = debtServiceModule
  assert('fetchCanonicalSupplierDebt is exported', typeof fetchCanonicalSupplierDebt === 'function')
  assert(
    'UnresolvedSupplierDebtError is exported and typed',
    typeof UnresolvedSupplierDebtError === 'function' &&
      new UnresolvedSupplierDebtError(42).name === 'UnresolvedSupplierDebtError' &&
      new UnresolvedSupplierDebtError(42).umagSupplierId === 42
  )
  let guardMessage = null
  try {
    await fetchCanonicalSupplierDebt({ platformSupplierId: 'x' })
  } catch (err) {
    guardMessage = err.message
  }
  assert(
    'helper fails closed (no Supabase configured in this harness) instead of returning a silent 0',
    guardMessage === 'Supabase не настроен.'
  )

  console.log(`\n${checks} checks passed`)
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`)
  process.exit(1)
})
