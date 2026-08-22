#!/usr/bin/env node
/**
 * P0: planner weekly sales as separate desktop columns.
 *
 * Usage:
 *   npm run verify:procurement-planner-weeks
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
const layoutSrc = read('src/utils/plannerColumnLayout.js')
const ux = read('src/utils/procurementPlannerUx.js')

assert(
  'helper buildPlannerWeekColumnLabels exported',
  ux.includes('export function buildPlannerWeekColumnLabels') &&
    ux.includes('PLANNER_WEEK_COLUMN_COUNT')
)
assert(
  'helper uses periodFrom/periodTo with W1 fallback',
  ux.includes('periodFrom') &&
    ux.includes('periodTo') &&
    ux.includes('`W${i + 1}`')
)
assert(
  'helper walks oldest→newest week windows',
  ux.includes('i * 7') && ux.includes('addDaysToDateKey')
)

assert(
  'desktop drops single «Продажи 8 нед.» column',
  !planner.includes('>Продажи 8 нед.<') && !planner.includes('Продажи 8 нед.</th>')
)
assert(
  'desktop maps week headers via renderPlannerColumnHeader + weekColumns',
  planner.includes('weekColumns.labels[weekIndex]') &&
    planner.includes('weekColumns.titles[weekIndex]') &&
    planner.includes('renderPlannerColumnHeader') &&
    layoutSrc.includes('proc-planner__col-week')
)
assert(
  'desktop cells read weeklySales[i] in renderPlannerSkuCell',
  planner.includes('item.weeklySales?.[weekIndex]') ||
    planner.includes('item.weeklySales[weekIndex]')
)
assert(
  'default visible column count 21',
  planner.includes('visibleColumns') && planner.includes('getVisibleColumns')
)
assert(
  'service rows use visibleColumnCount',
  planner.includes('colSpan={visibleColumnCount}') && !planner.includes('TABLE_COL_SPAN')
)
assert(
  'mobile keeps WeeklySpark (no 8 week th in cards)',
  planner.includes('<WeeklySpark values={item.weeklySales} />') &&
    !/proc-planner__mobile[\s\S]{0,800}weekColumns\.labels\.map/.test(planner)
)
assert(
  'sticky classes on num, product, barcode, order',
  layoutSrc.includes('proc-planner__sticky-product') &&
    layoutSrc.includes('proc-planner__sticky-barcode') &&
    layoutSrc.includes('proc-planner__sticky-order') &&
    planner.includes('buildPlannerColumnInlineStyle')
)
assert(
  'CSS sticky for product/barcode/order',
  plannerCss.includes('.proc-planner__sticky-product') &&
    plannerCss.includes('.proc-planner__sticky-barcode') &&
    plannerCss.includes('.proc-planner__sticky-order') &&
    /position:\s*sticky/.test(plannerCss)
)
assert(
  'CSS week value zero muting',
  plannerCss.includes('.proc-planner__week-val.is-zero')
)

const { buildPlannerWeekColumnLabels, PLANNER_WEEK_COLUMN_COUNT } = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/procurementPlannerUx.js')).href
)

assert('PLANNER_WEEK_COLUMN_COUNT is 8', PLANNER_WEEK_COLUMN_COUNT === 8)

const fallback = buildPlannerWeekColumnLabels('', null)
assert('fallback has 8 W-labels', fallback.labels.length === 8 && fallback.labels[0] === 'W1' && fallback.labels[7] === 'W8')

// periodFrom = start of oldest week; periodTo = end of newest (8*7-1 = 55 days later)
const periodFrom = '2026-06-23'
const periodTo = '2026-08-17'
const labeled = buildPlannerWeekColumnLabels(periodFrom, periodTo)
assert('period labels length 8', labeled.labels.length === 8)
assert(
  'week0 ends on periodFrom+6',
  labeled.toKeys[0] === '2026-06-29' && labeled.labels[0] === '29.06'
)
assert(
  'week7 ends on periodTo',
  labeled.toKeys[7] === periodTo && labeled.labels[7] === '17.08'
)
assert(
  'titles include week range',
  labeled.titles[0].includes('23.06') && labeled.titles[0].includes('29.06')
)

console.log(`\n${checks}/${checks} checks passed`)
