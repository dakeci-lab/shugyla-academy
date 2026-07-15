#!/usr/bin/env node
/**
 * Verification for compact supplier toolbar and status filter.
 *
 * Usage:
 *   npm run verify:suppliers-toolbar
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let testsRun = 0
let testsPassed = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function main() {
  console.log('=== Suppliers toolbar verification ===\n')

  const page = read('src/pages/platform/suppliers/SuppliersPage.jsx')
  const pageCss = read('src/pages/platform/suppliers/SuppliersPage.css')
  const filter = read('src/components/suppliers/SupplierFilterPopover.jsx')
  const supplierData = read('src/utils/supplierData.js')
  const table = read('src/components/suppliers/SupplierTable.jsx')

  console.log('Stage 1: Toolbar layout')

  assert('count header removed', !page.includes('suppliers-page__count'))
  assert('count header removed from css', !pageCss.includes('suppliers-page__count'))
  assert('toolbar contains search', page.includes('suppliers-page__search'))
  assert('toolbar grid one row', pageCss.includes('grid-template-columns: minmax(0, 1fr) auto auto'))
  assert('toolbar uses grid layout', /\.suppliers-page__toolbar\s*\{[\s\S]*?display:\s*grid/.test(pageCss))
  assert('search min-width zero', pageCss.includes('min-width: 0'))
  assert('icon buttons 44px', pageCss.includes('width: 44px') && pageCss.includes('height: 44px'))

  console.log('Stage 2: Actions')

  assert('filter icon button', page.includes('FilterIcon'))
  assert('create icon button', page.includes('PlusIcon'))
  assert('filter aria-label', page.includes('aria-label="Фильтр поставщиков"'))
  assert('create aria-label', page.includes('aria-label="Добавить поставщика"'))
  assert('large text create removed', !page.includes('Добавить поставщика</'))
  assert('create uses openCreate', page.includes('onClick={openCreate}'))

  console.log('Stage 3: Status filter')

  assert('filter popover component', page.includes('SupplierFilterPopover'))
  assert('filter only status field', filter.includes('Статус') && !filter.includes('SearchableSupplierSelect'))
  assert('default active status', page.includes('SUPPLIER_LIST_DEFAULT_STATUS'))
  assert('default status is active', supplierData.includes("SUPPLIER_LIST_DEFAULT_STATUS = SUPPLIER_STATUS.ACTIVE"))
  assert('inactive option', supplierData.includes("label: 'Деактивированные'"))
  assert('archived option', supplierData.includes("label: 'Архивные'"))
  assert('reset returns active', page.includes('setAppliedStatus(SUPPLIER_LIST_DEFAULT_STATUS)'))
  assert('shared applied and draft state', page.includes('appliedStatus') && page.includes('draftStatus'))
  assert('search plus status filtering', page.match(/filterSuppliers\(suppliers,\s*\{\s*search,\s*status:\s*appliedStatus/))
  assert('count uses search and draft status', page.includes('filterPreviewCount'))

  console.log('Stage 4: Filter UX')

  assert('mobile filter uses AdminModal', filter.includes('AdminModal'))
  assert('desktop filter popover', filter.includes('supplier-filter-popover'))
  assert('filter count label helper', supplierData.includes('formatSupplierFilterCount'))
  assert('active filter indicator', page.includes('suppliers-page__filter-indicator'))
  assert('focus returns to filter button', filter.includes('returnFocusRef={anchorRef}'))
  assert('apply closes filter', page.includes('setFilterOpen(false)'))

  console.log('Stage 5: Unchanged list UI')

  assert('supplier table unchanged entry', page.includes('<SupplierTable'))
  assert('mobile card edit preserved', table.includes('supplier-card-item--clickable'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
