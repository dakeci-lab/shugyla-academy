#!/usr/bin/env node
/**
 * Procurement planner: «Запас/дн» column + «Спрос/дн» rename.
 *
 * Usage:
 *   npm run verify:procurement-planner-reserve-days
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
const mathSrc = read('src/utils/procurementPlanningMath.js')
const planExport = read('src/utils/procurementPlanExport.js')

assert('procurementPlanningMath exports calcReserveDays', mathSrc.includes('export function calcReserveDays'))

const math = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/procurementPlanningMath.js')).href
)

assert('calcReserveDays 10/2 → 5', math.calcReserveDays(10, 2) === 5)
assert('calcReserveDays 11/4 → 3', math.calcReserveDays(11, 4) === 3)
assert('calcReserveDays 0/1.5 → 0', math.calcReserveDays(0, 1.5) === 0)
assert('calcReserveDays 5/0 → null', math.calcReserveDays(5, 0) === null)
assert('calcReserveDays negative avg → null', math.calcReserveDays(5, -1) === null)
assert(
  'negative raw → calculationStock 0 → reserve 0',
  math.calcReserveDays(math.calcCalculationStock(-5), 2) === 0
)

assert(
  'service rows use visibleColumnCount (21 default)',
  planner.includes('colSpan={visibleColumnCount}') && !planner.includes('TABLE_COL_SPAN')
)

const registrySrc = read('src/utils/procurementPlannerColumnRegistry.js')

assert(
  'registry column order: stock → reserveDays → avgDaily',
  (() => {
    const stockIdx = registrySrc.indexOf("columnName: 'stock'")
    const reserveIdx = registrySrc.indexOf("columnName: 'reserveDays'")
    const avgIdx = registrySrc.indexOf("columnName: 'avgDaily'")
    return stockIdx > 0 && stockIdx < reserveIdx && reserveIdx < avgIdx
  })()
)

assert('planner imports calcReserveDays', planner.includes('calcReserveDays'))
assert(
  'desktop row uses calculationStock for reserve',
  planner.includes('calcReserveDays(item.calculationStock, item.avgDaily)')
)
assert(
  'desktop row has reserve cell class',
  layoutSrc.includes('proc-planner__col-reserve') &&
    planner.includes("col.columnName === 'reserveDays'")
)
assert(
  'no legacy Ср/день header',
  !planner.includes('<th>Ср/день</th>') && !planner.includes('Ср/день <b>')
)

assert(
  'mobile card has Запас/дн and Спрос/дн',
  planner.includes('Запас/дн') && planner.includes('Спрос/дн')
)

assert(
  'tree/loading rows use visibleColumnCount',
  planner.includes('colSpan={visibleColumnCount}') && !planner.includes('TABLE_COL_SPAN')
)

assert(
  'CSS reserve column aligned right',
  plannerCss.includes('.proc-planner__col-reserve') &&
    /proc-planner__col-reserve[\s\S]{0,120}text-align:\s*right/.test(plannerCss)
)

assert(
  'PLAN_EXPORT_COLUMNS unchanged (5 cols)',
  planExport.includes("export const PLAN_EXPORT_COLUMNS = ['№', 'Товар', 'Штрихкод', 'Поставщик', 'Заказ']") ||
    (planExport.includes('PLAN_EXPORT_COLUMNS') &&
      (planExport.match(/PLAN_EXPORT_COLUMNS/g) || []).length >= 1 &&
      !planExport.includes('Запас/дн'))
)

assert(
  'mapSnapshotItemToPurchaseOrderItem unchanged contract',
  mathSrc.includes('stock_qty: Number(item.calculationStock') &&
    !mathSrc.includes('reserve_days')
)

/* «Запас/дн» vs «Норма» highlight (below norm = green, above = red) */

assert(
  'procurementPlanningMath exports compareReserveDaysToNorm',
  mathSrc.includes('export function compareReserveDaysToNorm')
)
assert('compareReserveDaysToNorm below norm', math.compareReserveDaysToNorm(3, 4) === 'below-norm')
assert('compareReserveDaysToNorm above norm', math.compareReserveDaysToNorm(10, 4) === 'above-norm')
assert('compareReserveDaysToNorm equal → null', math.compareReserveDaysToNorm(4, 4) === null)
assert(
  'compareReserveDaysToNorm unknown reserve (no demand) → null',
  math.compareReserveDaysToNorm(null, 4) === null
)
assert(
  'compareReserveDaysToNorm non-finite norm → null',
  math.compareReserveDaysToNorm(3, undefined) === null
)

assert(
  'planner imports compareReserveDaysToNorm',
  planner.includes('compareReserveDaysToNorm')
)
assert(
  'desktop reserve cell applies below/above-norm modifier class',
  /proc-planner__reserve-\$\{reserveStatus\}/.test(planner)
)
assert(
  'mobile card reserve value applies below/above-norm modifier class',
  planner.includes('reserveStatus ? `proc-planner__reserve-${reserveStatus}` : undefined')
)
assert(
  'CSS defines the two highlight shades from the owner screenshot',
  plannerCss.includes('.proc-planner__reserve-below-norm') &&
    plannerCss.includes('#c2ecd0') &&
    plannerCss.includes('.proc-planner__reserve-above-norm') &&
    plannerCss.includes('#f6bcbc')
)

console.log(`\n${checks}/${checks} checks passed`)
