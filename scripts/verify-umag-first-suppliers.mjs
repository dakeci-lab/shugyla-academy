#!/usr/bin/env node
/**
 * Static checks for UMAG-first suppliers catalog.
 *
 * Usage:
 *   npm run verify:umag-first-suppliers
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
  console.log('=== UMAG-first suppliers verification ===\n')

  const supplierData = read('src/utils/supplierData.js')
  assert.match(
    supplierData,
    /SUPPLIER_LIST_DEFAULT_STATUS = SUPPLIER_CATALOG_FILTER\.UMAG_ACTIVE/
  )
  assert.match(supplierData, /matchesSupplierCatalogFilter/)
  assert.match(supplierData, /compareSuppliersForSelection/)
  assert.match(supplierData, /label: 'Не связаны с UMAG'/)
  assert.match(supplierData, /UMAG_ACTIVE: 'umag_active'/)
  ok('supplierData defines UMAG-first catalog defaults')

  const page = read('src/pages/platform/suppliers/SuppliersPage.jsx')
  assert.match(page, /countPendingSupplierMatchCandidates/)
  assert.match(page, /Требует сопоставления/)
  assert.match(page, /isCreate=\{!editId\}/)
  assert.match(page, /SUPPLIER_CATALOG_FILTER\.UMAG_ACTIVE/)
  ok('suppliers page wires UMAG-first UX and manual-review banner')

  const form = read('src/components/suppliers/SupplierForm.jsx')
  assert.match(form, /Рекомендуемый процесс/)
  assert.match(form, /Данные UMAG/)
  assert.match(form, /Наши настройки/)
  ok('form separates UMAG data and Shugyla settings')

  const select = read('src/components/suppliers/SearchableSupplierSelect.jsx')
  assert.match(select, /compareSuppliersForSelection/)
  ok('procurement select prioritizes UMAG-linked suppliers')

  const filter = read('src/components/suppliers/SupplierFilterPopover.jsx')
  assert.match(filter, /Каталог/)
  ok('filter popover shows catalog modes')

  const adapter = read('src/services/suppliersSupabaseAdapter.js')
  assert.match(adapter, /countPendingSupplierMatchCandidates/)
  assert.match(adapter, /pending_manual_review/)
  ok('adapter exposes pending match candidate count')

  console.log(`\n${passed} checks passed`)
}

main()
