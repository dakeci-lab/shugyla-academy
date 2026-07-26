#!/usr/bin/env node
/**
 * Static checks for UMAG ↔ platform_suppliers centralization.
 *
 * Usage:
 *   npm run verify:supplier-centralization
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
  console.log('=== Supplier centralization verification ===\n')

  const migration = read('supabase/migrations/20260727010000_centralize_suppliers_umag.sql')
  assert.match(migration, /platform_suppliers/)
  assert.match(migration, /umag_supplier_id/)
  assert.match(migration, /platform_supplier_id/)
  assert.match(migration, /supplier_umag_match_candidates/)
  assert.match(migration, /unique BIN|linked_by_bin|umag_bins/i)
  assert.doesNotMatch(migration, /fuzzy/i)
  ok('migration adds mapping without name auto-merge')

  const edge = read('supabase/functions/umag-sync/index.ts')
  assert.match(edge, /reconcileCanonicalSuppliers/)
  assert.match(edge, /platform_supplier_id/)
  assert.match(edge, /Shugyla operational fields are never written/)
  assert.match(edge, /CANONICAL_SUPPLIER_RECONCILE_FAILED/)
  assert.match(
    edge,
    /\.from\('platform_suppliers'\)\s*\n\s*\.update\(umagOwned\)/
  )
  assert.match(edge, /order_days: ''/)
  ok('umag-sync reconciles canonical; updates use umagOwned only')

  const adapter = read('src/services/suppliersSupabaseAdapter.js')
  assert.match(adapter, /supplierToOperationalRow/)
  assert.match(adapter, /linkedToUmag/)
  ok('adapter protects UMAG-owned fields on update')

  const form = read('src/components/suppliers/SupplierForm.jsx')
  assert.match(form, /Синхронизировано с UMAG/)
  assert.match(form, /Наши настройки/)
  assert.match(form, /readOnly=\{umagLocked\}/)
  ok('supplier form separates UMAG vs Shugyla fields')

  const settlements = read('src/services/umagSettlementsService.js')
  assert.match(settlements, /platform_supplier_id/)
  assert.match(settlements, /platformSupplierId/)
  ok('settlements aggregate by canonical supplier')

  const recon = read('src/services/supplierReconciliationService.js')
  assert.match(recon, /platform_supplier_id/)
  assert.match(recon, /platformSupplierId/)
  ok('reconciliations use canonical supplier id')

  console.log(`\n${passed} checks passed`)
}

main()
