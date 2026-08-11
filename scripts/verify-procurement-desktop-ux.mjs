#!/usr/bin/env node
/**
 * Verification for procurement desktop UX: supplier summaries, workflow,
 * create/export/save/sync guards, delta updates, webOnly nav, route guard.
 *
 * Usage:
 *   npm run verify:procurement-desktop-ux
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

async function stageSummariesAndWorkflow() {
  console.log('Stage 1: Supplier summaries + workflow + guards')
  const ux = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/procurementPlannerUx.js')).href
  )

  const state = ux.createSnapshotFilterAccumulator()
  const rows = [
    {
      category_name: 'Молочка',
      subcategory_name: 'Молоко',
      platform_supplier_id: 's1',
      umag_supplier_name: 'Агро',
      final_order_qty: 5,
      generated_purchase_order_id: null,
    },
    {
      category_name: 'Молочка',
      subcategory_name: 'Кефир',
      platform_supplier_id: 's1',
      umag_supplier_name: 'Агро',
      final_order_qty: 2,
      generated_purchase_order_id: null,
    },
    {
      category_name: 'Бакалея',
      subcategory_name: 'Крупы',
      platform_supplier_id: 's2',
      umag_supplier_name: 'Опт',
      final_order_qty: 10,
      generated_purchase_order_id: 'po-2',
    },
    {
      category_name: 'Бакалея',
      subcategory_name: 'Крупы',
      platform_supplier_id: 's2',
      umag_supplier_name: 'Опт',
      final_order_qty: 0,
      generated_purchase_order_id: null,
    },
    {
      category_name: 'Напитки',
      subcategory_name: 'Вода',
      platform_supplier_id: null,
      umag_supplier_name: '',
      final_order_qty: 3,
      generated_purchase_order_id: null,
    },
    {
      category_name: 'Напитки',
      subcategory_name: 'Соки',
      platform_supplier_id: 's3',
      umag_supplier_name: 'СокТрейд',
      final_order_qty: 0,
      generated_purchase_order_id: null,
    },
    {
      category_name: 'Заморозка',
      subcategory_name: 'Пельмени',
      platform_supplier_id: 's4',
      umag_supplier_name: 'Холод',
      final_order_qty: 4,
      generated_purchase_order_id: 'po-4',
    },
    {
      category_name: 'Заморозка',
      subcategory_name: 'Вареники',
      platform_supplier_id: 's4',
      umag_supplier_name: 'Холод',
      final_order_qty: 6,
      generated_purchase_order_id: null,
    },
  ]
  for (const row of rows) ux.accumulateSnapshotFilterRow(row, state)
  const options = ux.finalizeSnapshotFilterOptions(state)

  assert('four categories collected', options.categories.length === 4)
  assert('suppliers include empty/draft/created', options.suppliers.length === 4)
  assert('pending suppliers counted', options.pendingSupplierCount === 1)
  assert(
    'generated suppliers counted with order id',
    options.generatedSupplierCount === 2
  )
  assert('unassigned orderable counted', options.unassignedOrderableCount === 1)
  assert(
    'inconsistent suppliers counted',
    options.inconsistentSupplierCount === 1
  )

  const s1 = options.suppliers.find((s) => s.id === 's1')
  const s2 = options.suppliers.find((s) => s.id === 's2')
  const s3 = options.suppliers.find((s) => s.id === 's3')
  const s4 = options.suppliers.find((s) => s.id === 's4')
  assert('s1 is draft', s1?.planningStatus === 'draft' && s1.orderablePositions === 2 && s1.totalQty === 7)
  assert('s2 is created', s2?.planningStatus === 'created' && s2.generatedOrderId === 'po-2')
  assert('s3 is empty', s3?.planningStatus === 'empty')
  assert(
    's4 created despite pending leftovers',
    s4?.planningStatus === 'created' &&
      ux.isSupplierOrderCreated(s4) &&
      ux.isSupplierInconsistent(s4)
  )

  const progress = ux.formatOrdersProgress(options)
  assert('progress uses created X of Y', progress.createdLabel === 'Создано 2 из 3 заказов')
  assert('remaining N shown', progress.remainingLabel === 'Осталось 1')
  assert('unassigned warning present', progress.unassignedLabel.includes('Без поставщика: 1'))
  assert('inconsistent warning present', progress.inconsistentLabel === 'Расхождение: 1')
  assert('allDone false while unassigned remain', progress.allDone === false)

  const doneProgress = ux.formatOrdersProgress({
    generatedSupplierCount: 2,
    pendingSupplierCount: 0,
    unassignedOrderableCount: 0,
    inconsistentSupplierCount: 0,
  })
  assert('allDone true only without unassigned/inconsistent', doneProgress.allDone === true)
  assert(
    'allDone false with inconsistent only',
    ux.formatOrdersProgress({
      generatedSupplierCount: 1,
      pendingSupplierCount: 0,
      unassignedOrderableCount: 0,
      inconsistentSupplierCount: 1,
    }).allDone === false
  )

  assert(
    'workflow select supplier',
    ux.getSupplierWorkflowStatus({ supplierId: '' }).step === 'select_supplier'
  )
  assert(
    'workflow enter qty',
    ux.getSupplierWorkflowStatus({ supplierId: 's3', summary: s3 }).step === 'enter_qty'
  )
  assert(
    'workflow draft',
    ux.getSupplierWorkflowStatus({ supplierId: 's1', summary: s1 }).label.includes('Черновик · 2 позиций')
  )
  assert(
    'workflow created',
    ux.getSupplierWorkflowStatus({ supplierId: 's2', summary: s2 }).step === 'created' &&
      ux.getSupplierWorkflowStatus({ supplierId: 's2', summary: s2 }).orderId === 'po-2'
  )
  assert(
    'workflow created marks inconsistent leftover',
    ux.getSupplierWorkflowStatus({ supplierId: 's4', summary: s4 }).inconsistent === true
  )

  assert(
    'create blocked without supplier',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: '',
    }) === 'Сначала выберите поставщика'
  )
  assert(
    'create blocked while saving',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: 's1',
      summary: s1,
      pendingSaveCount: 1,
    }) === 'Дождитесь сохранения количества'
  )
  assert(
    'create blocked after save error',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: 's1',
      summary: s1,
      hasSaveError: true,
    }) === 'Исправьте ошибку сохранения количества'
  )
  assert(
    'create blocked when already created',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: 's2',
      summary: s2,
    }) === 'Заказ для этого поставщика уже создан'
  )
  assert(
    'create blocked for inconsistent created supplier',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: 's4',
      summary: s4,
    }) === 'Заказ для этого поставщика уже создан'
  )
  assert(
    'create allowed for draft with qty',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: 's1',
      summary: s1,
    }) == null
  )
  assert(
    'create tooltip includes supplier',
    ux.getCreateOrderTooltip({ supplierName: 'Агро' }) === 'Создать заказ для Агро'
  )

  assert(
    'export blocked without supplier',
    ux.getExportDisabledReason({
      snapshotId: 'snap',
      snapshotStatus: 'ready',
      supplierId: '',
    }) === 'Сначала выберите поставщика'
  )
  assert(
    'export blocked while pending save',
    ux.getExportDisabledReason({
      snapshotId: 'snap',
      snapshotStatus: 'ready',
      supplierId: 's1',
      summary: s1,
      pendingSaveCount: 1,
    }) === 'Дождитесь сохранения количества'
  )
  assert(
    'export blocked on save error',
    ux.getExportDisabledReason({
      snapshotId: 'snap',
      snapshotStatus: 'ready',
      supplierId: 's1',
      summary: s1,
      hasSaveError: true,
    }) === 'Исправьте ошибку сохранения количества'
  )
  assert(
    'export blocked without qty',
    ux.getExportDisabledReason({
      snapshotId: 'snap',
      snapshotStatus: 'ready',
      supplierId: 's3',
      summary: s3,
    }) === 'Нет позиций с количеством для выгрузки'
  )
  assert(
    'export allowed for draft with qty',
    ux.getExportDisabledReason({
      snapshotId: 'snap',
      snapshotStatus: 'ready',
      supplierId: 's1',
      summary: s1,
    }) == null
  )
  assert(
    'export tooltip download order',
    ux.getExportTooltip({ orderCreated: true }) === 'Скачать заказ: PDF или Excel'
  )
  assert(
    'export menu draft label',
    ux.getExportMenuLabel(false) === 'Скачать черновик'
  )
  assert(
    'sync blocked while pending save',
    ux.getSyncDisabledReason({
      canSync: true,
      pendingSaveCount: 2,
    }) === 'Дождитесь сохранения количества'
  )
  assert(
    'sync blocked on save error',
    ux.getSyncDisabledReason({
      canSync: true,
      hasSaveError: true,
    }) === 'Исправьте ошибку сохранения количества'
  )
  assert(
    'sync tooltip default',
    ux.getSyncTooltip({}) === 'Обновить остатки и продажи из UMAG'
  )
  assert('canStartCreateOrder mirrors reason', ux.canStartCreateOrder({
    canGenerate: true,
    snapshotEditable: true,
    supplierId: 's1',
    summary: s1,
  }) === true)

  const zeroQtyOnCreated = {
    id: 'i-zero',
    platformSupplierId: 's2',
    finalOrderQty: 0,
    generatedPurchaseOrderId: null,
  }
  const inOrderItem = {
    id: 'i-in',
    platformSupplierId: 's2',
    finalOrderQty: 10,
    generatedPurchaseOrderId: 'po-2',
  }
  assert(
    'zero qty row locked when supplier order exists',
    ux.isItemQuantityLocked(zeroQtyOnCreated, options) === true
  )
  assert(
    'locked hint for leftover rows',
    ux.getLockedQuantityHint(zeroQtyOnCreated, options).label === 'Заказ поставщику создан' &&
      ux.getLockedQuantityHint(zeroQtyOnCreated, options).orderId === 'po-2'
  )
  assert(
    'locked hint for generated row',
    ux.getLockedQuantityHint(inOrderItem, options).label === 'Уже в заказе'
  )

  const exportRows = [
    {
      id: 'e1',
      platformSupplierId: 's4',
      finalOrderQty: 4,
      generatedPurchaseOrderId: 'po-4',
      productName: 'In order',
    },
    {
      id: 'e2',
      platformSupplierId: 's4',
      finalOrderQty: 6,
      generatedPurchaseOrderId: null,
      productName: 'Pending leftover',
    },
    {
      id: 'e3',
      platformSupplierId: 's4',
      finalOrderQty: 0,
      generatedPurchaseOrderId: null,
      productName: 'Zero',
    },
    {
      id: 'e4',
      platformSupplierId: 's1',
      finalOrderQty: 5,
      generatedPurchaseOrderId: null,
      productName: 'Draft A',
    },
    {
      id: 'e5',
      platformSupplierId: 's1',
      finalOrderQty: 2,
      generatedPurchaseOrderId: null,
      productName: 'Draft B',
    },
  ]
  const createdExport = ux.filterItemsForSupplierPlanExport(exportRows, s4)
  assert(
    'created export excludes pending leftovers',
    createdExport.length === 1 &&
      createdExport[0].id === 'e1' &&
      createdExport[0].generatedPurchaseOrderId === 'po-4'
  )
  const draftExport = ux.filterItemsForSupplierPlanExport(exportRows, s1)
  assert(
    'draft export keeps positive pending',
    draftExport.length === 2 &&
      draftExport.every((row) => row.finalOrderQty > 0 && !row.generatedPurchaseOrderId)
  )
  assert(
    'empty created export message constant',
    typeof ux.EMPTY_SUPPLIER_EXPORT_MESSAGE === 'string' &&
      ux.EMPTY_SUPPLIER_EXPORT_MESSAGE.length > 0
  )
}

async function stageDeltaAndSaveErrors() {
  console.log('Stage 2: item delta + concurrent save errors')
  const ux = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/procurementPlannerUx.js')).href
  )

  const baseState = ux.createSnapshotFilterAccumulator()
  for (const row of [
    {
      platform_supplier_id: 's1',
      umag_supplier_name: 'Агро',
      final_order_qty: 5,
      category_name: 'A',
      subcategory_name: 'a',
    },
    {
      platform_supplier_id: 's1',
      umag_supplier_name: 'Агро',
      final_order_qty: 2,
      category_name: 'A',
      subcategory_name: 'a',
    },
  ]) {
    ux.accumulateSnapshotFilterRow(row, baseState)
  }
  const base = ux.finalizeSnapshotFilterOptions(baseState)
  const oldItem = {
    id: 'sku-1',
    platformSupplierId: 's1',
    umagSupplierName: 'Агро',
    finalOrderQty: 5,
    generatedPurchaseOrderId: null,
  }
  const updatedItem = { ...oldItem, finalOrderQty: 8 }
  const afterIncrease = ux.applyItemDeltaToFilterOptions(base, oldItem, updatedItem)
  const s1After = afterIncrease.suppliers.find((s) => s.id === 's1')
  assert('delta increases total qty', s1After?.totalQty === 10)
  assert('delta keeps orderable positions', s1After?.orderablePositions === 2)
  assert('delta keeps pending status', s1After?.planningStatus === 'draft')

  const afterZero = ux.applyItemDeltaToFilterOptions(
    afterIncrease,
    updatedItem,
    { ...updatedItem, finalOrderQty: 0 }
  )
  const s1Zero = afterZero.suppliers.find((s) => s.id === 's1')
  assert('delta to zero drops orderable', s1Zero?.orderablePositions === 1)
  assert('delta to zero drops total', s1Zero?.totalQty === 2)

  const withUnassigned = ux.applyItemDeltaToFilterOptions(
    afterZero,
    {
      id: 'u1',
      platformSupplierId: null,
      finalOrderQty: 0,
    },
    {
      id: 'u1',
      platformSupplierId: null,
      finalOrderQty: 4,
    }
  )
  assert(
    'delta updates unassigned count',
    withUnassigned.unassignedOrderableCount === 1
  )

  let failed = ux.createFailedSaveIds()
  failed = ux.applySaveResultToFailedIds(failed, 'A', false)
  failed = ux.applySaveResultToFailedIds(failed, 'B', false)
  assert('fail A+B marks errors', ux.hasFailedSaves(failed) === true && failed.size === 2)
  failed = ux.applySaveResultToFailedIds(failed, 'B', true)
  assert(
    'success B keeps error A',
    ux.hasFailedSaves(failed) === true && failed.has('A') && !failed.has('B')
  )
  failed = ux.applySaveResultToFailedIds(failed, 'A', true)
  assert('success A clears all errors', ux.hasFailedSaves(failed) === false)
}

async function stageDesktopWebOnly() {
  console.log('Stage 3: webOnly filtering + route guard helpers')
  const webOnlyNav = await import(
    pathToFileURL(path.join(ROOT, 'src/platform/webOnlyNav.js')).href
  )
  const desktop = await import(
    pathToFileURL(path.join(ROOT, 'src/platform/desktopWebOnly.js')).href
  )
  const navSource = read('src/platform/platformNav.js')

  assert(
    'procurement-group id is web-only',
    webOnlyNav.WEB_ONLY_NAV_IDS.has('procurement-group')
  )
  assert(
    'platform nav marks procurement-group webOnly',
    /id:\s*'procurement-group'[\s\S]*?webOnly:\s*true/.test(navSource)
  )
  assert(
    'group children cover all procurement modules',
    /id:\s*'procurement-group'[\s\S]*?id:\s*'procurement'[\s\S]*?id:\s*'receiving'[\s\S]*?id:\s*'suppliers'[\s\S]*?id:\s*'settlements'[\s\S]*?id:\s*'supplier-payments'/.test(
      navSource
    )
  )

  const procurementGroupFixture = {
    id: 'procurement-group',
    label: 'Закупки',
    webOnly: true,
    children: [
      { id: 'procurement', path: '/platform/procurement', label: 'Закуп' },
      { id: 'receiving', path: '/platform/receiving', label: 'Приёмка' },
      { id: 'suppliers', path: '/platform/suppliers', label: 'Поставщики' },
      { id: 'settlements', path: '/platform/settlements', label: 'Взаиморасчёты' },
      {
        id: 'supplier-payments',
        path: '/platform/supplier-payments',
        label: 'Оплаты поставщикам',
      },
    ],
  }

  const filtered = webOnlyNav.excludeWebOnlyNavItems([
    {
      id: 'home',
      label: 'Главная',
      path: '/platform',
    },
    procurementGroupFixture,
    {
      id: 'products-group',
      label: 'Товары',
      children: [{ id: 'price-tags', label: 'Ценники', webOnly: true }],
    },
  ])
  assert('procurement-group fully removed from nav', !filtered.some((i) => i.id === 'procurement-group'))
  assert('unrelated groups remain', filtered.some((i) => i.id === 'home'))
  assert(
    'empty webOnly product group removed',
    !filtered.some((i) => i.id === 'products-group')
  )

  const fixtureNav = [
    procurementGroupFixture,
    {
      id: 'employees',
      children: [
        {
          id: 'employees-payroll',
          path: '/platform/employees/payroll',
          webOnly: true,
        },
      ],
    },
  ]
  const prefixes = webOnlyNav.collectWebOnlyPathPrefixes(fixtureNav)
  assert(
    'desktop helper delegates prefixes',
    desktop.getDesktopWebOnlyPathPrefixes(fixtureNav).join('|') === prefixes.join('|')
  )
  const expectedPrefixes = [
    '/platform/procurement',
    '/platform/receiving',
    '/platform/suppliers',
    '/platform/settlements',
    '/platform/supplier-payments',
  ]
  for (const prefix of expectedPrefixes) {
    assert(`prefix includes ${prefix}`, prefixes.includes(prefix))
  }
  assert(
    'payroll leaf prefix also collected',
    prefixes.includes('/platform/employees/payroll')
  )

  const nestedRoutes = [
    '/platform/procurement',
    '/platform/procurement/analytics',
    '/platform/procurement/analytics/order-1',
    '/platform/procurement/order-1',
    '/platform/receiving',
    '/platform/receiving/doc-1',
    '/platform/suppliers',
    '/platform/suppliers/sup-1',
    '/platform/settlements',
    '/platform/supplier-payments',
  ]
  for (const route of nestedRoutes) {
    assert(
      `path guard matches ${route}`,
      desktop.isDesktopWebOnlyPath(route, prefixes) === true
    )
  }
  assert(
    'unrelated path not guarded',
    desktop.isDesktopWebOnlyPath('/platform/employees', prefixes) === false
  )

  assert(
    'PWA blocked',
    desktop.isDesktopWebOnlyBlocked({ isDesktopViewport: true, pwaStandalone: true }) === true
  )
  assert(
    'narrow viewport blocked',
    desktop.isDesktopWebOnlyBlocked({ isDesktopViewport: false, pwaStandalone: false }) === true
  )
  assert(
    'desktop browser allowed',
    desktop.isDesktopWebOnlyBlocked({ isDesktopViewport: true, pwaStandalone: false }) === false
  )

  const pwaFlags = { isDesktopViewport: true, pwaStandalone: true }
  const desktopFlags = { isDesktopViewport: true, pwaStandalone: false }
  for (const prefix of expectedPrefixes) {
    assert(
      `dashboard hides ${prefix} on PWA`,
      desktop.shouldHideDesktopWebOnlyLink(prefix, pwaFlags, prefixes) === true
    )
    assert(
      `dashboard keeps ${prefix} on desktop web`,
      desktop.shouldHideDesktopWebOnlyLink(prefix, desktopFlags, prefixes) === false
    )
  }
  assert(
    'dashboard keeps employees on PWA',
    desktop.shouldHideDesktopWebOnlyLink('/platform/employees', pwaFlags, prefixes) === false
  )
}

function stageSourceContracts() {
  console.log('Stage 4: source contracts')
  const service = read('src/services/procurementPlanningService.js')
  const planner = read('src/components/procurement/ProcurementPlannerView.jsx')
  const nav = read('src/platform/platformNav.js')
  const app = read('src/App.jsx')
  const dashboard = read('src/pages/platform/PlatformDashboard.jsx')
  const select = read('src/components/suppliers/SearchableSupplierSelect.jsx')
  const pkg = read('package.json')

  assert(
    'filter options select qty + order id',
    service.includes('final_order_qty, generated_purchase_order_id')
  )
  assert(
    'filter options use summary accumulator',
    service.includes('accumulateSnapshotFilterRow') &&
      service.includes('finalizeSnapshotFilterOptions')
  )
  assert('planner has create order label', planner.includes('Создать заказ'))
  assert('planner uses FileTextIcon not Sparkles-only CTA', planner.includes('FileTextIcon'))
  assert(
    'ambiguous partial label removed',
    !planner.includes('Частично сформирован')
  )
  assert('planner shows created X of Y', planner.includes('ordersProgress.createdLabel'))
  assert('planner workflow strip', planner.includes('proc-planner__workflow'))
  assert('pending save ref guard', planner.includes('pendingSaveCountRef'))
  assert('failed save ids ref', planner.includes('failedSaveIdsRef'))
  assert('delta summary update on blur', planner.includes('applyItemDeltaToFilterOptions'))
  assert(
    'blur does not full-reload filter options',
    !/handleFinalChange[\s\S]{0,400}loadSnapshotMeta\(/.test(planner)
  )
  assert('export requires supplier', planner.includes('platformSupplierId: filters.platformSupplierId'))
  assert('export orderable only', planner.includes('orderableOnly: true'))
  assert(
    'export filters created order rows',
    planner.includes('filterItemsForSupplierPlanExport') &&
      planner.includes('EMPTY_SUPPLIER_EXPORT_MESSAGE')
  )
  assert('custom tip wrap', planner.includes('proc-planner__tip-wrap'))
  assert('supplier status renderer', planner.includes('renderOptionStatus'))
  assert(
    'selector placeholder asks to choose supplier',
    planner.includes('placeholder="Выберите поставщика"')
  )
  assert('select keeps optional status props', select.includes('renderOptionStatus = null'))
  assert(
    'nav marks procurement-group webOnly',
    /id:\s*'procurement-group'[\s\S]*webOnly:\s*true/.test(nav)
  )
  const guardedSections = [
    'procurement',
    'procurement/analytics',
    'procurement/analytics/:id',
    'procurement/:id',
    'receiving',
    'receiving/:id',
    'suppliers',
    'suppliers/:id',
    'settlements',
    'supplier-payments',
  ]
  for (const section of guardedSections) {
    const routeBlock = new RegExp(
      `path="${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]{0,260}DesktopWebOnlyRoute`
    )
    assert(`App guards ${section}`, routeBlock.test(app))
  }
  assert(
    'DesktopWebOnlyRoute wraps all procurement-group routes',
    (app.match(/DesktopWebOnlyRoute/g) || []).length >= guardedSections.length
  )
  assert(
    'dashboard uses shared web-only link helper',
    dashboard.includes('shouldHideDesktopWebOnlyLink') &&
      dashboard.includes('Активные закупы') &&
      dashboard.includes('/platform/suppliers') &&
      dashboard.includes('/platform/receiving')
  )
  assert('verify script registered', pkg.includes('verify:procurement-desktop-ux'))
}

async function main() {
  console.log('Procurement desktop UX\n')
  await stageSummariesAndWorkflow()
  await stageDeltaAndSaveErrors()
  await stageDesktopWebOnly()
  stageSourceContracts()
  console.log(`\nPassed ${testsPassed}/${testsRun}`)
}

try {
  await main()
} catch (error) {
  console.error(`\nFAILED after ${testsPassed}/${testsRun}: ${error.message}`)
  process.exit(1)
}
