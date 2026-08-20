#!/usr/bin/env node
/**
 * P2: planner dual-mode category navigation (variant C).
 *
 * Usage:
 *   npm run verify:procurement-planner-categories
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let checks = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function assert(label, condition) {
  checks += 1
  if (!condition) throw new Error(`FAIL: ${label}`)
  console.log(`  ✓ ${label}`)
}

const planner = read('src/components/procurement/ProcurementPlannerView.jsx')
const plannerCss = read('src/components/procurement/ProcurementPlannerView.css')
const uxSrc = read('src/utils/procurementPlannerUx.js')
const service = read('src/services/procurementPlanningService.js')

assert(
  'browse mode switch in UI',
  planner.includes('Плоский') &&
    planner.includes('По категориям') &&
    planner.includes('proc-planner__browse-mode') &&
    planner.includes('PLANNER_BROWSE_CATEGORIES')
)
assert(
  'flat mode clears category filters',
  /handleBrowseModeChange[\s\S]{0,280}categoryName:\s*''[\s\S]{0,80}subcategoryName:\s*''/.test(
    planner
  )
)
assert(
  'category open sets categoryName filter',
  planner.includes('openCategoryNav') &&
    /categoryName,\s*subcategoryName:/.test(planner)
)
assert(
  'SKU path still uses fetchSnapshotItemsPage',
  planner.includes('fetchSnapshotItemsPage') &&
    service.includes('export async function fetchSnapshotItemsPage')
)
assert(
  'no unbounded select of all snapshot items for tree',
  !/from\('procurement_snapshot_items'\)[\s\S]{0,200}\.select\('\*'\)(?![\s\S]{0,120}\.range)/.test(
    planner
  ) && !planner.includes('pageSize: 10000')
)
assert(
  'counts scope label present',
  planner.includes('PLANNER_CATEGORY_COUNTS_SCOPE_LABEL') &&
    uxSrc.includes("по снимку")
)
assert(
  'accumulator tracks categoryCounts',
  uxSrc.includes('categoryCounts') && uxSrc.includes('pairCounts')
)
assert(
  'group headers helper + default-sort gate',
  uxSrc.includes('buildPlannerSkuTableRows') &&
    planner.includes('groupHeadersEnabled') &&
    planner.includes('!abcSort.field')
)
assert(
  'group row has no page-length as full category count',
  planner.includes('proc-planner__group-row') &&
    !/itemCount:\s*items\.length/.test(planner) &&
    !/categoryNavModel[\s\S]{0,200}items\.length/.test(planner)
)
assert(
  'crumbs + cat nav CSS',
  plannerCss.includes('.proc-planner__crumbs') &&
    plannerCss.includes('.proc-planner__cat-nav') &&
    plannerCss.includes('.proc-planner__group-row')
)
assert(
  'P0/P1 markers still present',
  planner.includes('weekColumns.labels.map') &&
    planner.includes('proc-planner__sense') &&
    planner.includes('proc-planner__orderable-toggle') &&
    planner.includes('proc-planner__col-order--accent')
)

const ux = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/procurementPlannerUx.js')).href
)

const state = ux.createSnapshotFilterAccumulator()
ux.accumulateSnapshotFilterRow(
  {
    category_name: 'Non Food',
    subcategory_name: 'Bags',
    platform_supplier_id: 's1',
    final_order_qty: 2,
  },
  state
)
ux.accumulateSnapshotFilterRow(
  {
    category_name: 'Non Food',
    subcategory_name: 'Bags',
    platform_supplier_id: 's1',
    final_order_qty: 0,
  },
  state
)
ux.accumulateSnapshotFilterRow(
  {
    category_name: 'Non Food',
    subcategory_name: 'Soap',
    platform_supplier_id: 's2',
    final_order_qty: 1,
  },
  state
)
ux.accumulateSnapshotFilterRow(
  {
    category_name: 'Food',
    subcategory_name: 'Dairy',
    platform_supplier_id: 's2',
    final_order_qty: 3,
  },
  state
)
const options = ux.finalizeSnapshotFilterOptions(state)
assert('categoryCounts Non Food = 3', options.categoryCounts['Non Food'] === 3)
assert('categoryCounts Food = 1', options.categoryCounts.Food === 1)
assert(
  'pairCounts Bags = 2',
  options.pairCounts[`Non Food\u0000Bags`] === 2
)

const nav = ux.buildPlannerCategoryNavModel(options)
assert('nav has 2 categories', nav.length === 2)
assert(
  'nav Non Food count 3 and 2 subs',
  nav.find((c) => c.categoryName === 'Non Food')?.itemCount === 3 &&
    nav.find((c) => c.categoryName === 'Non Food')?.subcategories.length === 2
)

assert(
  'browse level root',
  ux.resolvePlannerCategoryBrowseLevel({ subcategoryCount: 2 }) === 'categories'
)
assert(
  'browse level subs',
  ux.resolvePlannerCategoryBrowseLevel({
    categoryName: 'Non Food',
    subcategoryCount: 2,
  }) === 'subcategories'
)
assert(
  'browse level items when single sub',
  ux.resolvePlannerCategoryBrowseLevel({
    categoryName: 'Food',
    subcategoryCount: 1,
  }) === 'items'
)

const grouped = ux.buildPlannerSkuTableRows(
  [
    { id: '1', categoryName: 'A', subcategoryName: 'a1', productName: 'x' },
    { id: '2', categoryName: 'A', subcategoryName: 'a1', productName: 'y' },
    { id: '3', categoryName: 'B', subcategoryName: 'b1', productName: 'z' },
  ],
  { groupHeaders: true }
)
assert(
  'group headers interleaved without counts',
  grouped.filter((r) => r.type === 'group').length === 2 &&
    grouped[0].label === 'A / a1' &&
    !('itemCount' in (grouped[0] || {}))
)

assert(
  'scope note when supplier set',
  ux.plannerCategoryCountsNeedScopeNote({ platformSupplierId: 's1' }) === true
)
assert(
  'no scope note when clean filters',
  ux.plannerCategoryCountsNeedScopeNote({}) === false
)

console.log(`\n${checks}/${checks} checks passed`)
