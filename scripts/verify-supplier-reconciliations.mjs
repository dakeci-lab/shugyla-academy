#!/usr/bin/env node
/**
 * Static + pure-logic checks for supplier reconciliation (акт сверки) stage 2.
 *
 * Usage:
 *   npm run verify:supplier-reconciliations
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

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function computeDifference(supplierReportedBalance, umagDebt) {
  if (supplierReportedBalance == null || supplierReportedBalance === '') return null
  return Math.round((Number(supplierReportedBalance) - Number(umagDebt)) * 10000) / 10000
}

function deriveStatus(balance, difference) {
  if (balance == null || balance === '') return 'draft'
  if (difference == null) return 'draft'
  if (Math.abs(difference) <= 0.01) return 'matched'
  return 'discrepancy'
}

function main() {
  console.log('=== Supplier reconciliations verification ===\n')

  const migration = read('supabase/migrations/20260726240000_supplier_reconciliations.sql')
  assert.match(migration, /create table if not exists public\.supplier_reconciliations/)
  assert.match(migration, /create table if not exists public\.supplier_reconciliation_documents/)
  assert.match(migration, /supplier-reconciliation-docs/)
  assert.match(migration, /umag\.reconciliations\.view/)
  assert.match(migration, /umag\.reconciliations\.create/)
  assert.match(migration, /umag\.reconciliations\.edit/)
  assert.match(migration, /umag\.reconciliations\.resolve/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /15728640/)
  assert.doesNotMatch(migration, /organization_id/)
  ok('migration schema + permissions + private bucket')

  const service = read('src/services/supplierReconciliationService.js')
  assert.match(service, /is_source_deleted',\s*false/)
  assert.match(service, /supplier_reported_balance - umag_debt|supplierReportedBalance.*umagDebt/)
  assert.match(service, /snapshot_last_umag_sync_id/)
  assert.match(service, /RECONCILIATION_BUCKET/)
  assert.doesNotMatch(service, /\.update\(\s*\{[^}]*amount/)
  ok('service snapshot excludes deleted supplies and does not mutate UMAG source')

  const umagService = read('src/services/umagSettlementsService.js')
  assert.match(umagService, /\.eq\('is_source_deleted', false\)/)
  assert.match(umagService, /umag_supply_returns/)
  ok('UMAG settlements still exclude source-deleted supplies and load returns')

  const panel = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
  assert.match(panel, /Создать сверку/)
  assert.match(panel, /История сверок/)
  assert.match(panel, /История операций/)
  assert.match(panel, /CreateReconciliationModal/)
  assert.match(panel, /ReconciliationDetailView/)
  ok('settlements panel wires create + history + detail')

  const createModal = read('src/components/suppliers/settlements/CreateReconciliationModal.jsx')
  assert.match(createModal, /Показатели за выбранный период/)
  assert.doesNotMatch(createModal, /По данным UMAG за выбранный период/)
  assert.match(createModal, /Задолженность по акту поставщика/)
  assert.match(createModal, /Возвраты поставщикам/)
  assert.match(createModal, /Возвраты оплаты/)
  assert.match(createModal, /Синхронизировать/)
  ok('create modal shows period UMAG snapshot disclaimer')

  const catalog = read('src/config/permissionCatalog.js')
  assert.match(catalog, /UMAG_RECONCILIATIONS_VIEW/)
  assert.match(catalog, /umag\.reconciliations\.resolve/)
  ok('permission catalog includes reconciliation codes')

  const perms = read('src/config/permissions.js')
  assert.match(perms, /canCreateUmagReconciliations/)
  assert.match(perms, /canResolveUmagReconciliations/)
  ok('permission helpers exported')

  assert.equal(computeDifference(425000, 380000), 45000)
  assert.equal(computeDifference(380000, 425000), -45000)
  assert.equal(deriveStatus(null, null), 'draft')
  assert.equal(deriveStatus(100, 0), 'matched')
  assert.equal(deriveStatus(100, 45), 'discrepancy')
  ok('difference sign convention and status derivation')

  console.log(`\n${passed} checks passed`)
}

main()
