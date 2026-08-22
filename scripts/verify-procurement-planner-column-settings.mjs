#!/usr/bin/env node
/**
 * Procurement planner column settings — registry, persist, layout, dynamic render.
 *
 * Usage:
 *   npm run verify:procurement-planner-column-settings
 */

import fs from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))
globalThis.__VITE_ENV__ = {}

let checks = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function assert(label, condition) {
  checks += 1
  if (!condition) throw new Error(`FAIL: ${label}`)
  console.log(`  ✓ ${label}`)
}

const registrySrc = read('src/utils/procurementPlannerColumnRegistry.js')
const mergeSrc = read('src/utils/plannerColumnSettingsMerge.js')
const layoutSrc = read('src/utils/plannerColumnLayout.js')
const localAdapterSrc = read('src/services/tableSettingsLocalAdapter.js')
const supabaseAdapterSrc = read('src/services/tableSettingsSupabaseAdapter.js')
const serviceSrc = read('src/services/tableSettingsService.js')
const migrationSrc = read('supabase/migrations/20260822120000_user_table_settings.sql')
const planner = read('src/components/procurement/ProcurementPlannerView.jsx')
const packageJson = read('package.json')

const registry = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/procurementPlannerColumnRegistry.js')).href
)
const merge = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/plannerColumnSettingsMerge.js')).href
)
const layout = await import(pathToFileURL(path.join(ROOT, 'src/utils/plannerColumnLayout.js')).href)

assert(
  'PROCUREMENT_PLANNER_TABLE_NAME constant',
  registrySrc.includes("export const PROCUREMENT_PLANNER_TABLE_NAME = 'PROCUREMENT_PLANNER'")
)

assert(
  'layout exports computeStickyLeft + plannerTreeTailColSpan',
  layoutSrc.includes('export function computeStickyLeft') &&
    layoutSrc.includes('export function plannerTreeTailColSpan') &&
    layoutSrc.includes('export function getVisibleColumns')
)

assert(
  '21 column defs in registry array',
  registry.getPlannerColumnRegistry().length === 21
)

assert(
  'week0…week7 keys present',
  ['week0', 'week1', 'week2', 'week3', 'week4', 'week5', 'week6', 'week7'].every((key) =>
    registrySrc.includes(`columnName: '${key}'`)
  )
)

assert(
  '4 locked columns flagged',
  registry.getLockedPlannerColumnNames().length === 4
)

assert(
  '17 togglable columns flagged',
  registry.getTogglablePlannerColumnNames().length === 17
)

assert(
  'local adapter storage prefix',
  localAdapterSrc.includes("const STORAGE_PREFIX = 'shugyla:tableSettings:'")
)

assert(
  'supabase adapter uses user_table_settings table',
  supabaseAdapterSrc.includes("const TABLE = 'user_table_settings'")
)

assert(
  'service routes via isCloudMode',
  serviceSrc.includes('isCloudMode()') &&
    serviceSrc.includes("from './tableSettingsLocalAdapter'") &&
    serviceSrc.includes("from './tableSettingsSupabaseAdapter'")
)

assert(
  'migration creates user_table_settings with RLS',
  migrationSrc.includes('create table if not exists public.user_table_settings') &&
    migrationSrc.includes('enable row level security') &&
    migrationSrc.includes('auth_user_id = auth.uid()')
)

assert(
  'package.json verify script registered',
  packageJson.includes('"verify:procurement-planner-column-settings"')
)

assert(
  'T2: planner loads table settings on mount',
  planner.includes('getTableSettings(PROCUREMENT_PLANNER_TABLE_NAME)') &&
    planner.includes('mergePlannerColumnSettings')
)

assert(
  'T2: dynamic thead from visibleColumns',
  planner.includes('visibleColumns.map((col) => renderPlannerColumnHeader(col))')
)

assert(
  'T2: dynamic SKU row from visibleColumns',
  planner.includes('visibleColumns.map((col) => renderPlannerSkuCell(col, item, index')
)

assert(
  'T2: tree tail uses plannerTreeTailColSpan',
  planner.includes('colSpan={plannerTreeTailColSpan(visibleColumns)}') &&
    planner.includes('getVisibleLockedLeftColumns(visibleColumns)')
)

