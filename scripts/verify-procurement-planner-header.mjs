#!/usr/bin/env node
/**
 * PR A compact cleanup / leftover P1 header checks (sense removed).
 *
 * Usage:
 *   npm run verify:procurement-planner-header
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

assert('sense-line removed from UI', !planner.includes('proc-planner__sense'))
assert('sense helper removed from ux', !uxSrc.includes('buildPlannerSenseLine'))
assert('UMAG snapshot strip kept', planner.includes('proc-planner__snapshot') && planner.includes('buildSnapshotHeadline'))
assert(
  'toolbar orderable toggle kept',
  planner.includes('proc-planner__orderable-toggle') &&
    planner.includes('Только к заказу') &&
    /orderableOnly:\s*!current\.orderableOnly/.test(planner)
)
assert(
  'advanced checkbox still wired to same orderableOnly',
  /checked=\{filters\.orderableOnly\}/.test(planner)
)
assert('on-screen ABC legend removed', !planner.includes('proc-planner__abc-legend'))
assert(
  'ABC column help icon present',
  planner.includes('AbcColumnHelp') &&
    planner.includes('ABC_COLUMN_HELP') &&
    planner.includes('proc-planner__abc-help')
)
assert(
  'ABC help CSS present',
  plannerCss.includes('.proc-planner__abc-help')
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
assert('browse mode removed', !planner.includes('proc-planner__browse-mode'))
assert('cat-nav removed', !planner.includes('proc-planner__cat-nav'))
assert(
  'SKU category subtitle removed',
  !/className="proc-planner__cat"/.test(planner)
)

console.log(`\n${checks}/${checks} checks passed`)
