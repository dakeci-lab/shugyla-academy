#!/usr/bin/env node
/**
 * Verification — planning by supplier visit days (stage 23): the plan bar, the service calls, the planner wiring
 * and the shape of the migrations. The SQL itself was checked on prod data (docs/db/stage-23-visit-plan/).
 *
 * Usage:
 *   npm run verify:procurement-visit-plan
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const math = await import(pathToFileURL(path.join(ROOT, 'src/utils/procurementPlanningMath.js')).href)
assert.equal(math.reserveHighlightFromStatus('under_norm'), 'below-norm')
assert.equal(math.reserveHighlightFromStatus('over_norm'), 'above-norm')
assert.equal(math.reserveHighlightFromStatus('on_norm'), null)
assert.equal(math.reserveHighlightFromStatus('no_demand'), null)
assert.equal(math.reserveHighlightFromStatus(null), null)
ok('«Запас/дн» highlight follows the server status (under → below, over → above, otherwise none)')

const fnSql = read('supabase/migrations/20261025120000_visit_plan_functions.sql')
assert.match(fnSql, /target = lead \+ cycle|\(v_delivery - p_today\)::int \+ v_cycle \* \(1 \+ v_skip\) \+ v_safety/)
assert.match(fnSql, /po\.status not in \('cancelled', 'received'\)\s*\n\s*and po\.expected_delivery_date >= v_today/)
assert.match(fnSql, /i\.manual_override or i\.generated_purchase_order_id is not null/)
assert.match(fnSql, /'default_cycle'/)
assert.match(fnSql, /v_cycle := 7;/)
ok('SQL: target = days to delivery + cycle×(1+skip) + safety; in transit = open orders not yet past their delivery date; manual / ordered quantities kept; no days → 7-day cycle')

const cutSql = read('supabase/migrations/20261025130000_visit_plan_cutover.sql')
assert.match(cutSql, /add column if not exists plan_status text/)
assert.match(fnSql, /plan_status = c\.status/)
assert.match(read('src/services/procurementPlanningService.js'), /\.eq\('plan_status', reserveStatus\)/)
assert.match(cutSql, /when \(new\.status = 'ready' and old\.status is distinct from 'ready'\)/)
assert.match(cutSql, /get_procurement_snapshot_stock_health/)
ok('cutover migration: plan_status column (reserve_status left for the norm removal), plan computed when a snapshot becomes ready, stock-health from plan_status')

const service = read('src/services/procurementPlanningService.js')
assert.match(service, /rpc\('procurement_supplier_plan'/)
assert.match(service, /rpc\('procurement_plan_supplier'/)
ok('service reads and saves the supplier plan through the two RPCs')

const bar = read('src/components/procurement/ProcurementSupplierPlanBar.jsx')
assert.match(bar, /Пропускаем визит/)
assert.match(bar, /дни заказа и доставки не заполнены|Дни заказа и доставки не заполнены/)
assert.match(bar, /до минимума не хватает/)
ok('plan bar: skip a visit, «дни не заполнены, цикл 7 дней» note, minimum order shortfall')

const planner = read('src/components/procurement/ProcurementPlannerView.jsx')
assert.match(planner, /<ProcurementSupplierPlanBar/)
assert.match(planner, /fetchProcurementSupplierPlan\(snapshot\.id, supplierId\)/)
assert.match(planner, /setDeliveryDate\(plan\.deliveryDate\)/)
assert.doesNotMatch(planner, /compareReserveDaysToNorm/)
ok('planner shows the plan bar for the selected supplier and creates the order with the plan delivery date')

console.log(`\nverify:procurement-visit-plan — ${checks} checks passed`)