assert(
  'T2: service rows use visibleColumnCount',
  planner.includes('colSpan={visibleColumnCount}') &&
    !planner.includes('TABLE_COL_SPAN')
)

assert(
  'T2: header width via buildPlannerColumnHeaderStyle',
  planner.includes('buildPlannerColumnHeaderStyle(col, visibleColumns)')
)

assert(
  'T2: body sticky via buildPlannerColumnBodyStyle',
  planner.includes('buildPlannerColumnBodyStyle(col, visibleColumns)')
)

assert(
  'layout exports buildPlannerColumnHeaderStyle + buildPlannerColumnBodyStyle',
  layoutSrc.includes('export function buildPlannerColumnHeaderStyle') &&
    layoutSrc.includes('export function buildPlannerColumnBodyStyle')
)

const plannerCss = read('src/components/procurement/ProcurementPlannerView.css')

assert(
  'hotfix: no rem max-width on product/barcode columns',
  !plannerCss.includes('max-width: 11rem') && !plannerCss.includes('max-width: 8.5rem')
)

assert(
  'hotfix: vertical column dividers on table cells',
  plannerCss.includes('border-right: 1px solid var(--border')
)

assert(
  'hotfix: colgroup for column widths',
  planner.includes('<colgroup>') && planner.includes('<col key={col.columnName}')
)

assert(
  'hotfix: resize uses measured th width',
  planner.includes('getBoundingClientRect().width')
)

assert(
  'hotfix: drag handle separate from resizer',
  planner.includes('proc-planner__col-drag-handle') &&
    planner.includes('className="proc-planner__col-resizer"')
)

const defaults = registry.getDefaultPlannerColumnSettings()
const visible = layout.getVisibleColumns(defaults)

assert('default visible columns length 21', visible.length === 21)
assert(
  'default barcode sticky left 220px (44+176)',
  layout.computeStickyLeft('barcode', visible) === 220
)
assert('default tree tail span 18', layout.plannerTreeTailColSpan(visible) === 18)

const widenedProduct = merge.mergePlannerColumnSettings({
  columns: defaults.columns.map((col) =>
    col.columnName === 'product' ? { ...col, width: 200 } : col
  ),
})
const visibleWidened = layout.getVisibleColumns(widenedProduct)
assert(
  'computeStickyLeft shifts when product width changes',
  layout.computeStickyLeft('barcode', visibleWidened) === 244
)

const resizedProduct220 = merge.mergePlannerColumnSettings({
  columns: defaults.columns.map((col) =>
    col.columnName === 'product' ? { ...col, width: 220 } : col
  ),
})
const visibleProduct220 = layout.getVisibleColumns(resizedProduct220)
assert(
  'T4: product 176→220 gives barcode sticky left 264px (44+220)',
  layout.computeStickyLeft('barcode', visibleProduct220) === 264
)

const hiddenStock = merge.mergePlannerColumnSettings({
  columns: defaults.columns.map((col) =>
    col.columnName === 'stock' ? { ...col, visible: false } : col
  ),
})
const visibleHidden = layout.getVisibleColumns(hiddenStock)
assert('hidden stock reduces visible count', visibleHidden.length === 20)
assert(
  'tree tail span adjusts when column hidden',
  layout.plannerTreeTailColSpan(visibleHidden) === 17
)

const hiddenFourWeeks = merge.mergePlannerColumnSettings({
  columns: defaults.columns.map((col) =>
    ['week0', 'week1', 'week2', 'week3'].includes(col.columnName)
      ? { ...col, visible: false }
      : col
  ),
})
const visibleHiddenWeeks = layout.getVisibleColumns(hiddenFourWeeks)
assert('T4: hide 4 week cols → 17 visible columns', visibleHiddenWeeks.length === 17)
assert(
  'T4: tree tail span with 4 hidden week cols is 14',
  layout.plannerTreeTailColSpan(visibleHiddenWeeks) === 14
)

assert(
  'T4: merge keeps contiguous ordinals 0…N-1',
  merge.arePlannerOrdinalsContiguous(defaults) &&
    merge.arePlannerOrdinalsContiguous(merge.mergePlannerColumnSettings(null))
)

