#!/usr/bin/env node
/**
 * Verification for the planner's stock-health widget: the current share of
 * «Точно / Перезатарка / Недостаток» on a 100% scale (2026-09-21: no fixed
 * 80/10/10 standard shown; no-sales and negative-stock SKUs sit outside the
 * calculation).
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
// Pure math — buildStockHealthSummary
// ---------------------------------------------------------------------------

const bucketOf = (summary, key) => summary.buckets.find((b) => b.key === key)
const sumPct = (summary) => Math.round(summary.buckets.reduce((acc, b) => acc + b.pct, 0) * 10) / 10

assert('null stockHealth -> null summary', ux.buildStockHealthSummary(null) === null)
assert('zero total -> null summary (nothing to show)', ux.buildStockHealthSummary({ total: 0, noDemand: 0, underNorm: 0, onNorm: 0, overNorm: 0 }) === null)
assert('no fixed 80/10/10 standard is exported any more', ux.STOCK_HEALTH_TARGET === undefined)

{
  // Last production snapshot (2026-09-21): 8209 SKU, 1011 no sales, 616 on / 3155 over / 3427 under.
  const summary = ux.buildStockHealthSummary({ total: 8209, noDemand: 1011, onNorm: 616, overNorm: 3155, underNorm: 3427 })
  assert('rated = everything except the no-sales group', summary.rated === 7198)
  assert('the three shares add up to exactly 100%', sumPct(summary) === 100)
  assert('shares are of the rated SKUs (8,6 / 43,8 / 47,6)', bucketOf(summary, 'onNorm').pct === 8.6 && bucketOf(summary, 'overNorm').pct === 43.8 && bucketOf(summary, 'underNorm').pct === 47.6)
  assert('no-sales group is reported as a count, not a percentage', summary.excluded.noDemand.count === 1011 && summary.excluded.noDemand.pct === undefined)
}

{
  // Negative stock is an accounting error: out of the three shares, shown on its own.
  const summary = ux.buildStockHealthSummary({
    total: 100,
    noDemand: 10,
    onNorm: 20,
    overNorm: 30,
    underNorm: 40,
    negative: { noDemand: 1, underNorm: 10, onNorm: 0, overNorm: 0 },
  })
  assert('negative-stock rows leave the under-norm bucket', bucketOf(summary, 'underNorm').count === 30)
  assert('negative-stock rows leave the no-sales group too', summary.excluded.noDemand.count === 9)
  assert('negative-stock group counts all of them once', summary.excluded.negative.count === 11)
  assert('rated is what is left after both exclusions', summary.rated === 80)
  assert('shares still add up to 100% (25 / 37,5 / 37,5)', sumPct(summary) === 100 && bucketOf(summary, 'onNorm').pct === 25 && bucketOf(summary, 'overNorm').pct === 37.5)
}

{
  // Largest remainder: three equal thirds must still add to 100,0, not 99,9.
  const summary = ux.buildStockHealthSummary({ total: 3, noDemand: 0, onNorm: 1, overNorm: 1, underNorm: 1 })
  assert('thirds add up to 100% (no 99,9)', sumPct(summary) === 100)
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
  'negative-stock rows are counted per server bucket and passed to the summary',
  ['no_demand', 'under_norm', 'on_norm', 'over_norm'].every((status) => serviceSrc.includes(`negativeCount('${status}')`)) &&
    serviceSrc.includes('negative: { noDemand: negNoDemand')
)
assert(
  'the table filter keeps negative-stock rows out of the four buckets and has its own group',
  serviceSrc.includes("export const NEGATIVE_STOCK_FILTER = 'negative_stock'") &&
    serviceSrc.includes(".eq('reserve_status', reserveStatus).eq('negative_stock', false)") &&
    serviceSrc.includes("query = query.eq('negative_stock', true)")
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

assert(
  'widget renders nothing (or a skeleton while loading) until stockHealth resolves to a summary',
  widgetSrc.includes('if (!summary) return loading ? <StockHealthSkeleton /> : null')
)
assert('widget uses buildStockHealthSummary from the shared ux module', widgetSrc.includes('buildStockHealthSummary'))
assert('widget shows the three rated buckets only, each card under its own bar segment', ['onNorm', 'overNorm', 'underNorm'].every((key) => widgetSrc.includes(key)) && widgetSrc.includes("'--legend-cols'") && !widgetSrc.includes('noDemand'))
assert('no-sales and negative-stock groups are picked in the planner toolbar «Фильтр»', plannerSrc.includes('Нет продаж 8 нед.') && plannerSrc.includes('Отрицательный остаток') && plannerSrc.includes('stockHealthExcluded'))
assert('widget shows no standard / deviation labels', !widgetSrc.includes('стандарт') && !widgetSrc.includes('is-off-target'))
assert('the group without sales is not called «Нет данных» anywhere', !widgetSrc.includes('Нет данных') && !plannerSrc.includes("'Нет данных'") && plannerSrc.includes('Нет продаж 8 нед.'))
assert('bar has an accessible text alternative (role=img + aria-label)', widgetSrc.includes('role="img"') && widgetSrc.includes('aria-label='))

// ---------------------------------------------------------------------------
// CSS — exact shades from the owner's screenshot
// ---------------------------------------------------------------------------

assert(
  'bucket dots use the exact hex codes from the "К оплате" KPI tiles (SupplierFinancePanel.css)',
  plannerCss.includes('#ffae1e') && plannerCss.includes('#f61046') && plannerCss.includes('#2cbe60')
)
assert(
  'bar segments use the same hues softened toward white, not the full-strength dot colors',
  plannerCss.includes('#ffbe4b') && plannerCss.includes('#f8406b') && plannerCss.includes('#56cb80')
)
assert('stock-health block styles exist', plannerCss.includes('.proc-stock-health'))
assert(
  'bar segments and legend cards are real buttons, not decorative spans',
  widgetSrc.includes('<button') && plannerCss.includes('.proc-stock-health__bar-seg {')
)

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
