#!/usr/bin/env node
/**
 * P1: planner sense header, order accents, orderable toolbar chip.
 *
 * Usage:
 *   npm run verify:procurement-planner-header
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

assert(
  'sense helper exported',
  uxSrc.includes('export function buildPlannerSenseLine') &&
    uxSrc.includes('PLANNER_SENSE_FORMULA')
)
assert(
  'formula literal matches plan',
  uxSrc.includes(
    "'Рек. = max(0, round(Ср/день × Норма − Остаток*))'"
  ) ||
    uxSrc.includes(
      'Рек. = max(0, round(Ср/день × Норма − Остаток*))'
    )
)
assert(
  'formula hint mentions 56 and Остаток*',
  uxSrc.includes('сумма 8 нед. / 56') && uxSrc.includes('max(0, остаток UMAG)')
)
assert(
  'period / к заказу literals in helper',
  uxSrc.includes('Период:') && uxSrc.includes('К заказу:')
)

assert(
  'planner renders sense line',
  planner.includes('proc-planner__sense') && planner.includes('buildPlannerSenseLine')
)
assert(
  'toolbar orderable toggle (not only advanced checkbox)',
  planner.includes('proc-planner__orderable-toggle') &&
    planner.includes('Только к заказу') &&
    /orderableOnly:\s*!current\.orderableOnly/.test(planner)
)
assert(
  'advanced checkbox still wired to same orderableOnly',
  /checked=\{filters\.orderableOnly\}/.test(planner)
)
assert(
  'ABC compact desktop classes',
  planner.includes('proc-planner__col-abc--compact') &&
    planner.includes('proc-planner__abc-badges--compact') &&
    /<AbcBadges item=\{[^}]+\} compact \/>/.test(planner)
)
assert(
  'order column accent class',
  planner.includes('proc-planner__col-order--accent') &&
    plannerCss.includes('.proc-planner__col-order--accent')
)
assert(
  'rec column muted class',
  planner.includes('proc-planner__col-rec') && plannerCss.includes('.proc-planner__col-rec')
)
assert(
  'CSS sense + orderable toggle',
  plannerCss.includes('.proc-planner__sense') &&
    plannerCss.includes('.proc-planner__orderable-toggle')
)

const {
  buildPlannerSenseLine,
  PLANNER_SENSE_FORMULA,
  formatPlannerPeriodDateRu,
} = await import(pathToFileURL(path.join(ROOT, 'src/utils/procurementPlannerUx.js')).href)

assert(
  'runtime formula constant',
  PLANNER_SENSE_FORMULA === 'Рек. = max(0, round(Ср/день × Норма − Остаток*))'
)
assert(
  'period date format DD.MM.YYYY',
  formatPlannerPeriodDateRu('2026-06-23') === '23.06.2026'
)

const sense = buildPlannerSenseLine({
  periodFrom: '2026-06-23',
  periodTo: '2026-08-17',
  orderableCount: 42,
  supplierOrderableCount: 7,
})
assert(
  'sense period text',
  sense.periodText === 'Период: 23.06.2026–17.08.2026'
)
assert('sense orderable text', sense.orderableText === 'К заказу: 42')
assert(
  'sense optional supplier fragment',
  sense.orderableSupplierText === 'у поставщика: 7'
)
assert(
  'sense joined text includes formula',
  sense.text.includes(PLANNER_SENSE_FORMULA) && sense.text.includes('К заказу: 42')
)

const noPeriod = buildPlannerSenseLine({ orderableCount: 0 })
assert(
  'sense without period still has formula + к заказу',
  noPeriod.periodText == null &&
    noPeriod.text.includes(PLANNER_SENSE_FORMULA) &&
    noPeriod.orderableText === 'К заказу: 0'
)

console.log(`\n${checks}/${checks} checks passed`)
