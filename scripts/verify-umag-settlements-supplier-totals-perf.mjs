#!/usr/bin/env node
/**
 * Verification: «Взаиморасчёты» list-load performance fix (2026-09-18).
 *
 * The list used to fetch every raw supply/return/payment document for every
 * supplier for the whole period, just to sum 5 numbers per row (~1500+ rows
 * for ~190 suppliers, measured 5-8s in prod). This splits that into:
 *   - umag_settlements_supplier_totals(): a Postgres GROUP BY aggregate —
 *     the list now fetches ~150-200 small summary rows instead.
 *   - fetchUmagSupplierOperationHistory(): the per-supplier line-item
 *     history, fetched only when that supplier's card is opened (scoped
 *     queries, not "give me everything for the period").
 *
 * The SQL aggregate's logic was validated against live prod data before
 * this script was written (see the session's chat log): compared row-by-row
 * against direct per-supplier queries for two real suppliers — one with
 * supplies in the period, one with only historical native payment marks and
 * zero supplies — both matched exactly on every field.
 *
 * Usage:
 *   npm run verify:umag-settlements-supplier-totals-perf
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

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

const SERVICE = 'src/services/umagSettlementsService.js'
const PANEL = 'src/components/suppliers/settlements/UmagSettlementsPanel.jsx'
const MIGRATION = 'supabase/migrations/20260918140000_umag_settlements_supplier_totals.sql'

function main() {
  console.log('=== UMAG settlements supplier-totals perf verification ===\n')

  const migration = read(MIGRATION)
  const service = read(SERVICE)
  const panel = read(PANEL)

  // --- Migration: the aggregate function itself -----------------------------
  assert.match(migration, /create or replace function public\.umag_settlements_supplier_totals\(/)
  assert.match(migration, /language sql/)
  assert.match(migration, /security invoker/)
  assert.match(migration, /set search_path = ''/)
  ok('umag_settlements_supplier_totals() is a SECURITY INVOKER SQL function with a locked search_path — relies on the same RLS the client already queries these tables under, no privilege escalation')

  assert.match(migration, /revoke all on function public\.umag_settlements_supplier_totals\(date, date\) from public/)
  assert.match(migration, /revoke all on function public\.umag_settlements_supplier_totals\(date, date\) from anon/)
  assert.match(migration, /grant execute on function public\.umag_settlements_supplier_totals\(date, date\) to authenticated/)
  ok('anon has no execute grant; only authenticated (+ service_role) can call it')

  assert.match(migration, /upper\(coalesce\(p\.payment_type, ''\)\) = 'SUPPLY_REFUND' or p\.amount < 0 or p\.class_name = 'SupplyReturn'/)
  ok("refund classification in SQL is byte-identical to isUmagPaymentRefund() (src/utils/supplierLedger.js) — type='SUPPLY_REFUND' or amount<0 or class_name='SupplyReturn'")

  assert.match(
    migration,
    /not exists \(\s*\n\s*select 1 from public\.supplier_payment_obligations spo\s*\n\s*where spo\.umag_supply_id = payments\.linked_umag_supply_id\s*\n\s*and spo\.platform_paid_by is not null\s*\n\s*\)/
  )
  ok('non-refund payments linked to a natively-attributed supply are excluded from document_payment_amount — same attributedSupplyIds rule the client used to apply')

  assert.match(migration, /native_payments as \(/)
  assert.match(migration, /o\.platform_paid_at is not null\s*\n\s*and o\.platform_paid_by is not null/)
  ok('native_payments CTE requires BOTH platform_paid_at and platform_paid_by — the 2026-09-15 mass-backfill batch (no employee attached) is excluded, same as the client-side query')

  assert.match(migration, /coalesce\(\s*\n\s*s\.platform_supplier_id::text,/)
  assert.match(migration, /'name:' \|\| coalesce\(s\.supplier_name, 'Без названия'\)/)
  ok('grouping key falls back platform_supplier_id → umag_supplier_id → name, matching supplierSettlementKey() in the client')

  // --- Service: fast list + lazy per-supplier detail ------------------------
  assert.match(service, /export async function fetchUmagSettlementsSupplierTotals\(/)
  assert.match(service, /supabase\.rpc\('umag_settlements_supplier_totals', \{/)
  ok('fetchUmagSettlementsSupplierTotals() calls the new RPC — one request instead of 4+ paginated table scans')

  assert.match(service, /export async function fetchUmagSupplierOperationHistory\(/)
  assert.match(
    service,
    /function scopeToSupplier\(query\) \{\s*\n\s*return platformSupplierId\s*\n\s*\? query\.eq\('platform_supplier_id', platformSupplierId\)\s*\n\s*: query\.eq\('umag_supplier_id', umagSupplierId\)/
  )
  ok('fetchUmagSupplierOperationHistory() scopes every query to ONE supplier (platform_supplier_id, or umag_supplier_id as fallback) — never re-fetches the whole period for every supplier')

  assert.doesNotMatch(service, /export async function fetchUmagSettlementsBySupplier\(/)
  ok('the old bulk fetchUmagSettlementsBySupplier() (fetched everything for every supplier just to render the list) is deleted, not left as unused dead code')

  assert.match(
    service,
    /paymentAmount: documentPaymentAmount > 0 \? documentPaymentAmount : toNumber\(row\.payment_amount_from_supplies\)/
  )
  ok("the list prefers document/native payment totals over raw umag_supplies.payment_amount — same preference rule as before ('Оплачено' never silently reverts to a less trustworthy source)")

  assert.match(service, /openingBalance: null,\s*\n\s*ledgerClosingBalance: null,\s*\n\s*operations: null,/)
  ok('list rows carry operations/openingBalance as null (never a stale/eager value) — UmagSupplierDetail must fetch them itself, not assume they are already populated')

  // --- Panel: list uses the fast fetch; detail fetches its own history ------
  assert.match(panel, /fetchUmagSettlementsSupplierTotals\(\{ dateFrom, dateTo, search \}\)/)
  assert.doesNotMatch(panel, /fetchUmagSettlementsBySupplier/)
  ok('loadData() (the list) calls fetchUmagSettlementsSupplierTotals(), not the old bulk function')

  const detailFn = panel.slice(
    panel.indexOf('function UmagSupplierDetail('),
    panel.indexOf('function UmagSettlementsPanel(') > -1
      ? panel.indexOf('return (\n    <div className="umag-settlements umag-settlements--detail">')
      : panel.length
  )
  assert.match(detailFn, /useEffect\(\(\) => \{/)
  assert.match(detailFn, /fetchUmagSupplierOperationHistory\(\{/)
  assert.match(detailFn, /platformSupplierId: supplier\.platformSupplierId,/)
  assert.match(detailFn, /umagSupplierId: supplier\.umagSupplierId,/)
  ok('UmagSupplierDetail fetches its own history in a useEffect keyed on the supplier — the «second level» load the owner asked for, not eager on the list')

  assert.match(panel, /\[supplier\.platformSupplierId, supplier\.umagSupplierId, dateFrom, dateTo\]/)
  ok('the detail fetch re-runs when the opened supplier OR the period changes — never serves stale history for a different supplier/period')

  assert.match(panel, /detailLoading \? \(\s*\n\s*<DelayedLoadingSkeleton/)
  ok('a loading skeleton covers the gap while the per-supplier history is being fetched — no flash of an empty "no operations" state')

  assert.match(panel, /<UmagSupplierDetail\s*\n\s*supplier=\{selected\}\s*\n\s*dateFrom=\{dateFrom\}\s*\n\s*dateTo=\{dateTo\}/)
  ok('dateFrom/dateTo are threaded into UmagSupplierDetail — the lazy detail fetch uses the currently active period, not a hardcoded one')

  console.log(`\n${checks} checks passed`)
}

main()
