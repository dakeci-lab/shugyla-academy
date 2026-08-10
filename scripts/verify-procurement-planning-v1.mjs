#!/usr/bin/env node
/**
 * Verification for Procurement Planning v1 formulas, override, grouping, export mapping.
 *
 * Usage:
 *   npm run verify:procurement-planning-v1
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

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

function assertFileContains(relPath, needle, label = needle) {
  const src = read(relPath)
  assert(`${relPath} contains ${label}`, src.includes(needle))
}

async function stageFormulas() {
  console.log('Stage 1: Planning formulas')
  const math = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/procurementPlanningMath.js')).href
  )

  assert('negative stock → calculation 0', math.calcCalculationStock(-12) === 0)
  assert('positive stock preserved', math.calcCalculationStock(12.5) === 12.5)
  assert(
    'avg daily = sum/56',
    Math.abs(math.calcAvgDaily([7, 7, 7, 7, 7, 7, 7, 7]) - 1) < 1e-9
  )

  const rec = math.calcRecommendedQty(2, 14, 10)
  assert('recommendation rounds max(0, avg*norm-stock)', rec === 18)

  const negRec = math.calcRecommendedQty(0.1, 14, 5)
  assert('recommendation never negative', negRec === 0)

  const auto = math.applyNormDaysChange(
    { avgDaily: 2, calculationStock: 10, finalOrderQty: 18, manualOverride: false },
    21
  )
  assert('norm change updates recommendation', auto.recommendedQty === 32)
  assert('without override final follows recommendation', auto.finalOrderQty === 32)

  const manual = math.applyNormDaysChange(
    { avgDaily: 2, calculationStock: 10, finalOrderQty: 40, manualOverride: true },
    21
  )
  assert('manual override preserves final', manual.finalOrderQty === 40)
  assert('manual override still updates recommendation', manual.recommendedQty === 32)

  assert('parseNormDays keeps zero', math.parseNormDays(0) === 0)
  assert('parseNormDays keeps string zero', math.parseNormDays('0') === 0)
  assert('resolveNormDays keeps zero rule', math.resolveNormDays('A', 'B', [
    { category_name: 'A', subcategory_name: 'B', norm_days: 0 },
  ]) === 0)
}

async function stageGroupingAndExport() {
  console.log('Stage 2: Supplier grouping + export mapping')
  const math = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/procurementPlanningMath.js')).href
  )

  const { groups, skippedNoSupplier, orderCount } = math.groupOrderableBySupplier([
    { barcode: '1', final_order_qty: 5, platform_supplier_id: 's1' },
    { barcode: '2', finalOrderQty: 3, platformSupplierId: 's1' },
    { barcode: '3', finalOrderQty: 2, platformSupplierId: 's2' },
    { barcode: '4', finalOrderQty: 4, platformSupplierId: null },
    { barcode: '5', finalOrderQty: 0, platformSupplierId: 's1' },
  ])

  assert('two supplier groups', orderCount === 2)
  assert('skipped no supplier counted', skippedNoSupplier === 1)
  assert('supplier s1 has 2 items', groups.get('s1').length === 2)
  assert('supplier s2 has 1 item', groups.get('s2').length === 1)

  const mapped = math.mapSnapshotItemToPurchaseOrderItem(
    {
      productName: 'Молоко',
      barcode: '123',
      finalOrderQty: 10,
      purchasePrice: 250.5,
      calculationStock: 2,
      avgDaily: 1.5,
      recommendedQty: 12,
      platformSupplierId: 's1',
      umagSupplierName: 'UMAG S',
    },
    'order-1',
    { id: 's1', name: 'Поставщик А' }
  )
  assert('export mapping copies ordered qty', mapped.ordered_qty === 10)
  assert('export mapping line total', mapped.total_amount === 2505)
  assert('export mapping supplier name', mapped.supplier_name === 'Поставщик А')

  const exportView = math.mapPurchaseOrderForExport({
    supplierName: 'Поставщик А',
    date: '2026-08-09',
    expectedDeliveryDate: '2026-08-12',
    createdByName: 'Иван',
    items: [
      { productName: 'Молоко', barcode: '123', orderQty: 10, purchasePrice: 100 },
      { productName: 'Хлеб', barcode: '456', ordered_qty: 2, purchase_price: 50 },
    ],
  })
  assert('export totals sum ordered quantities', exportView.totalAmount === 1100)
  assert('export items count', exportView.itemsCount === 2)
}

function stageContractFiles() {
  console.log('Stage 3: Backend/frontend contract files')

  const migration = fs
    .readdirSync(path.join(ROOT, 'supabase/migrations'))
    .find((name) => name.endsWith('procurement_planning_v1.sql'))
  assert('migration file exists', Boolean(migration))

  const mig = read(`supabase/migrations/${migration}`)
  assert('has procurement_snapshots', mig.includes('create table if not exists public.procurement_snapshots'))
  assert('has snapshot items', mig.includes('create table if not exists public.procurement_snapshot_items'))
  assert('has norm rules', mig.includes('create table if not exists public.procurement_norm_rules'))
  assert(
    'generate rpc service_role only',
    mig.includes('grant execute on function public.generate_procurement_orders_from_snapshot') &&
      mig.includes('to service_role') &&
      mig.includes('revoke all on function public.generate_procurement_orders_from_snapshot')
  )
  assert('idempotent generate branch', mig.includes("already_generated"))
  assert('workflow analytics', mig.includes("'analytics'"))
  assert('transferred_to_receiving true', mig.includes('transferred_to_receiving'))
  assert(
    'receiving_documents insert includes total_amount',
    /insert into public\.receiving_documents\s*\([^;]*total_amount/s.test(mig) &&
      mig.includes('v_total_amount')
  )
  assert(
    'receiving_items insert omits sort_order',
    !/insert into public\.receiving_items\s*\([^;]*sort_order/s.test(mig)
  )
  assert(
    'qty non-negative checks',
    mig.includes('check (recommended_qty >= 0)') && mig.includes('check (final_order_qty >= 0)')
  )
  assert(
    'norm RPC locks snapshot FOR UPDATE then checks ready',
    /set_procurement_norm_rule_for_snapshot[\s\S]*for update;[\s\S]*v_snapshot\.status is distinct from 'ready'/.test(
      mig
    )
  )
  assert(
    'planning edit guard locks snapshot FOR SHARE',
    /procurement_snapshot_items_guard_update[\s\S]*for share;[\s\S]*v_snapshot_status is distinct from 'ready'/.test(
      mig
    )
  )
  assert(
    'planning edit guard requires ready',
    mig.includes("planning fields editable only when snapshot status is ready")
  )
  assert(
    'RLS update requires ready snapshot',
    /procurement_snapshot_items_update_edit[\s\S]*s\.status = 'ready'/.test(mig)
  )
  assert(
    'column-level UPDATE only final/manual/updated_at',
    /grant update \(\s*final_order_qty,\s*manual_override,\s*updated_at\s*\)/.test(mig)
  )
  assert(
    'norm RPC present',
    mig.includes('set_procurement_norm_rule_for_snapshot')
  )
  assert(
    'norm RPC service_role only in v1',
    mig.includes(
      'grant execute on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) to service_role'
    ) &&
      mig.includes(
        'revoke all on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) from authenticated'
      ) &&
      !mig.includes(
        'grant execute on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) to authenticated'
      )
  )
  assert(
    'standalone FK indexes in v1',
    mig.includes('idx_psi_platform_supplier_id') &&
      mig.includes('idx_psi_generated_purchase_order_id') &&
      /on public\.procurement_snapshot_items \(platform_supplier_id\)/.test(mig) &&
      /on public\.procurement_snapshot_items \(generated_purchase_order_id\)/.test(mig)
  )

  const hardeningName = fs
    .readdirSync(path.join(ROOT, 'supabase/migrations'))
    .find((name) => name.endsWith('procurement_planning_v1_hardening.sql'))
  assert('hardening follow-up migration exists', Boolean(hardeningName))
  const hard = read(`supabase/migrations/${hardeningName}`)
  assert(
    'hardening has standalone FK indexes',
    hard.includes('idx_psi_platform_supplier_id') &&
      hard.includes('idx_psi_generated_purchase_order_id')
  )
  assert(
    'hardening revokes authenticated norm RPC',
    hard.includes(
      'revoke all on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) from authenticated'
    )
  )
  assert(
    'hardening grants norm RPC to service_role only',
    hard.includes(
      'grant execute on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) to service_role'
    ) &&
      !hard.includes(
        'grant execute on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) to authenticated'
      )
  )
  assert(
    'no table-wide UPDATE grant on snapshot items for authenticated',
    !/grant\s+select,\s*update\s+on table public\.procurement_snapshot_items to authenticated/i.test(mig)
  )
  assert(
    'norm_days/recommended not in authenticated column UPDATE',
    !/grant update \(\s*[^)]*norm_days[^)]*\) on table public\.procurement_snapshot_items to authenticated/.test(
      mig
    )
  )
  assert(
    'RLS uses permission helper',
    mig.includes("auth_private.current_user_has_permission('procurement.view')") &&
      mig.includes("auth_private.current_user_has_permission('procurement.edit')")
  )
  assert(
    'RLS not any-active-employee',
    !mig.includes('auth_private.current_employee_is_active()')
  )

  assertFileContains(
    'supabase/functions/umag-procurement/index.ts',
    "action === 'sync'",
    'sync action'
  )
  assertFileContains(
    'supabase/functions/umag-procurement/index.ts',
    'procurement.edit',
    'edit permission'
  )
  assertFileContains(
    'supabase/functions/umag-procurement/index.ts',
    'procurement.create',
    'create permission'
  )
  assertFileContains(
    'supabase/functions/umag-procurement/index.ts',
    'procurement.transfer',
    'transfer permission'
  )
  assertFileContains(
    'supabase/functions/umag-procurement/index.ts',
    '/rest/cabinet/opr/stock/find',
    'stock endpoint'
  )
  assertFileContains(
    'supabase/functions/umag-procurement/index.ts',
    '/rest/cabinet/report/list-product-report',
    'sales endpoint'
  )
  assertFileContains(
    'supabase/functions/umag-procurement/index.ts',
    'Asia/Almaty',
    'Almaty timezone'
  )
  assertFileContains('supabase/config.toml', '[functions.umag-procurement]', 'function config')
  assertFileContains('supabase/config.toml', 'verify_jwt = true', 'verify_jwt')

  assertFileContains(
    'src/services/procurementPlanningService.js',
    "action: 'sync'",
    'service sync invoke'
  )
  assertFileContains(
    'supabase/functions/umag-procurement/index.ts',
    "action === 'set_norm'",
    'set_norm action'
  )
  assertFileContains(
    'supabase/functions/umag-procurement/index.ts',
    'handleSetNorm',
    'set_norm handler'
  )
  assertFileContains(
    'supabase/functions/umag-procurement/index.ts',
    'set_procurement_norm_rule_for_snapshot',
    'Edge calls norm RPC'
  )
  assertFileContains(
    'src/services/procurementPlanningService.js',
    "action: 'set_norm'",
    'service invokes set_norm Edge action'
  )
  assert(
    'service does not call supabase.rpc for norm',
    !read('src/services/procurementPlanningService.js').includes(
      "supabase.rpc('set_procurement_norm_rule_for_snapshot'"
    )
  )
  assertFileContains(
    'src/services/procurementPlanningService.js',
    'sanitizePlanningSearch',
    'search sanitizer'
  )
  assertFileContains(
    'src/services/procurementPlanningService.js',
    'categorySubcategories',
    'category/subcategory pairs'
  )
  assert(
    'normalizeItem uses parseNormDays',
    read('src/services/procurementPlanningService.js').includes('parseNormDays(row.norm_days)')
  )
  assert(
    'no Number||DEFAULT for normDays normalize',
    !read('src/services/procurementPlanningService.js').includes(
      'Number(row.norm_days) || DEFAULT_NORM_DAYS'
    )
  )
  assert(
    'filter options order by id before range',
    /fetchSnapshotFilterOptions[\s\S]*\.order\('id'[\s\S]*\.range\(/.test(
      read('src/services/procurementPlanningService.js')
    )
  )
  assertFileContains(
    'src/pages/platform/procurement/ProcurementPage.jsx',
    'ProcurementPlannerView',
    'planner integrated'
  )
  assertFileContains(
    'src/pages/platform/procurement/ProcurementPage.jsx',
    'Заказы',
    'orders tab'
  )
  assertFileContains(
    'src/utils/purchaseOrderExport.js',
    'exportPurchaseOrderPdf',
    'pdf export'
  )
  assertFileContains(
    'src/utils/purchaseOrderExport.js',
    'exportPurchaseOrderXlsx',
    'xlsx export'
  )
  assertFileContains(
    'src/pages/platform/procurement/PurchaseDetailPage.jsx',
    'exportPurchaseOrderPdf',
    'detail pdf'
  )
  assert(
    'no fake excel alert',
    !read('src/pages/platform/procurement/PurchaseDetailPage.jsx').includes(
      'Экспорт Excel будет доступен'
    )
  )
  assert(
    'analytics page no umag import button',
    !read('src/pages/platform/procurement/AnalyticsProcurementPage.jsx').includes(
      'Импорт из Umag'
    )
  )
  assertFileContains(
    'src/pages/platform/receiving/ReceivingPage.jsx',
    'AnalyticsReceivingList',
    'receiving analytics list'
  )
}

async function stagePlanExportAndPlannerUi() {
  console.log('Stage 4: Plan export contract + planner UI')
  const planExport = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/procurementPlanExport.js')).href
  )
  const planner = read('src/components/procurement/ProcurementPlannerView.jsx')
  const plannerCss = read('src/components/procurement/ProcurementPlannerView.css')

  assert(
    'PLAN_EXPORT_COLUMNS exact order',
    JSON.stringify(planExport.PLAN_EXPORT_COLUMNS) ===
      JSON.stringify(['№', 'Товар', 'Штрихкод', 'Поставщик', 'Заказ'])
  )

  assert('parse rejects numeric 0', planExport.parsePositiveFinalOrderQty({ finalOrderQty: 0 }) == null)
  assert('parse rejects string 0', planExport.parsePositiveFinalOrderQty({ finalOrderQty: '0' }) == null)
  assert('parse rejects null/undefined', planExport.parsePositiveFinalOrderQty({}) == null)
  assert(
    'parse rejects negative',
    planExport.parsePositiveFinalOrderQty({ final_order_qty: -1 }) == null
  )
  assert(
    'parse rejects non-numeric',
    planExport.parsePositiveFinalOrderQty({ finalOrderQty: 'abc' }) == null
  )
  assert(
    'parse keeps positive string qty',
    planExport.parsePositiveFinalOrderQty({ final_order_qty: '2.5' }) === 2.5
  )
  assert(
    'parse keeps positive number',
    planExport.parsePositiveFinalOrderQty({ finalOrderQty: 7 }) === 7
  )

  const mapped = planExport.mapPlanItemsForExport([
    {
      productName: 'Молоко',
      barcode: '012345',
      umagSupplierName: 'Dairy Co',
      finalOrderQty: 7,
      categoryName: 'ignore',
      rawStock: 99,
      recommendedQty: 12,
    },
    {
      productName: 'Ноль',
      barcode: '000',
      finalOrderQty: 0,
    },
    {
      product_name: 'Хлеб',
      barcode: 78001,
      umag_supplier_name: '',
      final_order_qty: '3',
    },
    {
      productName: 'Строковый ноль',
      finalOrderQty: '0',
    },
    {
      productName: 'Отрицательный',
      final_order_qty: -5,
    },
    {
      productName: 'Мусор',
      finalOrderQty: 'n/a',
    },
    {
      productName: 'Сок',
      barcode: null,
      finalOrderQty: null,
    },
    {
      productName: 'Дробь',
      barcode: '99',
      final_order_qty: 1.5,
    },
  ])

  assert('export excludes zero/invalid rows', mapped.length === 3)
  assert('dense numbering 1..N', mapped[0]['№'] === 1 && mapped[1]['№'] === 2 && mapped[2]['№'] === 3)
  assert(
    'exported product names only positive qty',
    mapped.map((r) => r.Товар).join('|') === 'Молоко|Хлеб|Дробь'
  )
  assert(
    'exact keys order row 0',
    JSON.stringify(Object.keys(mapped[0])) ===
      JSON.stringify(['№', 'Товар', 'Штрихкод', 'Поставщик', 'Заказ'])
  )
  assert('barcode kept as string with leading zero', mapped[0].Штрихкод === '012345')
  assert('numeric barcode coerced to string', mapped[1].Штрихкод === '78001')
  assert('supplier fallback dash', mapped[1].Поставщик === '—')
  assert('supplier name preferred', mapped[0].Поставщик === 'Dairy Co')
  assert(
    'final order qty mapped including positive string',
    mapped[0].Заказ === 7 && mapped[1].Заказ === 3 && mapped[2].Заказ === 1.5
  )
  assert(
    'no extra planning columns in mapped row',
    !('Категория' in mapped[0]) &&
      !('Остаток' in mapped[0]) &&
      !('Рекомендация' in mapped[0]) &&
      !('Норма' in mapped[0])
  )

  const aoa = planExport.planExportRowsToAoa(mapped)
  assert('aoa header exact', JSON.stringify(aoa[0]) === JSON.stringify(planExport.PLAN_EXPORT_COLUMNS))
  assert('aoa barcode string', typeof aoa[1][2] === 'string' && aoa[1][2] === '012345')
  assert('aoa only positive rows', aoa.length === 4)

  assertFileContains(
    'src/utils/procurementPlanExport.js',
    'exportProcurementPlanXlsx',
    'xlsx plan export'
  )
  assertFileContains(
    'src/utils/procurementPlanExport.js',
    'exportProcurementPlanPdf',
    'pdf plan export'
  )
  assert(
    'xlsx forces barcode text cells',
    read('src/utils/procurementPlanExport.js').includes("cell.z = '@'") ||
      read('src/utils/procurementPlanExport.js').includes('cell.z = "@"')
  )

  assert('planner uses SearchableSupplierSelect', planner.includes('SearchableSupplierSelect'))
  assert('planner activeOnly=false', planner.includes('activeOnly={false}'))
  assert(
    'planner keeps platformSupplierId filter key',
    planner.includes('platformSupplierId') && planner.includes('filterOptions.suppliers')
  )
  assert('planner has № column', planner.includes('proc-planner__col-num') && planner.includes('>№<'))
  assert(
    'planner page numbering formula',
    planner.includes('(page - 1) * PAGE_SIZE + index + 1')
  )
  assert('planner mobile row number', planner.includes('proc-planner__row-num'))
  assert('planner export menu aria', planner.includes('aria-haspopup="menu"'))
  assert('planner export PDF+Excel items', planner.includes('runPlanExport(\'pdf\')') && planner.includes('runPlanExport(\'xlsx\')'))
  assert(
    'planner uses shared plan export utils',
    planner.includes('exportProcurementPlanPdf') && planner.includes('exportProcurementPlanXlsx')
  )
  assert(
    'planner export uses exportSnapshotItemsCsv',
    planner.includes('exportSnapshotItemsCsv')
  )
  assert(
    'no legacy 18-column inline export',
    !planner.includes('W1: r.weeklySales') &&
      !planner.includes("'Ср/день': r.avgDaily") &&
      !planner.includes('Категория: r.categoryName')
  )
  assert(
    'purchase order export untouched',
    read('src/utils/purchaseOrderExport.js').includes('exportPurchaseOrderXlsx') &&
      read('src/pages/platform/procurement/PurchaseDetailPage.jsx').includes(
        'exportPurchaseOrderPdf'
      )
  )
  assert('export menu css present', plannerCss.includes('proc-planner__export-menu'))
  assert('supplier filter overflow visible', plannerCss.includes('overflow: visible'))

  const planningSrc = read('src/services/procurementPlanningService.js')
  const edge = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/edgeFunctionErrors.js')).href
  )
  assert(
    'planning uses resolveEdgeFunctionUserMessage',
    planningSrc.includes('resolveEdgeFunctionUserMessage')
  )
  assert(
    'planning no raw Bad Request passthrough branch',
    !planningSrc.includes('isGenericInvokeErrorMessage(error.message)')
  )
  const planningFallback = 'Не удалось выполнить операцию планирования. Повторите попытку.'
  assert(
    'Bad Request resolves to Russian planning fallback',
    edge.resolveEdgeFunctionUserMessage({
      error: new Error('Bad Request'),
      body: null,
      fallback: planningFallback,
    }) === planningFallback
  )
  assert(
    'structured Russian generate body preserved',
    edge.resolveEdgeFunctionUserMessage({
      error: new Error('Bad Request'),
      body: {
        success: false,
        code: 'GENERATE_FAILED',
        message: 'Не удалось сформировать заказы. Повторите попытку.',
      },
      fallback: planningFallback,
    }) === 'Не удалось сформировать заказы. Повторите попытку.'
  )
}

function main() {
  console.log('verify-procurement-planning-v1\n')
  return stageFormulas()
    .then(() => stageGroupingAndExport())
    .then(() => stageContractFiles())
    .then(() => stagePlanExportAndPlannerUi())
    .then(() => {
      console.log(`\nPassed ${testsPassed}/${testsRun}`)
    })
    .catch((err) => {
      console.error(`\nFAILED after ${testsPassed}/${testsRun}:`, err.message)
      process.exitCode = 1
    })
}

main()
