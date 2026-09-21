#!/usr/bin/env node
/**
 * Verifies the "Соответствие норме запаса" bucket drill-down: clicking a
 * bucket filters the existing Планирование table via a new generated
 * `reserve_status` column, instead of opening a new query path or list
 * component (owner-approved Option B — see the prototype conversation).
 *
 * Usage:
 *   npm run verify:procurement-reserve-status-drilldown
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

function findMigration() {
  const dir = path.join(ROOT, 'supabase/migrations')
  const match = fs
    .readdirSync(dir)
    .find((name) => name.includes('procurement_snapshot_items_reserve_status'))
  if (!match) fail('reserve_status migration file not found in supabase/migrations')
  return `supabase/migrations/${match}`
}

const BUCKET_VALUES = ['no_demand', 'under_norm', 'on_norm', 'over_norm']

function stageMigration() {
  console.log('Stage 1: migration adds a correct, immutable generated column')

  const sql = read(findMigration())

  assert('adds reserve_status as a column', /add column if not exists reserve_status text/i.test(sql))
  assert('column is a stored generated column', /generated always as \(/i.test(sql) && /\)\s*stored/i.test(sql))
  assert('no_demand branch matches avg_daily <= 0', /when avg_daily <= 0 then 'no_demand'/.test(sql))
  assert(
    'under_norm branch matches the ±20% tolerance predicate',
    /round\(calculation_stock \/ avg_daily\) < norm_days \* 0\.8 then 'under_norm'/.test(sql)
  )
  assert(
    'over_norm branch matches the ±20% tolerance predicate',
    /round\(calculation_stock \/ avg_daily\) > norm_days \* 1\.2 then 'over_norm'/.test(sql)
  )
  assert('falls through to on_norm', /else 'on_norm'/.test(sql))
  assert('creates a (snapshot_id, reserve_status) index', /create index if not exists idx_psi_snapshot_reserve_status/.test(sql))
  assert('sets a lock_timeout before the rewrite', /set lock_timeout/.test(sql))
  assert('sets a statement_timeout before the rewrite', /set statement_timeout/.test(sql))

  console.log('')
}

function stageService() {
  console.log('Stage 2: procurementPlanningService.js threads reserveStatus through')

  const src = read('src/services/procurementPlanningService.js')

  assert(
    'exports RESERVE_STATUS_VALUES with the exact four bucket values',
    BUCKET_VALUES.every((v) => src.includes(`'${v}'`)) && src.includes('export const RESERVE_STATUS_VALUES')
  )
  assert('fetchSnapshotItemsPage accepts reserveStatus', /fetchSnapshotItemsPage\(\{[\s\S]{0,400}reserveStatus = ''/.test(src))
  assert('fetchSnapshotItemsPage forwards reserveStatus to applySnapshotItemsPageQuery', /applySnapshotItemsPageQuery\(query, \{[\s\S]{0,300}reserveStatus,/.test(src))
  assert('applySnapshotItemsPageQuery accepts reserveStatus', /applySnapshotItemsPageQuery\(query, \{[\s\S]{0,400}reserveStatus = ''/.test(src))
  assert(
    'applySnapshotItemsPageQuery filters by reserve_status only against the whitelist',
    /\} else if \(reserveStatus && RESERVE_STATUS_VALUES\.includes\(reserveStatus\)\) \{[\s\S]{0,200}query = query\.eq\('reserve_status', reserveStatus\)\.eq\('negative_stock', false\)/.test(src)
  )

  console.log('')
}

function stageTreeMode() {
  console.log('Stage 3: an active bucket filter forces the flat (non-tree) list')

  const ux = read('src/utils/procurementPlannerUx.js')
  assert(
    'isPlannerTreeViewMode takes reserveStatus and treats it like search/abcSortField',
    /isPlannerTreeViewMode\(\{ search = '', abcSortField = '', reserveStatus = '' \} = \{\}\) \{\s*\n\s*return !String\(search \|\| ''\)\.trim\(\) && !abcSortField && !reserveStatus/.test(
      ux
    )
  )

  const planner = read('src/components/procurement/ProcurementPlannerView.jsx')
  const callSites = (planner.match(/isPlannerTreeViewMode\(\{/g) || []).length
  assert('planner calls isPlannerTreeViewMode at least 3 times (initial render, loadItems, tree-reset effect)', callSites >= 3)
  const reserveStatusPassed = (planner.match(/reserveStatus: filters\.reserveStatus/g) || []).length
  assert('every one of those call sites passes filters.reserveStatus', reserveStatusPassed >= callSites)
  assert('tree state resets when the bucket filter changes', /filters\.reserveStatus,\s*\n\s*filters\.abcQty/.test(planner))

  console.log('')
}

function stageWidget() {
  console.log('Stage 4: widget buckets are real, clickable, keyboard-accessible buttons')

  const widget = read('src/components/procurement/ProcurementStockHealthWidget.jsx')

  assert('widget accepts activeBucket and onBucketClick props', widget.includes('activeBucket = null') && widget.includes('onBucketClick = null'))
  assert('bar segments are <button> elements, not decorative spans', /<button[\s\S]{0,200}proc-stock-health__bar-seg/.test(widget))
  assert('legend cards are <button> elements', /<button[\s\S]{0,200}proc-stock-health__legend-item/.test(widget))
  assert('the widget only shows the three rated buckets; no-sales / negative-stock moved to the toolbar «Фильтр» (2026-09-21)', !widget.includes("key: 'noDemand'") && !widget.includes("key: 'negativeStock'") && !widget.includes('proc-stock-health__excluded'))
  const plannerSrc = read('src/components/procurement/ProcurementPlannerView.jsx')
  assert('the toolbar «Фильтр» offers «Нет продаж 8 нед.» and «Отрицательный остаток» as reserve-status filters', plannerSrc.includes("value: 'no_demand'") && plannerSrc.includes("value: 'negative_stock'") && plannerSrc.includes('QUICK_RESERVE_EXTRAS'))
  assert('active bucket gets an is-active class', widget.includes("' is-active'"))
  assert('non-active buckets get dimmed while one is selected', widget.includes("' is-dimmed'"))
  assert('buttons are disabled (not just inert) when no onBucketClick handler is given', widget.includes('disabled={!clickable}'))

  console.log('')
}

function stagePlannerWiring() {
  console.log('Stage 5: planner wires the widget to the reserve_status filter')

  const planner = read('src/components/procurement/ProcurementPlannerView.jsx')

  assert("filters state initializes reserveStatus: ''", /reserveStatus: '',/.test(planner))
  assert(
    'RESERVE_STATUS_BY_BUCKET maps every widget key to the exact migration bucket values',
    BUCKET_VALUES.every((v) => planner.includes(`'${v}'`)) && planner.includes('RESERVE_STATUS_BY_BUCKET')
  )
  assert(
    'clicking an already-active bucket clears the filter (toggle, not a one-way switch)',
    /reserveStatus: current\.reserveStatus === value \? '' : value/.test(planner)
  )
  assert('widget receives activeBucket and onBucketClick from the planner', planner.includes('activeBucket={activeReserveBucket}') && planner.includes('onBucketClick={handleStockHealthBucketClick}'))
  assert('an active bucket filter shows a visible, clearable indicator in the toolbar', planner.includes('proc-planner__reserve-filter') && planner.includes('Сбросить фильтр'))

  const css = read('src/components/procurement/ProcurementPlannerView.css')
  assert('reserve-filter indicator has styles', css.includes('.proc-planner__reserve-filter'))
  assert('bar-seg buttons have a hover/focus/active treatment, not bare backgrounds', css.includes('.proc-stock-health__bar-seg:hover') || css.includes(':not(:disabled):hover'))

  console.log('')
}

function main() {
  try {
    stageMigration()
    stageService()
    stageTreeMode()
    stageWidget()
    stagePlannerWiring()
    console.log(`=== All ${testsPassed}/${testsRun} checks passed ===`)
  } catch (err) {
    console.error(`\n✗ FAILED after ${testsPassed}/${testsRun} checks: ${err.message}`)
    process.exitCode = 1
  }
}

main()
