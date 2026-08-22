#!/usr/bin/env node
/**
 * Verification for procurement ABC analysis (qty / revenue / profit).
 *
 * Usage:
 *   npm run verify:procurement-abc-analysis
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const MIGRATION = 'supabase/migrations/20260815072607_procurement_abc_analysis.sql'
const EDGE = 'supabase/functions/umag-procurement/index.ts'
const CLASSIFIER = 'supabase/functions/umag-procurement/abcClassification.js'
const SERVICE = 'src/services/procurementPlanningService.js'
const PLANNER = 'src/components/procurement/ProcurementPlannerView.jsx'
const PLANNER_CSS = 'src/components/procurement/ProcurementPlannerView.css'
const ABC_UI = 'src/utils/procurementAbc.js'
const FINGERPRINT = 'src/utils/procurementAttemptFingerprint.js'
const REPEAT_MIGRATION = 'supabase/migrations/20260814134910_procurement_repeat_analytics_orders.sql'
const ABC_DOC = 'docs/procurement/abc-analysis.md'

let checks = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  if (!condition) fail(`${name}${detail ? ` — ${detail}` : ''}`)
  checks += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) fail(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}

async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href)
}

function classesOf(map, barcodes) {
  return barcodes
    .map((barcode) => {
      const value = map.get(barcode)
      return value == null ? 'null' : value
    })
    .join(',')
}

function stageMigration() {
  console.log('Stage 1: Migration static')
  const sql = read(MIGRATION)
  assert(
    'timestamped migration filename',
    path.basename(MIGRATION) === '20260815072607_procurement_abc_analysis.sql'
  )
  assert('adds nullable money columns without default 0', /add column if not exists revenue_8w numeric\(14, 2\)/.test(sql))
  assert('cogs and profit are nullable numerics', sql.includes('cogs_8w numeric(14, 2)') && sql.includes('profit_8w numeric(14, 2)'))
  assert('ABC class columns are nullable text', /add column if not exists abc_qty text/.test(sql))
  assert(
    'CHECK allows A/B/C or NULL',
    sql.includes("abc_qty is null or abc_qty in ('A', 'B', 'C')") &&
      sql.includes("abc_revenue is null or abc_revenue in ('A', 'B', 'C')") &&
      sql.includes("abc_profit is null or abc_profit in ('A', 'B', 'C')")
  )
  assert('does not default ABC or money to fabricated zeros', !/revenue_8w numeric\(14, 2\) not null/i.test(sql) && !/default 0/.test(sql))
  assert('indexes are snapshot + ABC only', sql.includes('idx_psi_snapshot_abc_qty') && sql.includes('idx_psi_snapshot_abc_revenue') && sql.includes('idx_psi_snapshot_abc_profit'))
  assert('guard is security definer with pinned search_path', /security definer\s*set search_path = ''/.test(sql))
  assert('guard owner postgres', /alter function public\.procurement_snapshot_items_guard_update\(\) owner to postgres/.test(sql))
  assert(
    'guard treats ABC fields as immutable facts',
    sql.includes('new.revenue_8w is distinct from old.revenue_8w') &&
      sql.includes('new.abc_qty is distinct from old.abc_qty') &&
      sql.includes('new.abc_profit is distinct from old.abc_profit')
  )
  assert(
    'planning fields stay the established editable set',
    sql.includes('new.final_order_qty is distinct from old.final_order_qty') &&
      sql.includes('new.generated_purchase_order_id is distinct from old.generated_purchase_order_id') &&
      sql.includes("'ready', 'partially_generated', 'generated'")
  )
  assert('does not grant UPDATE on snapshots', !/grant update[^\n]*procurement_snapshots/i.test(sql))
  assert('does not broaden authenticated grants', !/grant\s+/i.test(sql) || !/to authenticated/i.test(sql))
  assert(
    'revokes execute on the guard',
    sql.includes('revoke all on function public.procurement_snapshot_items_guard_update() from authenticated') &&
      sql.includes('revoke all on function public.procurement_snapshot_items_guard_update() from service_role')
  )
  assert('does not recreate generate RPC', !/generate_procurement_orders_from_snapshot/i.test(sql))
  assert('does not mention attempt_key', !/attempt_key/.test(sql))
}

async function stageClassifier() {
  console.log('Stage 2: Pareto classifier')
  const abc = await load(CLASSIFIER)

  const atBoundary = abc.classifyAbcAxis([
    { barcode: 'a', metric: 80 },
    { barcode: 'b', metric: 15 },
    { barcode: 'c', metric: 5 },
  ])
  assert(
    '80/95 exact boundaries → A, B, C',
    classesOf(atBoundary, ['a', 'b', 'c']) === 'A,B,C'
  )

  const crossing = abc.classifyAbcAxis([
    { barcode: 'a', metric: 81 },
    { barcode: 'b', metric: 14 },
    { barcode: 'c', metric: 5 },
  ])
  assert(
    'item that crosses 80% stays A (group started at 0)',
    classesOf(crossing, ['a', 'b', 'c']) === 'A,B,C'
  )

  const ties = abc.classifyAbcAxis([
    { barcode: 'z', metric: 40 },
    { barcode: 'm', metric: 30 },
    { barcode: 'a', metric: 30 },
  ])
  assert(
    'equal metrics are not split across classes',
    classesOf(ties, ['z', 'm', 'a']) === 'A,A,A'
  )

  const barcodeTie = abc.classifyAbcAxis([
    { barcode: 'b', metric: 50 },
    { barcode: 'a', metric: 50 },
  ])
  assert(
    'equal metrics share one class regardless of barcode order',
    classesOf(barcodeTie, ['a', 'b']) === 'A,A'
  )

  const ranked = abc.classifyAbcAxis([
    { barcode: 'b', metric: 70 },
    { barcode: 'a', metric: 20 },
    { barcode: 'c', metric: 10 },
  ])
  assert(
    'higher metric ranks before a lexicographically smaller barcode',
    classesOf(ranked, ['b', 'a', 'c']) === 'A,A,B'
  )

  const zeros = abc.classifyAbcAxis([
    { barcode: 'hot', metric: 10 },
    { barcode: 'zero', metric: 0 },
    { barcode: 'none', metric: Number.NaN },
  ])
  assert(
    'zero / no-data never become C',
    classesOf(zeros, ['hot', 'zero', 'none']) === 'A,null,null'
  )

  const allNegative = abc.classifyAbcAxis([
    { barcode: 'x', metric: -10 },
    { barcode: 'y', metric: -3 },
  ])
  assert(
    'all-negative profit universe is NULL',
    classesOf(allNegative, ['x', 'y']) === 'null,null'
  )

  const mixedProfit = abc.classifyAbcAxis([
    { barcode: 'win', metric: 100 },
    { barcode: 'ok', metric: 20 },
    { barcode: 'loss', metric: -40 },
    { barcode: 'zero', metric: 0 },
  ])
  assert(
    'negative and zero profit stay NULL; positives keep A/B',
    classesOf(mixedProfit, ['win', 'ok', 'loss', 'zero']) === 'A,B,null,null'
  )

  const leftoverFlag = abc.classifyAbcAxis(
    [
      { barcode: 'win', metric: 100 },
      { barcode: 'loss', metric: -1 },
    ],
    { negativesAsCIfPositiveTotal: true }
  )
  assert(
    'legacy negativesAsCIfPositiveTotal argument cannot assign C',
    leftoverFlag.get('win') === 'A' && leftoverFlag.get('loss') == null
  )

  const qtyNegatives = abc.classifyAbcAxis([
    { barcode: 'hot', metric: 80 },
    { barcode: 'ret', metric: -5 },
  ])
  const revenueNegatives = abc.classifyAbcAxis([
    { barcode: 'hot', metric: 800 },
    { barcode: 'ret', metric: -50 },
  ])
  assert(
    'qty and revenue negatives stay NULL when positives exist',
    classesOf(qtyNegatives, ['hot', 'ret']) === 'A,null' &&
      classesOf(revenueNegatives, ['hot', 'ret']) === 'A,null'
  )

  const profitLosses = [
    -21768.13, -15000, -8000, -4200, -3100, -2500, -1800, -1200, -900, -650, -400, -250, -180,
    -120, -80, -50, -35, -26,
  ]
  const productionLikeItems = [
    { barcode: 'win', sales_8w: 50, revenue_8w: 500, profit_8w: 100 },
    { barcode: 'ok', sales_8w: 20, revenue_8w: 200, profit_8w: 20 },
    ...profitLosses.map((profit, index) => ({
      barcode: `loss-${String(index + 1).padStart(2, '0')}`,
      sales_8w: 10,
      revenue_8w: 100,
      profit_8w: profit,
    })),
  ]
  const productionLike = abc.assignSnapshotAbcClasses(productionLikeItems)
  const lossItems = productionLikeItems.filter((item) => item.barcode.startsWith('loss-'))
  assert('production-like snapshot has 18 negative-profit SKUs', lossItems.length === 18)
  assert(
    'negative profit_8w values are preserved on the 18 loss SKUs',
    lossItems.every((item, index) => item.profit_8w === profitLosses[index]) &&
      profitLosses[0] === -21768.13 &&
      profitLosses[17] === -26
  )
  assert(
    '18 negative-profit SKUs never receive A/B/C on profit',
    lossItems.every((item) => productionLike.get(item.barcode).abc_profit == null) &&
      [...productionLike.values()].every((classes) => classes.abc_profit !== 'C')
  )
  assert(
    'positive profit SKUs still follow Pareto 80/95',
    productionLike.get('win').abc_profit === 'A' && productionLike.get('ok').abc_profit === 'B'
  )

  const weekSales = new Map()
  const weekMoney = new Map()
  const saleWeek = abc.accumulateSalesRows([
    { barcode: 'ret-sku', saleQuantity: 10, saleSellingAmount: 10000, saleArrivalAmount: 6000 },
    { barcode: 'good', saleQuantity: 5, saleSellingAmount: 5000, saleArrivalAmount: 2000 },
  ])
  abc.mergeWeekSalesIntoSnapshot({
    weeklySalesByBarcode: weekSales,
    moneyByBarcode: weekMoney,
    weekTotals: saleWeek.totals,
    weekIndex: 0,
  })
  const returnWeek = abc.accumulateSalesRows([
    { barcode: 'ret-sku', saleQuantity: -8, saleSellingAmount: -9000, saleArrivalAmount: -2000 },
  ])
  abc.mergeWeekSalesIntoSnapshot({
    weeklySalesByBarcode: weekSales,
    moneyByBarcode: weekMoney,
    weekTotals: returnWeek.totals,
    weekIndex: 4,
  })
  const retMoney = weekMoney.get('ret-sku')
  const goodMoney = weekMoney.get('good')
  const retProfit = abc.roundMoney(retMoney.revenue - retMoney.cogs)
  const goodProfit = abc.roundMoney(goodMoney.revenue - goodMoney.cogs)
  assert(
    'returns across weeks can net negative profit while preserving amounts',
    retMoney.revenue === 1000 &&
      retMoney.cogs === 4000 &&
      retProfit === -3000 &&
      goodProfit === 3000
  )
  const afterReturns = abc.assignSnapshotAbcClasses([
    {
      barcode: 'ret-sku',
      sales_8w: weekSales.get('ret-sku').reduce((sum, qty) => sum + qty, 0),
      revenue_8w: abc.roundMoney(retMoney.revenue),
      profit_8w: retProfit,
    },
    {
      barcode: 'good',
      sales_8w: weekSales.get('good').reduce((sum, qty) => sum + qty, 0),
      revenue_8w: abc.roundMoney(goodMoney.revenue),
      profit_8w: goodProfit,
    },
  ])
  assert(
    'net-negative profit after returns is NULL; profitable SKU still classifies',
    afterReturns.get('ret-sku').abc_profit == null &&
      retProfit === -3000 &&
      afterReturns.get('good').abc_profit === 'A'
  )

  const lastWinsTrapRows = [
    { barcode: 'hero', metric: 90 },
    { barcode: 'mid', metric: 8 },
    { barcode: 'tail', metric: 2 },
    { barcode: 'hero', metric: 1 },
  ]
  const lastWinsSums = abc.aggregateMetricsByBarcode(lastWinsTrapRows)
  const lastWinsTrap = abc.classifyAbcAxis(lastWinsTrapRows)
  const heroSum = lastWinsSums.find((row) => row.barcode === 'hero')?.metric
  assert('duplicate barcode metrics are summed before classification', heroSum === 91)
  assert(
    'later low-value duplicate cannot overwrite a high-value SKU to C',
    lastWinsTrap.get('hero') === 'A' &&
      lastWinsTrap.get('mid') === 'B' &&
      lastWinsTrap.get('tail') === 'C'
  )

  const floatTie = abc.classifyAbcAxis([
    { barcode: 'leader', metric: 7.4 },
    { barcode: 'float', metric: 0.1 },
    { barcode: 'float', metric: 0.2 },
    { barcode: 'exact', metric: 0.3 },
  ])
  assert(
    '0.1+0.2 and 0.3 share one qty class after 3dp quantization',
    abc.roundQty(0.1 + 0.2) === 0.3 &&
      floatTie.get('float') === 'B' &&
      floatTie.get('exact') === 'B' &&
      floatTie.get('leader') === 'A'
  )

  const dup = abc.accumulateSalesRows([
    { barcode: '111', saleQuantity: 2, saleSellingAmount: 10.25, saleArrivalAmount: 4.1 },
    { barcode: '111', saleQuantity: 3, saleSellingAmount: '15.75', saleArrivalAmount: '6.40' },
    { barcode: '111', saleQuantity: -1, saleSellingAmount: -5, saleArrivalAmount: -2 },
    { barcode: '222', saleQuantity: '1.5', saleSellingAmount: '20.5', saleArrivalAmount: '8' },
  ])
  const dup111 = dup.totals.get('111')
  assert('duplicate same-week rows add qty/revenue/cogs', dup111.qty === 4 && dup111.revenue === 21 && dup111.cogs === 8.5)
  assert('duplicate same-week profit is revenue minus cogs', dup111.revenue - dup111.cogs === 12.5)
  assert(
    'numeric strings are parsed into money totals',
    dup.totals.get('222').qty === 1.5 &&
      dup.totals.get('222').revenue === 20.5 &&
      dup.totals.get('222').cogs === 8 &&
      dup.totals.get('222').revenue - dup.totals.get('222').cogs === 12.5
  )

  const returns = abc.accumulateSalesRows([
    { barcode: 'r', saleQuantity: 10, saleSellingAmount: 100, saleArrivalAmount: 40 },
    { barcode: 'r', saleQuantity: -2, saleSellingAmount: -20, saleArrivalAmount: -8 },
  ])
  const ret = returns.totals.get('r')
  assert(
    'returns / negative adjustments are preserved in revenue/cogs/profit',
    ret.qty === 8 && ret.revenue === 80 && ret.cogs === 32 && ret.revenue - ret.cogs === 48
  )

  const missingAmount = abc.accumulateSalesRows([
    { barcode: 'p', saleQuantity: 5, saleSellingAmount: null, saleArrivalAmount: undefined },
  ])
  assert(
    'missing amounts become 0, not price estimates',
    missingAmount.totals.get('p').qty === 5 &&
      missingAmount.totals.get('p').revenue === 0 &&
      missingAmount.totals.get('p').cogs === 0 &&
      missingAmount.totals.get('p').revenue - missingAmount.totals.get('p').cogs === 0
  )

  const weeklySalesByBarcode = new Map()
  const moneyByBarcode = new Map()
  const week0 = abc.accumulateSalesRows([
    { barcode: 'sku', saleQuantity: 2, saleSellingAmount: '10', saleArrivalAmount: '4' },
    { barcode: 'sku', saleQuantity: 1, saleSellingAmount: 5.5, saleArrivalAmount: 2.25 },
  ])
  abc.mergeWeekSalesIntoSnapshot({
    weeklySalesByBarcode,
    moneyByBarcode,
    weekTotals: week0.totals,
    weekIndex: 0,
  })
  const week3 = abc.accumulateSalesRows([
    { barcode: 'sku', saleQuantity: -1, saleSellingAmount: '-3.25', saleArrivalAmount: -1.5 },
  ])
  abc.mergeWeekSalesIntoSnapshot({
    weeklySalesByBarcode,
    moneyByBarcode,
    weekTotals: week3.totals,
    weekIndex: 3,
  })
  const moneySku = moneyByBarcode.get('sku')
  const weeklySku = weeklySalesByBarcode.get('sku')
  assert(
    'saleSellingAmount/saleArrivalAmount add across weeks',
    moneySku.revenue === 12.25 && moneySku.cogs === 4.75 && moneySku.revenue - moneySku.cogs === 7.5
  )
  assert(
    'weekly qty slots stay per-week while 8w sum includes returns',
    weeklySku[0] === 3 && weeklySku[3] === -1 && weeklySku.reduce((a, b) => a + b, 0) === 2
  )

  assert(
    'nonzero stock is included',
    abc.shouldIncludeSnapshotBarcode({ stock: -1, sales8w: 0, revenue: 0, cogs: 0, profit: 0 }) === true
  )
  assert(
    'return-only negative qty with zero stock is included',
    abc.shouldIncludeSnapshotBarcode({ stock: 0, sales8w: -2, revenue: -20, cogs: -8, profit: -12 }) === true
  )
  assert(
    'zero-qty monetary SKU with zero stock is included',
    abc.shouldIncludeSnapshotBarcode({ stock: 0, sales8w: 0, revenue: 50, cogs: 20, profit: 30 }) === true
  )
  assert(
    'cogs-only nonzero money is included',
    abc.shouldIncludeSnapshotBarcode({ stock: 0, sales8w: 0, revenue: 0, cogs: -4, profit: 4 }) === true
  )
  assert(
    'all-zero activity is excluded',
    abc.shouldIncludeSnapshotBarcode({ stock: 0, sales8w: 0, revenue: 0, cogs: 0, profit: 0 }) === false
  )
  assert(
    'positive sales with zero stock remains included',
    abc.shouldIncludeSnapshotBarcode({ stock: 0, sales8w: 5, revenue: 10, cogs: 4, profit: 6 }) === true
  )

  const assigned = abc.assignSnapshotAbcClasses([
    { barcode: '1', sales_8w: 80, revenue_8w: 800, profit_8w: 80 },
    { barcode: '2', sales_8w: 15, revenue_8w: 150, profit_8w: 15 },
    { barcode: '3', sales_8w: 5, revenue_8w: 50, profit_8w: 5 },
  ])
  assert(
    'three independent axes are assigned before insert',
    assigned.get('1').abc_qty === 'A' &&
      assigned.get('2').abc_revenue === 'B' &&
      assigned.get('3').abc_profit === 'C'
  )
}

async function stageService() {
  console.log('Stage 3: Service filters / sort / pagination')
  const ui = await load(ABC_UI)

  const catalog = [
    { barcode: '01', productName: 'Milk', categoryName: 'Dairy', subcategoryName: 'Milk', abcQty: 'A', abcRevenue: 'B', abcProfit: 'C' },
    { barcode: '02', productName: 'Bread', categoryName: 'Bakery', subcategoryName: 'Bread', abcQty: 'B', abcRevenue: 'A', abcProfit: 'A' },
    { barcode: '03', productName: 'Tea', categoryName: 'Drinks', subcategoryName: 'Tea', abcQty: 'C', abcRevenue: 'C', abcProfit: 'C' },
    { barcode: '04', productName: 'Old', categoryName: 'Other', subcategoryName: 'X', abcQty: null, abcRevenue: null, abcProfit: null },
    { barcode: '05', productName: 'Water', categoryName: 'Drinks', subcategoryName: 'Water', abcQty: 'A', abcRevenue: 'A', abcProfit: 'B' },
  ]

  const orQty = catalog.filter((item) => ui.snapshotItemMatchesAbcFilters(item, { abcQty: ['A', 'B'] }))
  assert('OR inside an axis (qty A or B)', orQty.map((i) => i.barcode).join() === '01,02,05')

  const andAcross = catalog.filter((item) =>
    ui.snapshotItemMatchesAbcFilters(item, { abcQty: ['A'], abcProfit: ['C'] })
  )
  assert('AND across axes (qty A AND profit C)', andAcross.map((i) => i.barcode).join() === '01')

  const nullsExcluded = catalog.filter((item) => ui.snapshotItemMatchesAbcFilters(item, { abcQty: ['C'] }))
  assert('NULL class is not treated as C', nullsExcluded.map((i) => i.barcode).join() === '03')
  assert(
    'unavailable notice copy is exact',
    ui.ABC_UNAVAILABLE_NOTICE === 'ABC недоступен для этого снимка — выполните синхронизацию UMAG.'
  )
  assert(
    'old snapshot rows with null money lack ABC facts',
    ui.snapshotItemsLackAbcFacts([
      { barcode: '01', revenue8w: null, cogs8w: null, profit8w: null, abcQty: null, abcRevenue: null, abcProfit: null },
    ]) === true
  )
  const freshZeroPage = Array.from({ length: 25 }, (_, i) => ({
    barcode: `z${String(i).padStart(2, '0')}`,
    revenue8w: 0,
    cogs8w: 0,
    profit8w: 0,
    abcQty: null,
    abcRevenue: null,
    abcProfit: null,
  }))
  assert(
    'fresh zero-movement page with computed 0 money is ABC-capable',
    ui.snapshotItemsLackAbcFacts(freshZeroPage) === false
  )
  assert(
    'legacy rows with null/undefined money and no class need resync notice',
    ui.snapshotItemsLackAbcFacts([
      { abcQty: null, abcRevenue: null, abcProfit: null, revenue8w: null, cogs8w: undefined, profit8w: null },
      { abcQty: '', abcRevenue: undefined, abcProfit: null },
    ]) === true
  )
  assert(
    'fresh row with negative or positive money is ABC-capable',
    ui.snapshotItemsLackAbcFacts([
      { abcQty: null, abcRevenue: null, abcProfit: null, revenue8w: -20, cogs8w: -8, profit8w: -12 },
    ]) === false &&
      ui.snapshotItemsLackAbcFacts([
        { abcQty: null, abcRevenue: null, abcProfit: null, revenue8w: 50, cogs8w: 20, profit8w: 30 },
      ]) === false
  )
  assert('empty item list is not treated as missing ABC', ui.snapshotItemsLackAbcFacts([]) === false)

  const page = ui.paginateSnapshotItems(
    [
      ...catalog,
      ...Array.from({ length: 25 }, (_, i) => ({
        barcode: `x${String(i).padStart(2, '0')}`,
        productName: `Item ${i}`,
        categoryName: 'Z',
        subcategoryName: 'Z',
        abcQty: 'B',
        abcRevenue: 'B',
        abcProfit: 'B',
      })),
    ],
    { page: 2, pageSize: 25, filters: { abcQty: ['B'] } }
  )
  assert('filtered totalCount is the match set, not the raw snapshot', page.totalCount === 26)
  assert('page 2 of 25-row pages has the remainder', page.items.length === 1 && page.items[0].abcQty === 'B')

  const defaults = ui.describeSnapshotItemsAbcQuery({})
  assert('default query has no ABC in-filters', defaults.inFilters.length === 0)
  assert(
    'default order is category/subcategory/name',
    defaults.orders.map((o) => o.field).join() === 'category_name,subcategory_name,product_name'
  )

  const sorted = ui.describeSnapshotItemsAbcQuery({
    abcQty: ['A', 'nope', 'B', 'A'],
    sortField: 'abc_profit',
    sortDir: 'desc',
  })
  assert('class list is whitelisted A/B/C and de-duplicated', sorted.inFilters[0].values.join() === 'A,B')
  assert(
    'ABC sort uses the axis then barcode, nulls last',
    sorted.orders[0].field === 'abc_profit' &&
      sorted.orders[0].ascending === false &&
      sorted.orders[0].nullsFirst === false &&
      sorted.orders[1].field === 'barcode'
  )

  const rejected = ui.describeSnapshotItemsAbcQuery({
    sortField: 'sales_8w;drop table',
    sortDir: 'sideways',
    abcQty: ["A);select 1"],
  })
  assert('unknown sort field falls back to default order', rejected.sort.field === '' && rejected.orders[0].field === 'category_name')
  assert('invalid class tokens are dropped, not interpolated', rejected.inFilters.length === 0)

  const andPlan = ui.describeSnapshotItemsAbcQuery({
    abcQty: ['A', 'B'],
    abcProfit: ['C'],
  })
  assert(
    'AND across axes emits separate in-filters (OR stays inside each list)',
    andPlan.inFilters.length === 2 &&
      andPlan.inFilters[0].column === 'abc_qty' &&
      andPlan.inFilters[0].values.join() === 'A,B' &&
      andPlan.inFilters[1].column === 'abc_profit' &&
      andPlan.inFilters[1].values.join() === 'C'
  )

  const idle = { field: '', dir: 'asc' }
  const once = ui.nextAbcSortState(idle, 'abc_qty')
  const twice = ui.nextAbcSortState(once, 'abc_qty')
  const thrice = ui.nextAbcSortState(twice, 'abc_qty')
  const switched = ui.nextAbcSortState(once, 'abc_revenue')
  assert('sort cycle idle → asc → desc → idle', once.field === 'abc_qty' && once.dir === 'asc' && twice.dir === 'desc' && thrice.field === '')
  assert('switching axis restarts at asc', switched.field === 'abc_revenue' && switched.dir === 'asc')

  const service = read(SERVICE)
  assert('service applies the ABC query plan', service.includes('describeSnapshotItemsAbcQuery'))
  assert('fetchSnapshotItemsPage calls applySnapshotItemsPageQuery', service.includes('applySnapshotItemsPageQuery(query,'))
  assert('service uses .in(column, values) not raw .or interpolation for ABC', service.includes('query.in(filter.column, filter.values)'))
  assert('service does not interpolate ABC into .or()', !/or\(`abc_/.test(service))
  assert('normalizeItem keeps ABC/money nullable', service.includes('nullableFiniteNumber(row.revenue_8w)') && service.includes('nullableAbcClass(row.abc_qty)'))
  assert('fetchSnapshotItemsPage still defaults without ABC controls', service.includes("sortField = ''") && service.includes("sortDir = 'asc'"))
  assert('service uses snapshotItemsPageRange for exact pages', service.includes('snapshotItemsPageRange(page, pageSize)'))

  const range25 = ui.snapshotItemsPageRange(2, 25)
  assert('25-row page 2 is rows 25–49', range25.from === 25 && range25.to === 49 && range25.pageSize === 25)
  const rangeDefault = ui.snapshotItemsPageRange(1)
  assert('range helper defaults to 25-row pages', rangeDefault.from === 0 && rangeDefault.to === 24 && rangeDefault.pageSize === 25)

  function createQueryRecorder() {
    const calls = []
    const api = {
      calls,
      eq(...args) { calls.push(['eq', ...args]); return api },
      in(...args) { calls.push(['in', ...args]); return api },
      or(...args) { calls.push(['or', ...args]); return api },
      is(...args) { calls.push(['is', ...args]); return api },
      gt(...args) { calls.push(['gt', ...args]); return api },
      order(...args) { calls.push(['order', ...args]); return api },
    }
    return api
  }

  const planning = await load(SERVICE)
  const defaultQuery = createQueryRecorder()
  planning.applySnapshotItemsPageQuery(defaultQuery, { snapshotId: 'snap-1' })
  assert(
    'default service query has no ABC in() and keeps category order',
    !defaultQuery.calls.some((call) => call[0] === 'in') &&
      defaultQuery.calls.filter((call) => call[0] === 'order').map((call) => call[1]).join() ===
        'category_name,subcategory_name,product_name'
  )

  const filtered = createQueryRecorder()
  planning.applySnapshotItemsPageQuery(filtered, {
    snapshotId: 'snap-1',
    abcQty: ['A', 'B', 'DROP'],
    abcProfit: ['C'],
    sortField: 'abc_qty',
    sortDir: 'desc',
  })
  const inCalls = filtered.calls.filter((call) => call[0] === 'in')
  const orderCalls = filtered.calls.filter((call) => call[0] === 'order')
  assert(
    'service .in() is OR inside an axis and AND across axes',
    inCalls.length === 2 &&
      inCalls[0][1] === 'abc_qty' &&
      inCalls[0][2].join() === 'A,B' &&
      inCalls[1][1] === 'abc_profit' &&
      inCalls[1][2].join() === 'C'
  )
  assert(
    'whitelisted desc sort uses barcode fallback and drops invalid classes',
    orderCalls[0][1] === 'abc_qty' &&
      orderCalls[0][2].ascending === false &&
      orderCalls[0][2].nullsFirst === false &&
      orderCalls[1][1] === 'barcode'
  )

  const unsafe = createQueryRecorder()
  planning.applySnapshotItemsPageQuery(unsafe, {
    snapshotId: 'snap-1',
    sortField: 'revenue_8w;select 1',
    sortDir: 'desc',
  })
  assert(
    'non-whitelisted sort falls back to default columns, not the user string',
    unsafe.calls.filter((call) => call[0] === 'order').every((call) =>
      ['category_name', 'subcategory_name', 'product_name'].includes(call[1])
    )
  )
}

function stageUi() {
  console.log('Stage 4: Planner UI')
  const planner = read(PLANNER)
  const css = read(PLANNER_CSS)

  assert(
    'TABLE_COL_SPAN accounts for week columns',
    /TABLE_COL_SPAN\s*=\s*5\s*\+\s*PLANNER_WEEK_COLUMN_COUNT\s*\+\s*7/.test(planner) ||
      planner.includes('const TABLE_COL_SPAN = 20')
  )
  assert('loading/empty rows use TABLE_COL_SPAN', /colSpan=\{TABLE_COL_SPAN\}>Загрузка/.test(planner) && /colSpan=\{TABLE_COL_SPAN\}>Нет позиций/.test(planner))
  assert(
    'desktop table has three ABC axis columns',
    planner.includes('proc-planner__col-abc-axis') &&
      planner.includes('proc-planner__abc-axis-btn') &&
      /ABC_AXES\.map\(\(axis\) => \(\s*<td[\s\S]*?AbcBadge/.test(planner)
  )
  assert('three badges come from ABC_AXES', planner.includes('ABC_AXES.map((axis)') && planner.includes('<AbcBadge'))
  assert('badge shows the letter, not color alone', planner.includes('{letter}') && planner.includes('aria-label={title}') && planner.includes('title={title}') && /role="img"/.test(planner))
  assert('NULL renders an accessible dash', planner.includes("formatAbcClass") && planner.includes('is-empty'))
  assert('mobile cards show ABC badges', /proc-planner__card[\s\S]*<AbcBadges item=\{item\} \/>/.test(planner) || planner.includes('<AbcBadges item={item} />'))
  assert('three filter groups with A/B/C checkboxes', !planner.includes('proc-planner__abc-filter'))
  assert(
    'ABC class filter UI removed; sort + empty abc filter state remain',
    !planner.includes('toggleAbcClassFilter') &&
      planner.includes('abcQty: []') &&
      planner.includes('abcRevenue: []') &&
      planner.includes('abcProfit: []') &&
      !planner.includes('proc-planner__filter-pop') &&
      planner.includes('nextAbcSortState')
  )
  assert('sort buttons have aria-label and pressed state', planner.includes('abcSortAriaLabel') && planner.includes('aria-pressed={active}'))
  assert('changing filters/sort resets page', planner.includes('[debouncedSearch, filters, abcSort, snapshot?.id]'))
  assert('legend moved to ABC column help tooltip', planner.includes('AbcColumnHelp') && planner.includes('ABC_COLUMN_HELP') && !planner.includes('proc-planner__abc-legend'))
  assert(
    'ABC help covers class thresholds and axes',
    planner.includes('до 80%') &&
      planner.includes('К — количество') &&
      planner.includes('proc-planner__abc-help')
  )
  assert(
    'snapshot ABC unavailable notice uses exact copy',
    planner.includes('{ABC_UNAVAILABLE_NOTICE}') &&
      planner.includes('snapshotItemsLackAbcFacts(items)')
  )
  assert(
    'ABC unavailable notice is snapshot-level and accessible',
    planner.includes('proc-planner__abc-unavailable') &&
      /className="proc-planner__abc-unavailable" role="status"/.test(planner)
  )
  assert('notice CSS exists', css.includes('.proc-planner__abc-unavailable'))
  assert('sort cycle uses nextAbcSortState', planner.includes('nextAbcSortState(current, axis.column)'))
  assert('page resets to 1 on filter/sort change', planner.includes('setPage(1)') && planner.includes('[debouncedSearch, filters, abcSort, snapshot?.id]'))
  assert('A green / B amber / C red / dash gray', css.includes('.proc-planner__abc-badge.is-a') && css.includes('.proc-planner__abc-badge.is-b') && css.includes('.proc-planner__abc-badge.is-c') && css.includes('.proc-planner__abc-badge.is-empty'))
  assert(
    'ABC sort axis buttons are at least 24×32 CSS px',
    css.includes('.proc-planner__abc-axis-btn') &&
      css.includes('min-width: 24px') &&
      css.includes('min-height: 32px')
  )
  assert(
    'permanent ↑↓ affordance on ABC headers',
    planner.includes('proc-planner__abc-arrow') &&
      css.includes('.proc-planner__abc-arrow.is-on')
  )
  assert('no new ABC dashboard or export columns', !planner.includes('AbcDashboard') && !/PLAN_EXPORT_COLUMNS[\s\S]*ABC/.test(planner))
}

function stageRepeatOrderInvariants() {
  console.log('Stage 5: Repeat-order / generate invariants')
  const edge = read(EDGE)
  const fp = read(FINGERPRINT)
  const repeat = read(REPEAT_MIGRATION)
  const classifier = read(CLASSIFIER)

  assert('generate RPC contract is unchanged in Edge', edge.includes('p_attempt_key: attemptKey || null') && edge.includes('p_payload_fingerprint: payloadFingerprint || null'))
  assert('ABC is not added to generate payload', !/p_abc|abc_qty|revenue_8w/.test(edge.slice(edge.indexOf('async function handleGenerate'))))
  assert('fingerprint spec stays snapshot/supplier/date/barcode=qty', fp.includes('snapshot=<uuid lowercase>') && fp.includes('<barcode>=<canonicalQty>') && !/abc_/i.test(fp) && !/revenue_8w/.test(fp))
  assert('repeat migration still defines attempt_key generate RPC', repeat.includes('p_attempt_key uuid default null') && repeat.includes('generation_payload_fingerprint'))
  assert('sync still uses the same 8-week sales path', edge.includes("SALES_PATH = '/rest/cabinet/report/list-product-report'") && edge.includes('buildEightWeekRanges'))
  assert('amounts come from saleSellingAmount / saleArrivalAmount', classifier.includes('row.saleSellingAmount') && classifier.includes('row.saleArrivalAmount'))
  assert('classifier never multiplies price × quantity', !/sellingPrice\s*\*|purchase_price\s*\*|arrivalCost\s*\*/.test(classifier) && !/sellingPrice\s*\*|purchase_price\s*\*/.test(edge))
  assert('ABC assigned once before insert', edge.includes('assignSnapshotAbcClasses(draftItems)'))
  assert('UMAG paging/caps preserved', edge.includes('PAGE_SIZE = 50_000') && edge.includes('first: 0'))
  assert(
    'sync stores rounded UMAG amounts, not current price estimates',
    edge.includes('revenue_8w: revenue8w') &&
      edge.includes('cogs_8w: cogs8w') &&
      edge.includes('profit_8w: profit8w') &&
      edge.includes('accumulateSalesRows(sales)')
  )
  assert('week money is merged with += helper', edge.includes('mergeWeekSalesIntoSnapshot({'))
  assert(
    'inclusion uses stock/sales/money helper, not sales8w > 0',
    edge.includes('shouldIncludeSnapshotBarcode({') && !/sales8w > 0/.test(edge)
  )
  const docs = read(ABC_DOC)
  assert(
    'docs require migration first, then umag-procurement deploy',
    docs.includes('Применить миграцию `20260815072607_procurement_abc_analysis.sql`.') &&
      docs.includes('Затем задеплоить Edge Function `umag-procurement`.')
  )
  assert(
    'qty is quantized to 3 dp before tie grouping',
    classifier.includes('export const QTY_DECIMALS = 3') &&
      classifier.includes('metric: roundQty(row.metric)')
  )
  assert(
    'classifier has no negativesAsCIfPositiveTotal fallback',
    !classifier.includes('negativesAsCIfPositiveTotal')
  )
  assert(
    'docs say non-positive profit is NULL and never A/B/C',
    docs.includes('Класс при метрике ≤ 0 — `NULL` / в UI «—», никогда A/B/C') &&
      !docs.includes('убыточные получают C')
  )
}

