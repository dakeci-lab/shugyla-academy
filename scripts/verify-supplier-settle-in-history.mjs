#!/usr/bin/env node
/**
 * Verification — pay supplies / mark returns received right in the supplier
 * card's operation history («Поставщики»). Real modules via the extensionless
 * resolver; only Supabase I/O is out of reach here.
 *
 * Usage:
 *   npm run verify:supplier-settle-in-history
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

let checks = 0
function ok(name) {
  checks += 1
  console.log(`  ✓ ${name}`)
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const { buildSupplierOperationHistory, filterSupplierOperations } = await import(
  pathToFileURL(path.join(ROOT, 'src/services/umagSettlementsService.js')).href
)

const supplies = [
  {
    id: 's1', umag_supply_id: 101, doc_time: '2026-10-20T10:00:00+05:00', amount: 40000, payment_amount: 40000, debt: 0,
    obligation: { id: 'o1', is_source_deleted: false, platform_paid_at: null, original_supply_amount: 40000 },
  },
  {
    id: 's2', umag_supply_id: 102, doc_time: '2026-10-18T10:00:00+05:00', amount: 10000, payment_amount: 10000, debt: 0,
    obligation: { id: 'o2', is_source_deleted: false, platform_paid_at: '2026-10-19T09:00:00Z', original_supply_amount: 10000 },
  },
  { id: 's3', umag_supply_id: 103, doc_time: '2026-10-17T10:00:00+05:00', amount: 500, payment_amount: 0, debt: 500 }, // no obligation row
  {
    id: 's4', umag_supply_id: 104, doc_time: '2026-10-16T10:00:00+05:00', amount: 700, payment_amount: 0, debt: 0,
    obligation: { id: 'o4', is_source_deleted: true, platform_paid_at: null, original_supply_amount: 700 },
  },
]
const returns = [
  { id: 'r1', umag_return_id: 201, document_time: '2026-10-21T10:00:00+05:00', amount: 5000, payed_amount: 5000, platform_refunded_at: null },
  { id: 'r2', umag_return_id: 202, document_time: '2026-10-01T10:00:00+05:00', amount: 3000, payed_amount: 3000, platform_refunded_at: '2026-10-01T05:00:00Z' },
]

const { operations } = buildSupplierOperationHistory(supplies, returns, [], 0)
const byId = Object.fromEntries(operations.map((op) => [op.id, op]))

// Supplies: native state comes from the obligation, never from UMAG payment_amount/debt.
assert.equal(byId['supply:s1'].settlement.type, 'payable')
assert.equal(byId['supply:s1'].settlement.settled, false, 'UMAG says paid, platform says not → open')
assert.equal(byId['supply:s1'].settlement.obligationId, 'o1')
ok('supply closed in UMAG but not marked in platform stays open')
assert.equal(byId['supply:s2'].settlement.settled, true)
ok('supply with platform_paid_at is settled')
assert.equal(byId['supply:s3'].settlement, null)
assert.equal(byId['supply:s4'].settlement, null)
ok('supply without obligation / with deleted source has nothing to pay')

// Returns: money IN, tracked separately, no netting with supplies.
assert.equal(byId['return:r1'].settlement.type, 'receivable')
assert.equal(byId['return:r1'].settlement.settled, false)
assert.equal(byId['return:r2'].settlement.settled, true)
ok('returns use platform_refunded_at (UMAG payed_amount ignored)')
assert.equal(byId['supply:s1'].amount, 40000)
assert.equal(byId['supply:s1'].settlement.type === 'payable' && byId['return:r1'].settlement.type === 'receivable', true)
ok('supply amount untouched by returns (no netting)')

// «Не закрытые» filter.
const open = filterSupplierOperations(operations, 'open').map((op) => op.id).sort()
assert.deepEqual(open, ['return:r1', 'supply:s1'])
ok("filter 'open' = unpaid supplies + returns awaiting refund")

// Wiring.
const svc = read('src/services/umagSettlementsService.js')
assert.match(svc, /platform_refunded_at, platform_refunded_by, platform_refund_account_id/)
ok('history query selects native refund columns')
const ob = read('src/services/supplierPaymentObligationsService.js')
assert.match(ob, /export async function markReturnRefunded/)
assert.match(ob, /export async function unmarkReturnRefunded/)
ok('mark/unmark return services exported')
const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
assert.match(panel, /markReturnRefunded/)
assert.match(panel, /markObligationPaid/)
assert.match(panel, /id: 'open', label: 'Не закрытые'/)
ok('panel wires pay / receive actions and the open filter')
const sheet = read('src/components/suppliers/settlements/OperationDetailSheet.jsx')
assert.match(sheet, /canManage && operation\?\.settlement && onSettle/)
ok('settle block gated by supplier_payments.manage (canManage)')
const mig = read('supabase/migrations/20261022120000_supply_returns_native_refund_marking.sql')
assert.match(mig, /supplier_payments\.manage/)
ok('DB update policy requires supplier_payments.manage')

// Speed: the card's history is ONE parallel stage (no chained follow-up queries).
const histSrc = svc.slice(svc.indexOf('export async function fetchUmagSupplierOperationHistory'))
assert.match(histSrc, /const \[suppliesRes, returnsRes, paymentsRes, openingRes, obligationsRes, employeesRes\] = await Promise\.all\(\[/)
assert.doesNotMatch(histSrc, /await supabase\s*\n\s*\.from\('academy_users'\)/)
assert.doesNotMatch(histSrc, /await supabase\s*\n\s*\.from\('supplier_payment_obligations'\)/)
ok('supplier history loads supplies/returns/payments/opening/obligations/users in one parallel stage')
const debtSrc = read('src/services/supplierDebtService.js')
assert.match(debtSrc, /rows\.filter\(\(row\) => !row\.platform_supplier_id\)/)
assert.doesNotMatch(panel, /if \(!suppliersReady\) return\s*\n\s*setDebtLoading\(true\)/)
ok('list debts need no supplier ids: one obligations query, started together with the suppliers load')

console.log(`\nverify:supplier-settle-in-history — ${checks} checks passed`)
