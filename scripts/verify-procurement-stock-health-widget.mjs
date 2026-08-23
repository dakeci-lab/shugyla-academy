#!/usr/bin/env node
/**
 * Verification for the planner's stock-health KPI widget (retail 80/10/10
 * standard, ties into buyer KPI/bonus).
 *
 * Usage:
 *   npm run verify:procurement-stock-health-widget
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

function assert(label, condition, detail = '') {
  checks += 1
  if (!condition) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  console.log(`  ✓ ${label}`)
}

const ux = await import(pathToFileURL(path.join(ROOT, 'src/utils/procurementPlannerUx.js')).href)
const serviceSrc = read('src/services/procurementPlanningService.js')
const widgetSrc = read('src/components/procurement/ProcurementStockHealthWidget.jsx')
const plannerSrc = read('src/components/procurement/ProcurementPlannerView.jsx')
const plannerCss = read('src/components/procurement/ProcurementPlannerView.css')
const migrationSrc = read('supabase/migrations/20260824090000_procurement_snapshot_stock_health.sql')

// ---------------------------------------------------------------------------
// Pure math — buildStockHealthSummary / STOCK_HEALTH_TARGET
// ---------------------------------------------------------------------------

assert('STOCK_HEALTH_TARGET is 80/10/10', ux.STOCK_HEALTH_TARGET.onNorm === 80 && ux.STOCK_HEALTH_TARGET.overNorm === 10 && ux.STOCK_HEALTH_TARGET.underNorm === 10)

assert('null stockHealth -> null summary', ux.buildStockHealthSummary(null) === null)
assert('zero total -> null summary (nothing to show)', ux.buildStockHealthSummary({ total: 0, noDemand: 0, underNorm: 0, onNorm: 0, overNorm: 0 }) === null)

{
  // 100 total, 20 no-demand -> rated = 80. 64 on, 8 over, 8 under -> 80%/10%/10% exactly on target.
  const summary = ux.buildStockHealthSummary({ total: 100, noDemand: 20, onNorm: 64, overNorm: 8, underNorm: 8 })
  assert('rated denominator excludes noDemand', summary.rated === 80)
  const onNorm = summary.buckets.find((b) => b.key === 'onNorm')
  const overNorm = summary.buckets.find((b) => b.key === 'overNorm')
  const underNorm = summary.buckets.find((b) => b.key === 'underNorm')
  assert('onNorm at exactly 80% is on target', onNorm.pct === 80 && onNorm.isOffTarget === false)
  assert('overNorm at exactly 10% is on target', overNorm.pct === 10 && overNorm.isOffTarget === false)
  assert('underNorm at exactly 10% is on target', underNorm.pct === 10 && underNorm.isOffTarget === false)
  assert('noDemand percentage is of the full total, not rated', summary.noDemand.pct === 20)
}

{
  // Owner's own example: overstock worse than standard, understock fine.
  const summary = ux.buildStockHealthSummary({ total: 100, noDemand: 5, onNorm: 74, overNorm: 12, underNorm: 9 })
  const overNorm = summary.buckets.find((b) => b.key === 'overNorm')
  const underNorm = summary.buckets.find((b) => b.key === 'underNorm')
  const onNorm = summary.buckets.find((b) => b.key === 'onNorm')
  assert('overstock above 10% is flagged off-target', overNorm.isOffTarget === true && overNorm.deviation > 0)
  assert('understock at/under 10% is not flagged', underNorm.isOffTarget === false)
  assert('onNorm below 80% (a minimum) is flagged off-target', onNorm.isOffTarget === true && onNorm.deviation < 0)
}

assert(
  'all-no-demand snapshot has zero rated buckets, not a divide-by-zero',
  (() => {
    const summary = ux.buildStockHealthSummary({ total: 10, noDemand: 10, onNorm: 0, overNorm: 0, underNorm: 0 })
    return summary.rated === 0 && summary.buckets.every((b) => b.pct === 0)
  })()
)

// ---------------------------------------------------------------------------
// Service layer
// ---------------------------------------------------------------------------

assert(
  'fetchProcurementSnapshotStockHealth calls the RPC by name',
  serviceSrc.includes('export async function fetchProcurementSnapshotStockHealth') &&
    serviceSrc.includes("supabase.rpc('get_procurement_snapshot_stock_health'")
)
assert(
  'service short-circuits without a snapshot id (no wasted RPC call)',
  /fetchProcurementSnapshotStockHealth\(snapshotId\) \{\s*\n\s*ensureClient\(\)\s*\n\s*if \(!snapshotId\) return null/.test(
    serviceSrc
  )
)

// ---------------------------------------------------------------------------
// Widget component
// ---------------------------------------------------------------------------

assert('widget renders nothing until stockHealth resolves to a summary', widgetSrc.includes('if (!summary) return null'))
assert('widget uses buildStockHealthSummary from the shared ux module', widgetSrc.includes('buildStockHealthSummary'))
assert('widget shows all three buckets plus the no-demand bucket', ['onNorm', 'overNorm', 'underNorm', 'no-demand'].every((key) => widgetSrc.includes(key)))
assert('off-target values get a distinct class for styling', widgetSrc.includes('is-off-target'))
assert('bar has an accessible text alternative (role=img + aria-label)', widgetSrc.includes('role="img"') && widgetSrc.includes('aria-label='))

// ---------------------------------------------------------------------------
// CSS — exact shades from the owner's screenshot
// ---------------------------------------------------------------------------

assert(
  'overstock (red) and understock (green) use the owner-supplied hex shades',
  plannerCss.includes('#f6bcbc') && plannerCss.includes('#c2ecd0')
)
assert('stock-health block styles exist', plannerCss.includes('.proc-stock-health'))

// ---------------------------------------------------------------------------
// Wiring into the planner
// ---------------------------------------------------------------------------

assert(
  'planner imports and renders the widget',
  plannerSrc.includes("import ProcurementStockHealthWidget from './ProcurementStockHealthWidget'") &&
    plannerSrc.includes('<ProcurementStockHealthWidget')
)
assert(
  'stock health loads alongside the snapshot, not blocking the plan on failure',
  /try \{\s*\n\s*setStockHealth\(await fetchProcurementSnapshotStockHealth\(snap\.id\)\)\s*\n\s*\} catch \(healthErr\)/.test(
    plannerSrc
  )
)
assert('stock health resets when leaving cloud mode or losing the snapshot', (plannerSrc.match(/setStockHealth\(null\)/g) || []).length >= 2)

// ---------------------------------------------------------------------------
// Migration — matches the client-side math exactly, no new privilege surface
// ---------------------------------------------------------------------------

assert(
  'migration not security definer (authenticated already has SELECT on the table)',
  !/security definer/i.test(migrationSrc.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'))
)
assert('migration bucket boundaries mirror calcReserveDays/compareReserveDaysToNorm', /round\(i\.calculation_stock \/ i\.avg_daily\)/.test(migrationSrc))

console.log(`\n${checks}/${checks} checks passed\n`)
