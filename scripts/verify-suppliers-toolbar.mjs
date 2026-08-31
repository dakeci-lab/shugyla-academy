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
  assert('toolbar contains search', page.includes('PlatformSearchToolbar'))
  const searchToolbarCss = read('src/components/platform/PlatformSearchToolbar.css')
  assert('unified search toolbar styles', searchToolbarCss.includes('.platform-search-toolbar'))
  assert('search stretches', searchToolbarCss.includes('flex: 1 1 auto'))
  assert('icon buttons 44px', searchToolbarCss.includes('width: 44px') && searchToolbarCss.includes('height: 44px'))

  console.log('Stage 2: Actions')

  assert('filter icon button', page.includes('PlatformFilterButton'))
  assert('filter aria-label', page.includes('ariaLabel="Фильтр"'))
  assert(
    'manual create removed — suppliers are UMAG-sync-only',
    !page.includes('PlusIcon') &&
      !page.includes('openCreate') &&
      !page.includes('aria-label="Добавить поставщика"'),
  )

  console.log('Stage 3: Archived filter')

  assert('filter popover component', page.includes('SupplierFilterPopover'))
  assert(
    'single show-archived checkbox, no old multi-option catalog radiogroup',
    filter.includes('Показать удалённых поставщиков') &&
      !filter.includes('Каталог') &&
      !filter.includes('SearchableSupplierSelect'),
  )
  assert('default show-archived state', page.includes('SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED'))
  assert(
    'default is unchecked (active suppliers shown first)',
    supplierData.includes('SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED = false'),
  )
  assert('reset returns default state', page.includes('setAppliedShowArchived(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)'))
  assert('shared applied and draft state', page.includes('appliedShowArchived') && page.includes('draftShowArchived'))
  assert(
    'search plus archived filtering',
    page.match(/filterSuppliers\(suppliers,\s*\{\s*search,\s*showArchived:\s*appliedShowArchived/),
  )
  assert(
    'archive filter grounded in the real umag-sync deletion signal',
    supplierData.includes('matchesSupplierArchiveFilter') && supplierData.includes('isSupplierDeleted'),
  )
  assert('old 4-way catalog filter fully removed', !supplierData.includes('SUPPLIER_CATALOG_FILTER'))

  console.log('Stage 4: Filter UX')

  assert('mobile filter uses AdminModal', filter.includes('AdminModal'))
  assert('desktop filter popover', filter.includes('supplier-filter-popover'))
  assert('active filter indicator', page.includes('active={filtersActive}'))
  assert('focus returns to filter button', filter.includes('returnFocusRef={anchorRef}'))
  assert('apply closes filter', page.includes('setFilterOpen(false)'))

  console.log('Stage 5: List UI — status column and UMAG badge removed, row density tightened')

  assert('supplier table entry point unchanged', page.includes('<SupplierTable'))
  assert('mobile card edit preserved', table.includes('supplier-card-item--clickable'))
  assert('no Статус column header', !table.includes('<th>Статус</th>'))
  assert('no per-row UMAG badge component', !table.includes('UmagLinkBadge'))
  const tableCss = read('src/components/suppliers/SupplierTable.css')
  assert('no leftover UMAG badge styles', !tableCss.includes('.supplier-table__umag'))
  assert('row uses compact padding, not a tall fixed height', tableCss.includes('.supplier-table td') && !tableCss.match(/\.supplier-table td\s*\{[^}]*height:\s*60px/))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
