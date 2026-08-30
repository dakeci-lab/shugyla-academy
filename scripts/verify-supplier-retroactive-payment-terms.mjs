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
const SUPPLIERS_PAGE = 'src/pages/platform/suppliers/SuppliersPage.jsx'

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

  // --- Case 1: 0 days -> 14 days recomputes an already-snapshotted row -----
  {
    const oldSnapshot = {
      paymentTermsTypeSnapshot: 'cash',
      defermentDaysSnapshot: 0,
      dueDate: '2026-08-26',
    }
    const newTerms = resolveSupplierPaymentTerms({ paymentType: 'deferral', deferralDays: 14 })
    const patch = resolveObligationTermsPatch(oldSnapshot, newTerms, '2026-08-26')
    assert.ok(patch, 'expected a patch — the exact bug report scenario')
    assert.equal(patch.payment_terms_type_snapshot, 'deferral')
    assert.equal(patch.deferment_days_snapshot, 14)
    assert.equal(patch.due_date, '2026-09-09')
  }
  ok('Case 1: cash/0 (26.08) -> deferral/14 recomputes due_date to 09.09 — the exact «Тассай» scenario')

  // --- Case 2: already matching current terms -> no patch (idempotent) -----
  {
    const snapshot = {
      paymentTermsTypeSnapshot: 'deferral',
      defermentDaysSnapshot: 14,
      dueDate: '2026-09-09',
    }
    const terms = resolveSupplierPaymentTerms({ paymentType: 'deferral', deferralDays: 14 })
    const patch = resolveObligationTermsPatch(snapshot, terms, '2026-08-26')
    assert.equal(patch, null)
  }
  ok('Case 2: snapshot already matches current terms -> no patch (no pointless write / timestamp bump on unrelated saves)')

  // --- Case 3: clearing the supplier's terms resets open obligations too ---
  // (symmetric with Case 1 per the owner's explicit confirmation.)
  {
    const configuredSnapshot = {
      paymentTermsTypeSnapshot: 'deferral',
      defermentDaysSnapshot: 14,
      dueDate: '2026-09-09',
    }
    const unconfiguredTerms = resolveSupplierPaymentTerms({ paymentType: 'deferral', deferralDays: null })
    const patch = resolveObligationTermsPatch(configuredSnapshot, unconfiguredTerms, '2026-08-26')
    assert.ok(patch, 'clearing terms should produce a patch that resets the obligation')
    assert.equal(patch.payment_terms_type_snapshot, null)
    assert.equal(patch.deferment_days_snapshot, null)
    assert.equal(patch.due_date, null)
  }
  ok('Case 3: clearing supplier terms to "не настроено" resets already-configured open obligations back to null (symmetric, per owner confirmation)')

  // --- Case 4: never invents a due date without a document date -----------
  {
    const terms = resolveSupplierPaymentTerms({ paymentType: 'cash' })
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
  assert.match(fnBody, /\.gt\('current_debt', 0\)/)
  assert.doesNotMatch(fnBody, /\.is\('due_date', null\)/)
  assert.match(fnBody, /resolveObligationTermsPatch\(/)
  ok('Case 5: refreshObligationTermsForSupplier scopes to open obligations (is_source_deleted=false, current_debt>0) with no due_date-IS-NULL gate left over')

  assert.doesNotMatch(serviceSrc, /applyMissingObligationSnapshotsForSupplier/)
  ok('Case 5b: old write-once-only function name is gone, not left as dead code alongside the new one')

  // --- Case 6: caller updated ------------------------------------------------
  const pageSrc = read(SUPPLIERS_PAGE)
  assert.match(pageSrc, /refreshObligationTermsForSupplier/)
  assert.doesNotMatch(pageSrc, /applyMissingObligationSnapshotsForSupplier/)
  ok('Case 6: SuppliersPage.jsx calls the renamed function after saving a supplier')

  console.log(`\n${checks} checks passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
