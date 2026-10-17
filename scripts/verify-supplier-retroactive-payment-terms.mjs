#!/usr/bin/env node
/**
 * Verification — editing a supplier's payment terms retroactively recomputes
 * due_date for that supplier's still-open obligations, not just future ones.
 *
 * Bug this fixes: `supplier_payment_obligations.due_date` was write-once
 * ("Immutable after first set" per the table comment) with no path to ever
 * refresh it — an obligation synced under old terms (e.g. cash/0 days) kept
 * that due date forever even after the supplier's card was edited to a
 * 14-day deferral, silently disagreeing with the success toast that claimed
 * "Сроки обязательств обновлены." Root cause: applyMissingObligationSnapshotsForSupplier
 * only ever targeted rows with due_date IS NULL.
 *
 * Real (not mirrored) import of resolveObligationTermsPatch — the pure
 * decision function — via extensionlessResolver. The Supabase-calling
 * wrapper (refreshObligationTermsForSupplier) needs a live connection,
 * unavailable here; verified structurally instead.
 *
 * Usage:
 *   npm run verify:supplier-retroactive-payment-terms
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

const OBLIGATIONS_UTILS = 'src/utils/supplierPaymentObligations.js'
const SERVICE = 'src/services/supplierPaymentObligationsService.js'
const SUPPLIERS_PAGE = 'src/components/suppliers/settlements/UmagSettlementsPanel.jsx'

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

async function main() {
  console.log('=== Supplier retroactive payment-terms verification ===\n')

  const { resolveObligationTermsPatch, resolveSupplierPaymentTerms } = await import(
    pathToFileURL(path.join(ROOT, OBLIGATIONS_UTILS)).href
  )

  // Payment terms are now two independent axes: the payment account (способ оплаты) and the
  // deferral days (срок). due_date depends only on the days; the account snapshot follows the supplier.
  const ACCOUNT = '1fcc6c24-0387-4e69-ba4c-b26d70343849'

  // --- Case 1: 0 days -> 14 days recomputes an already-snapshotted row -----
  {
    const oldSnapshot = {
      paymentAccountIdSnapshot: ACCOUNT,
      defermentDaysSnapshot: 0,
      dueDate: '2026-08-26',
    }
    const newTerms = resolveSupplierPaymentTerms({ paymentAccountId: ACCOUNT, deferralDays: 14 })
    const patch = resolveObligationTermsPatch(oldSnapshot, newTerms, '2026-08-26')
    assert.ok(patch, 'expected a patch — the exact bug report scenario')
    assert.equal(patch.payment_account_id_snapshot, ACCOUNT)
    assert.equal(patch.deferment_days_snapshot, 14)
    assert.equal(patch.due_date, '2026-09-09')
  }
  ok('Case 1: days 0 (26.08) -> 14 recomputes due_date to 09.09 — the exact «Тассай» scenario')

  // --- Case 2: already matching current terms -> no patch (idempotent) -----
  {
    const snapshot = {
      paymentAccountIdSnapshot: ACCOUNT,
      defermentDaysSnapshot: 14,
      dueDate: '2026-09-09',
    }
    const terms = resolveSupplierPaymentTerms({ paymentAccountId: ACCOUNT, deferralDays: 14 })
    const patch = resolveObligationTermsPatch(snapshot, terms, '2026-08-26')
    assert.equal(patch, null)
  }
  ok('Case 2: snapshot already matches current terms -> no patch (no pointless write / timestamp bump on unrelated saves)')

  // --- Case 2b: changing only the payment account keeps the due date ------
  {
    const snapshot = { paymentAccountIdSnapshot: ACCOUNT, defermentDaysSnapshot: 14, dueDate: '2026-09-09' }
    const terms = resolveSupplierPaymentTerms({ paymentAccountId: 'other-account', deferralDays: 14 })
    const patch = resolveObligationTermsPatch(snapshot, terms, '2026-08-26')
    assert.ok(patch)
    assert.equal(patch.payment_account_id_snapshot, 'other-account')
    assert.equal(patch.due_date, '2026-09-09')
  }
  ok('Case 2b: changing only the payment account updates the account snapshot and leaves due_date untouched')

  // --- Case 3: clearing the supplier's days resets open obligations too ----
  // (symmetric with Case 1 per the owner's explicit confirmation; the account is an independent axis.)
  {
    const configuredSnapshot = {
      paymentAccountIdSnapshot: ACCOUNT,
      defermentDaysSnapshot: 14,
      dueDate: '2026-09-09',
    }
    const unconfiguredTerms = resolveSupplierPaymentTerms({ paymentAccountId: ACCOUNT, deferralDays: null })
    const patch = resolveObligationTermsPatch(configuredSnapshot, unconfiguredTerms, '2026-08-26')
    assert.ok(patch, 'clearing days should produce a patch that resets the obligation')
    assert.equal(patch.payment_account_id_snapshot, ACCOUNT)
    assert.equal(patch.deferment_days_snapshot, null)
    assert.equal(patch.due_date, null)
  }
  ok('Case 3: clearing supplier days resets already-configured open obligations to null due_date (account snapshot stays)')

  // --- Case 4: never invents a due date without a document date -----------
  {
    const terms = resolveSupplierPaymentTerms({ paymentAccountId: ACCOUNT, deferralDays: 0 })
    const patch = resolveObligationTermsPatch(null, terms, null)
    assert.ok(patch)
    assert.equal(patch.due_date, null)
  }
  ok('Case 4: missing document date never produces a fabricated due_date, even when terms are configured')

  // --- Case 5: service layer scoped to open obligations, no more NULL gate -
  const serviceSrc = read(SERVICE)
  assert.match(serviceSrc, /export async function refreshObligationTermsForSupplier/)
  const fnBody = serviceSrc.slice(
    serviceSrc.indexOf('export async function refreshObligationTermsForSupplier'),
    serviceSrc.indexOf('\n}', serviceSrc.indexOf('export async function refreshObligationTermsForSupplier')) + 2
  )
  assert.match(fnBody, /\.eq\('is_source_deleted', false\)/)
  // Open = not natively marked paid (UMAG current_debt is not authoritative since 2026-09-15).
  assert.match(fnBody, /\.is\('platform_paid_at', null\)/)
  assert.doesNotMatch(fnBody, /\.gt\('current_debt', 0\)/)
  assert.doesNotMatch(fnBody, /\.is\('due_date', null\)/)
  assert.match(fnBody, /resolveObligationTermsPatch\(/)
  ok('Case 5: refreshObligationTermsForSupplier scopes to open obligations (is_source_deleted=false, platform_paid_at IS NULL) with no due_date-IS-NULL gate left over')

  assert.doesNotMatch(serviceSrc, /applyMissingObligationSnapshotsForSupplier/)
  ok('Case 5b: old write-once-only function name is gone, not left as dead code alongside the new one')

  // --- Case 6: caller updated ------------------------------------------------
  const pageSrc = read(SUPPLIERS_PAGE)
  assert.match(pageSrc, /refreshObligationTermsForSupplier/)
  assert.doesNotMatch(pageSrc, /applyMissingObligationSnapshotsForSupplier/)
  ok('Case 6: the suppliers panel calls the function after saving a supplier')

  console.log(`\n${checks} checks passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
