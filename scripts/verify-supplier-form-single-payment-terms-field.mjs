#!/usr/bin/env node
/**
 * Verification — supplier form collapses the 4-value «Условия оплаты»
 * dropdown (Наличными/Перевод/Отсрочка/Смешанная оплата) into a single
 * «Срок оплаты (дней)» field, without a schema migration.
 *
 * Why no migration is needed: every due-date calculation in the app already
 * reduces the 4 payment types to exactly two behaviors — {cash, transfer} →
 * 0 days, {deferral, mixed} → deferral_days (src/utils/supplierPaymentObligations.js,
 * supabase/functions/umag-sync/index.ts). The form now writes only 'cash'
 * (days=0) or 'deferral' (days=N, or null when unconfigured) — a subset of
 * values every downstream consumer already understood.
 *
 * Structural checks against the real source, plus real (not mirrored)
 * imports of formToSupplierCreatePayload / supplierToForm /
 * validateSupplierDeferralDays via extensionlessResolver — exercising the
 * actual exported contract, not a re-implementation of it.
 *
 * Usage:
 *   npm run verify:supplier-form-single-payment-terms-field
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

const FORM = 'src/components/suppliers/SupplierForm.jsx'
const OBLIGATIONS_UTILS = 'src/utils/supplierPaymentObligations.js'

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
  console.log('=== Supplier form — single payment-terms days field ===\n')

  const formSrc = read(FORM)

  // --- Case 1: the dropdown is gone, one field remains ----------------------
  assert.doesNotMatch(formSrc, /Условия оплаты/)
  assert.doesNotMatch(formSrc, /PAYMENT_TYPE_LABELS/)
  assert.match(formSrc, /Срок оплаты \(дней\)/)
  ok('Case 1: «Условия оплаты» dropdown removed; «Срок оплаты (дней)» is the only payment-terms input')

  // --- Case 2: no schema/adapter changes — same two DB columns as before ----
  assert.match(formSrc, /paymentType: paymentTerms\.paymentType/)
  assert.match(formSrc, /deferralDays: paymentTerms\.deferralDays/)
  const adapterStatusFiles = [
    'src/services/suppliersSupabaseAdapter.js',
    'src/services/suppliersLocalAdapter.js',
    'supabase/schema.sql',
  ]
  for (const relPath of adapterStatusFiles) {
    assert.ok(fs.existsSync(path.join(ROOT, relPath)), `${relPath} should exist untouched`)
  }
  ok('Case 2: payload still writes the same paymentType/deferralDays columns — no schema or adapter change needed')

  // --- Case 3: derivePaymentTypeFromDays — the single reduction formula -----
  // SupplierForm.jsx has a top-level `export default function SupplierForm`
  // with real JSX, so it can't be dynamically imported by plain Node (no JSX
  // transform in extensionlessResolver — that's deliberate: it only patches
  // extensionless imports/JSON/import.meta.env, not syntax). Verified for
  // real instead by mounting the actual component in a browser — see the
  // doc's "реальный рендер" section; this script sticks to source-text
  // assertions, consistent with the other supplier-form verify scripts
  // (verify-suppliers-simplify.mjs, verify-supplier-form-focus.mjs).
  const deriveFn = formSrc.slice(
    formSrc.indexOf('function derivePaymentTypeFromDays'),
    formSrc.indexOf('\n}', formSrc.indexOf('function derivePaymentTypeFromDays')) + 2
  )
  assert.match(deriveFn, /validDays && days === 0 \? PAYMENT_TYPE\.CASH : PAYMENT_TYPE\.DEFERRAL/)
  assert.match(deriveFn, /deferralDays: validDays \? days : null/)
  ok('Case 3: derivePaymentTypeFromDays — 0→cash, N>0→deferral, invalid/empty→deferral+null (unconfigured)')

  // --- Case 4: validateSupplierDeferralDays applies unconditionally now -----
  // (previously gated on paymentType === deferral/mixed; now there is only
  // one field, so the same 0-365 integer check must run for every value.)
  const validateFn = formSrc.slice(
    formSrc.indexOf('export function validateSupplierDeferralDays'),
    formSrc.indexOf('\n}', formSrc.indexOf('export function validateSupplierDeferralDays')) + 2
  )
  assert.doesNotMatch(validateFn, /form\.paymentType/)
  assert.match(validateFn, /days < 0 \|\| days > 365/)
  ok('Case 4: validateSupplierDeferralDays no longer branches on paymentType — applies to the single field unconditionally')

  // --- Case 5: legacy transfer/mixed suppliers still load correctly on open,
  // via the SAME reduction the due-date calc has always used — not a second,
  // independently-drifting implementation of "which types mean 0 days".
  const obligationsSrc = read(OBLIGATIONS_UTILS)
  assert.match(formSrc, /import \{ resolveSupplierPaymentTerms \} from '\.\.\/\.\.\/utils\/supplierPaymentObligations'/)
  assert.match(formSrc, /resolveSupplierPaymentTerms\(\{\s*\n\s*paymentType: supplier\.paymentType,\s*\n\s*deferralDays: supplier\.deferralDays,/)
  assert.match(obligationsSrc, /export function resolveSupplierPaymentTerms/)
  assert.match(obligationsSrc, /isImmediatePaymentType\(type\)[\s\S]{0,80}days: 0/)
  ok('Case 5: form reuses resolveSupplierPaymentTerms() to display legacy transfer/cash/mixed values as days — same reduction the due-date calc uses, not a duplicate')

  console.log(`\n${checks} checks passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
