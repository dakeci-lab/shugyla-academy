#!/usr/bin/env node
/**
 * Static checks for UMAG supply returns integration.
 *
 * Usage:
 *   npm run verify:umag-supply-returns
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
let passed = 0

function ok(name) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function main() {
  console.log('=== UMAG supply returns verification ===\n')

  const migration = read('supabase/migrations/20260727031000_umag_supply_returns.sql')
  assert.match(migration, /create table if not exists public\.umag_supply_returns/)
  assert.match(migration, /umag_return_id bigint not null/)
  assert.match(migration, /platform_supplier_id/)
  assert.match(migration, /is_source_deleted/)
  assert.match(migration, /numeric\(20, 4\)/)
  assert.match(migration, /returns_received/)
  assert.match(migration, /umag_supply_return_count/)
  assert.match(migration, /umag_supply_return_amount/)
  assert.doesNotMatch(migration, /\borganization_id\b\s/)
  assert.match(migration, /revoke all on table public\.umag_supply_returns from anon/)
  ok('migration schema + RLS + reconciliation snapshot fields')

  const tviv = read('supabase/migrations/20260727030000_resolve_tviv_tsar_manual_match.sql')
  assert.match(tviv, /pending_manual_review/)
  assert.match(tviv, /accepted/)
  assert.match(tviv, /is_merged = true/)
  ok('TVIV Царь manual merge migration present')

  const sync = read('supabase/functions/umag-sync/index.ts')
  assert.match(sync, /supply-returns\/list/)
  assert.match(sync, /fetchAllSupplyReturns/)
  assert.match(sync, /upsertSupplyReturns/)
  assert.match(sync, /reconcileMissingSupplyReturns/)
  assert.match(sync, /Array\.isArray\(payload\)/)
  assert.match(sync, /agentId/)
  assert.match(sync, /returns_received/)
  assert.doesNotMatch(sync, /supply-returns\/get\//)
  ok('umag-sync paginates returns without N+1 detail')

  const settlements = read('src/services/umagSettlementsService.js')
  assert.match(settlements, /umag_supply_returns/)
  assert.match(settlements, /buildSupplierOperationHistory/)
  assert.match(settlements, /formatSignedUmagMoney/)
  assert.match(settlements, /returnAmount/)
  assert.match(settlements, /deriveSupplyPaymentStatus/)
  assert.match(settlements, /SUPPLY_PAYMENT_EPSILON/)
  assert.match(settlements, /paymentStatus/)
  assert.match(settlements, /debt/)
  ok('settlements service aggregates returns and builds history')

  const recon = read('src/services/supplierReconciliationService.js')
  assert.match(recon, /umagSupplyReturnCount/)
  assert.match(recon, /umag_supply_return_amount/)
  assert.match(recon, /umag_supply_returns/)
  ok('reconciliation snapshot includes returns without rewriting debt')

  const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
  assert.match(panel, /Возвраты поставщикам/)
  assert.match(panel, /История операций/)
  assert.match(panel, /filterSupplierOperations/)
  assert.match(panel, /OperationDetailSheet/)
  assert.match(panel, /Оплачено/)
  assert.match(panel, /Сальдо/)
  assert.match(panel, /Увеличение/)
  assert.match(panel, /Уменьшение/)
  assert.match(panel, /PaymentStatusBadge/)
  assert.match(panel, /supplyPaymentStatusLabel/)
  const sheet = read('src/components/suppliers/settlements/OperationDetailSheet.jsx')
  assert.match(sheet, /Возврат поставщику/)
  assert.match(sheet, /Приёмка/)
  assert.match(sheet, /Статус оплаты/)
  assert.match(sheet, /Осталось/)
  assert.match(sheet, /deriveSupplyPaymentStatus/)
  ok('settlements UI shows returns summary + unified history')

  // Mirror service status logic (cannot import Vite path aliases / extensionless modules here).
  const EPSILON = 0.01
  function deriveStatus(paymentAmount, debt) {
    const paid = Number(paymentAmount) || 0
    const remaining = Number(debt) || 0
    if (remaining <= EPSILON) return 'paid'
    if (paid > EPSILON) return 'partial'
    return 'unpaid'
  }
  assert.equal(deriveStatus(0, 311010), 'unpaid')
  assert.equal(deriveStatus(200000, 300000), 'partial')
  assert.equal(deriveStatus(500000, 0), 'paid')
  assert.equal(deriveStatus(500000, 0.005), 'paid')
  assert.equal(deriveStatus(100.5, 81.7932), 'partial')
  assert.match(settlements, /remaining <= SUPPLY_PAYMENT_EPSILON/)
  assert.match(settlements, /paid > SUPPLY_PAYMENT_EPSILON/)
  assert.match(settlements, /paymentStatus: null/)
  const money = (81793.199999).toLocaleString('ru-KZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  assert.equal(money, '81\u00a0793,2')
  ok('payment status derivation + money formatting')

  console.log(`\n${passed} checks passed`)
}

main()