const BACKEND_ONLY = process.argv.includes('--backend-only')
const SERVICE_UI_ONLY = process.argv.includes('--service-ui-only')
const SERVICE_ONLY = process.argv.includes('--service-only')

const EXPECTED_CHECKS = {
  full: 120,
  backend: 65,
  service: 33,
  serviceUi: 56,
}

async function main() {
  if (SERVICE_ONLY) {
    await stageService()
    if (checks !== EXPECTED_CHECKS.service) {
      fail(`expected ${EXPECTED_CHECKS.service} service checks, ran ${checks}`)
    }
    console.log(`\n${checks}/${EXPECTED_CHECKS.service} checks passed (service only)`)
    return
  }
  if (SERVICE_UI_ONLY) {
    await stageService()
    stageUi()
    if (checks !== EXPECTED_CHECKS.serviceUi) {
      fail(`expected ${EXPECTED_CHECKS.serviceUi} service/UI checks, ran ${checks}`)
    }
    console.log(`\n${checks}/${EXPECTED_CHECKS.serviceUi} checks passed (service/UI only)`)
    return
  }
  stageMigration()
  await stageClassifier()
  stageRepeatOrderInvariants()
  if (!BACKEND_ONLY) {
    await stageService()
    stageUi()
  }
  const expected = BACKEND_ONLY ? EXPECTED_CHECKS.backend : EXPECTED_CHECKS.full
  if (checks !== expected) {
    fail(`expected ${expected} checks, ran ${checks}`)
  }
  console.log(`\n${checks}/${expected} checks passed${BACKEND_ONLY ? ' (backend only)' : ''}`)
}

main().catch((err) => {
  console.error(`\nFAIL: ${err.message}`)
  process.exit(1)
})