assert(
  'T4: persist column shape has required fields',
  defaults.columns.every(
    (col) =>
      typeof col.columnName === 'string' &&
      Number.isInteger(col.columnOrdinalNumber) &&
      typeof col.visible === 'boolean' &&
      Number.isFinite(col.width) &&
      typeof col.sort === 'boolean'
  )
)

assert(
  'T4: reorderable middle zone is 16 columns (17 togglable − supplier)',
  registry.getReorderablePlannerColumnNames().length === 16
)

const edgeFunctionPaths = []
function walkFunctions(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFunctions(fullPath)
    else if (/\.(ts|js|tsx|jsx)$/.test(entry.name)) edgeFunctionPaths.push(fullPath)
  }
}
walkFunctions(path.join(ROOT, 'supabase/functions'))
const edgeSources = edgeFunctionPaths.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n')
assert(
  'T4: no Edge Function for table settings',
  !edgeSources.includes('user_table_settings') &&
    !/tableSettings/i.test(edgeSources) &&
    serviceSrc.includes('isCloudMode()')
)

const mergedUnknown = merge.mergePlannerColumnSettings({
  columns: [
    { columnName: 'unknownCol', columnOrdinalNumber: 0, visible: true, width: 99, sort: false },
    { columnName: 'product', columnOrdinalNumber: 1, visible: false, width: 150, sort: false },
  ],
})
assert(
  'merge drops unknown keys',
  !mergedUnknown.columns.some((col) => col.columnName === 'unknownCol')
)
assert(
  'merge forces locked product visible',
  mergedUnknown.columns.find((col) => col.columnName === 'product')?.visible === true
)

assert(
  'T3: locked ordinal enforcement helper exported',
  mergeSrc.includes('export function enforceLockedPlannerColumnOrdinals') &&
    mergeSrc.includes('export function normalizePlannerColumnSettingsForSave') &&
    mergeSrc.includes('export function reorderTogglablePlannerColumns')
)

const reordered = merge.reorderTogglablePlannerColumns(defaults, 'stock', 'abcQty')
const reorderedNames = reordered.columns
  .sort((a, b) => a.columnOrdinalNumber - b.columnOrdinalNumber)
  .map((col) => col.columnName)
assert(
  'T3: locked columns stay pinned after reorder',
  reorderedNames.indexOf('rowNum') === 0 &&
    reorderedNames.indexOf('product') === 1 &&
    reorderedNames.indexOf('barcode') === 2 &&
    reorderedNames.indexOf('orderQty') > reorderedNames.indexOf('recommendedQty') &&
    reorderedNames.indexOf('supplier') === reorderedNames.length - 1
)

assert(
  'T3: resizer class on planner headers',
  planner.includes('proc-planner__col-resizer') &&
    planner.includes('handleColumnResizePointerDown')
)

assert(
  'T3: gear popover strings and reset button',
  planner.includes('Видимость столбцов') &&
    planner.includes('Настройте таблицу под себя — выбор сохранится') &&
    planner.includes('По умолчанию') &&
    planner.includes('proc-planner__column-settings-popover')
)

assert(
  'T3: gear only inside desktop section',
  planner.includes('proc-planner__desktop-bar') &&
    planner.includes('renderColumnSettingsGear()') &&
    planner.indexOf('renderColumnSettingsGear()') < planner.indexOf('proc-planner__mobile')
)

assert(
  'T3: saveTableSettings wired for persist',
  planner.includes('saveTableSettings') &&
    planner.includes('normalizePlannerColumnSettingsForSave') &&
    planner.includes('persistColumnSettings')
)

assert(
  'T3: abcSort reset when hiding sorted ABC column',
  planner.includes('plannerColumnNameToAbcSortField') &&
    planner.includes("setAbcSort({ field: '', dir: 'asc' })")
)

assert(
  'T3: pageSize change persists snapshot',
  planner.includes('handlePageSizeChange') &&
    planner.includes('pageSize: nextPageSize')
)

assert(
  'T3: HTML5 reorder handlers on headers',
  planner.includes('handleColumnDragStart') &&
    planner.includes('reorderTogglablePlannerColumns')
)

assert(
  'T3: CSS resizer and popover styles',
  plannerCss.includes('.proc-planner__col-resizer') &&
    plannerCss.includes('.proc-planner__column-settings-popover')
)

console.log(`\n${checks}/${checks} checks passed`)
