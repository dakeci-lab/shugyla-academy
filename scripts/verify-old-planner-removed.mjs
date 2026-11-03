import assert from 'node:assert/strict'
import fs from 'node:fs'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(`../${p}`, import.meta.url))

for (const f of [
  'src/pages/platform/procurement/ProcurementPage.jsx',
  'src/components/procurement/ProcurementPlannerView.jsx',
  'src/components/procurement/ProcurementPlannerView.css',
  'src/components/procurement/ProcurementStockHealthWidget.jsx',
]) assert.equal(exists(f), false, f)
ok('the old planner page, view and stock-health widget are deleted')

const app = read('src/App.jsx')
assert.doesNotMatch(app, /ProcurementPage\b/)
assert.match(app, /path="procurement\/plan" element=\{<Navigate to="\/platform\/procurement" replace \/>\}/)
ok('/procurement/plan redirects to the documents list')

const edge = read('supabase/functions/umag-procurement/index.ts')
assert.doesNotMatch(edge, /generate_procurement_orders_from_snapshot|handleGenerate/)
assert.match(edge, /action !== 'sync' && action !== 'refresh-supplier-stock'/)
ok('Edge Function umag-procurement keeps only «sync» and «refresh-supplier-stock» (no order generation from a snapshot)')

const service = read('src/services/procurementPlanningService.js')
assert.doesNotMatch(service, /generateProcurementOrders|updateItemFinalOrderQty|updateSnapshotItemPlanning|resetItemToRecommendation/)
ok('no service writes snapshot quantities or generates orders from a snapshot')

assert.ok(exists('docs/db/stage-27-remove-old-planner/README.md'))
ok('stage 27 document exists (SQL for the owner, what must NOT be dropped)')

console.log(`\nverify:old-planner-removed — ${checks} checks passed`)
