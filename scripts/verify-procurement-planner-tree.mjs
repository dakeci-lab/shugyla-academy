#!/usr/bin/env node
/**
 * PR B: in-table category tree (lazy expand) + flat fallback for search/ABC sort.
 *
 * Usage:
 *   npm run verify:procurement-planner-tree
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

assert('browse mode UI removed', !planner.includes('proc-planner__browse-mode'))
assert('cat-nav UI removed', !planner.includes('proc-planner__cat-nav'))
assert('crumbs UI removed', !planner.includes('proc-planner__crumbs'))
assert('SKU category subtitle removed', !/className="proc-planner__cat"/.test(planner))

assert(
  'tree group row + expand control',
  planner.includes('proc-planner__tree-group') &&
    planner.includes('proc-planner__tree-toggle') &&
    planner.includes('toggleCategoryExpand') &&
    planner.includes('toggleSubcategoryExpand')
)
assert(
  'tree CSS for group / toggle / more',
  plannerCss.includes('.proc-planner__tree-group') &&
    plannerCss.includes('.proc-planner__tree-toggle') &&
    plannerCss.includes('.proc-planner__tree-more')
)
assert(
  'lazy branch fetch via fetchSnapshotItemsPage',
  planner.includes('loadBranchSkuPage') &&
    /fetchSnapshotItemsPage\(\{[\s\S]*?categoryName:/.test(planner) &&
    planner.includes('PLANNER_TREE_BRANCH_PAGE_SIZE')
)
assert(
  'branch «Ещё» append path',
  planner.includes('proc-planner__tree-more') &&
    /append:\s*true/.test(planner) &&
    !planner.includes('page-cache')
)
assert(
  'collapse clears children (MVP)',
  planner.includes('collapseTreeKey') &&
    /delete next\[key\]/.test(planner)
)
assert(
  'counts labeled «по снимку»',
  uxSrc.includes('PLANNER_CATEGORY_COUNTS_SCOPE_LABEL') &&
    planner.includes('PLANNER_CATEGORY_COUNTS_SCOPE_LABEL') &&
    uxSrc.includes("по снимку")
)
assert(
  'tree vs flat mode helper',
  uxSrc.includes('export function isPlannerTreeViewMode') &&
    planner.includes('isPlannerTreeViewMode') &&
    planner.includes('treeMode')
)
assert(
  'search or ABC sort → flat path',
  /isPlannerTreeViewMode\(\{\s*search:[\s\S]*?abcSortField:/.test(planner) &&
    planner.includes('proc-planner__flat-hint') &&
    /!treeMode \? \(\s*<TablePagination/.test(planner)
)
assert(
  'root tree skips global items fetch',
  /if \(treeMode\) \{[\s\S]*?setItems\(\[\]\)[\s\S]*?return[\s\S]*?\}/.test(planner)
)
assert(
  'P0/P1 markers kept',
  planner.includes('weekColumns.labels.map') &&
    planner.includes('proc-planner__sticky-order') &&
    planner.includes('proc-planner__col-order--accent') &&
    planner.includes('proc-planner__orderable-toggle') &&
    planner.includes('proc-planner__snapshot')
)
assert(
  'sticky product/order have no box-shadow strips',
  !/\.proc-planner__sticky-product\s*\{[^}]*box-shadow/.test(plannerCss) &&
    !/\.proc-planner__sticky-order\s*\{[^}]*box-shadow/.test(plannerCss)
)
assert(
  'product column has fixed width bounds',
  /\.proc-planner__col-product\s*\{[^}]*width:\s*14rem/.test(plannerCss) &&
    /\.proc-planner__col-product\s*\{[^}]*max-width:\s*14rem/.test(plannerCss)
)
assert(
  'product name clamps with ellipsis path',
  plannerCss.includes('-webkit-line-clamp: 2') &&
    plannerCss.includes('text-overflow: ellipsis')
)
assert(
  'product / group labels expose full text via title',
  planner.includes('title={item.productName}') &&
    planner.includes('title={item.barcode}') &&
    /tree-group-name" title=\{label\}/.test(planner)
)
assert(
  'table layout fixed to keep columns stable on expand',
  /\.proc-planner__table\s*\{[^}]*table-layout:\s*fixed/.test(plannerCss)
)
assert(
  'SKU rows use proc-planner__sku-row for hover highlight',
  planner.includes("proc-planner__sku-row") &&
    planner.includes('className="proc-planner__card proc-planner__sku-row"')
)
assert(
  'SKU row hover is instant gray without transition',
  plannerCss.includes('tr.proc-planner__sku-row:hover') &&
    plannerCss.includes('background: #f3f4f6') &&
    /proc-planner__sku-row[^{]*\{[^}]*transition:\s*none/.test(plannerCss)
)

const ux = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/procurementPlannerUx.js')).href
)

assert('isPlannerTreeViewMode idle → tree', ux.isPlannerTreeViewMode({}) === true)
assert(
  'isPlannerTreeViewMode search → flat',
  ux.isPlannerTreeViewMode({ search: '123' }) === false
)
assert(
  'isPlannerTreeViewMode ABC sort → flat',
  ux.isPlannerTreeViewMode({ abcSortField: 'abc_qty' }) === false
)
assert(
  'plannerCategoryExpandsToSku: ≤1 → SKU',
  ux.plannerCategoryExpandsToSku(0) === true &&
    ux.plannerCategoryExpandsToSku(1) === true &&
    ux.plannerCategoryExpandsToSku(2) === false
)

const state = ux.createSnapshotFilterAccumulator()
ux.accumulateSnapshotFilterRow(
  {
    category_name: 'Non Food',
    subcategory_name: 'Bags',
    platform_supplier_id: 's1',
    final_order_qty: 1,
  },
  state
)
ux.accumulateSnapshotFilterRow(
  {
    category_name: 'Non Food',
    subcategory_name: 'Boxes',
    platform_supplier_id: 's1',
    final_order_qty: 2,
  },
  state
)
const options = ux.finalizeSnapshotFilterOptions(state)
const model = ux.buildPlannerCategoryNavModel(options)
assert(
  'nav model count from filterOptions (not page length)',
  model[0]?.categoryName === 'Non Food' &&
    model[0]?.itemCount === 2 &&
    model[0]?.subcategories?.length === 2
)
assert(
  'tree keys stable',
  ux.plannerCategoryTreeKey('Non Food') === 'c:Non Food' &&
    ux.plannerSubcategoryTreeKey('Non Food', 'Bags').includes('\u0000')
)
assert(
  'branch page size fixed for PR B',
  ux.PLANNER_TREE_BRANCH_PAGE_SIZE === 50
)

console.log(`\n${checks}/${checks} checks passed`)
