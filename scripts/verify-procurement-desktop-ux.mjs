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

  const inactiveExcluded = ux.listTodaysOrderSuppliers(
    [
      {
        id: 'active-1',
        name: 'Active',
        status: 'active',
        orderWeekdays: ['mon'],
      },
      {
        id: 'inactive-1',
        name: 'Inactive',
        status: 'inactive',
        orderWeekdays: ['mon'],
      },
      {
        id: 'archived-1',
        name: 'Archived',
        status: 'archived',
        orderWeekdays: ['mon'],
      },
      {
        id: 'other-day',
        name: 'Tuesday',
        status: 'active',
        orderWeekdays: ['tue'],
      },
    ],
    { weekdayId: 'mon' }
  )
  assert(
    'inactive excluded from today order list',
    inactiveExcluded.length === 1 && inactiveExcluded[0].id === 'active-1'
  )

  const kezi = {
    id: 'kezi',
    name: 'TOO Kezi',
    status: 'active',
    orderWeekdays: ['wed'],
    deliveryWeekdays: ['thu'],
  }
  assert(
    'Kezi excluded on delivery Thursday',
    ux.listTodaysOrderSuppliers([kezi], { weekdayId: 'thu' }).length === 0
  )
  assert(
    'Kezi included on order Wednesday',
    ux.listTodaysOrderSuppliers([kezi], { weekdayId: 'wed' }).length === 1 &&
      ux.listTodaysOrderSuppliers([kezi], { weekdayId: 'wed' })[0].id === 'kezi'
  )
  const deliveryOnly = {
    id: 'd-only',
    name: 'Only Delivery',
    status: 'active',
    orderWeekdays: [],
    deliveryWeekdays: ['thu'],
  }
  assert(
    'delivery-only excluded from today order list',
    ux.listTodaysOrderSuppliers([deliveryOnly], { weekdayId: 'thu' }).length === 0
  )

  assert(
    'workflow renders no step line without a supplier',
    ux.getSupplierWorkflowStatus({ supplierId: '' }).step === 'select_supplier' &&
      ux.getSupplierWorkflowStatus({ supplierId: '' }).label === null
  )
  assert(
    'workflow enter qty drops the step numbering',
    ux.getSupplierWorkflowStatus({ supplierId: 's3', summary: s3 }).step === 'enter_qty' &&
      ux.getSupplierWorkflowStatus({ supplierId: 's3', summary: s3 }).label ===
        'Укажите количество'
  )
  assert(
    'workflow draft',
    ux
      .getSupplierWorkflowStatus({ supplierId: 's1', summary: s1 })
      .label.includes('Черновик · 2 позиции')
  )
  assert(
    'workflow after an order invites the next one',
    ux.getSupplierWorkflowStatus({ supplierId: 's2', summary: s2 }).step === 'ordered' &&
      ux.getSupplierWorkflowStatus({ supplierId: 's2', summary: s2 }).orderId === 'po-2' &&
      ux
        .getSupplierWorkflowStatus({ supplierId: 's2', summary: s2 })
        .label.includes('можно заказать ещё')
  )
  assert(
    'workflow shows past orders as history next to a fresh draft',
    ux.getSupplierWorkflowStatus({ supplierId: 's4', summary: s4 }).step === 'draft' &&
      ux
        .getSupplierWorkflowStatus({ supplierId: 's4', summary: s4 })
        .historyLabel.startsWith('Уже заказано:')
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
    'an existing order never blocks the next one',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: 's2',
      summary: s2,
    }) == null
  )
  assert(
    'a missing qty is the only qty-related blocker left',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: 's2',
      summary: { ...s2, orderablePositions: 0 },
    }) === 'Укажите количество больше 0 хотя бы для одной позиции'
  )
  assert(
    'repeat order allowed for a supplier that already has one',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: 's4',
      summary: s4,
    }) == null
  )
  assert(
    'repeat order stays allowed when the legacy backend keeps qty on ordered rows',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: 's-legacy',
      summary: {
        id: 's-legacy',
        orderablePositions: 3,
        pendingPositions: 0,
        generatedPositions: 3,
        generatedOrderId: 'po-legacy',
      },
    }) == null
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
    'export menu plan label',
    ux.getExportMenuLabel(false) === 'Скачать план'
  )
  assert(
    'export tooltip plan label',
    ux.getExportTooltip({ orderCreated: false }) === 'Скачать план: PDF или Excel'
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
    'a row of the selected supplier stays editable after its order exists',
    ux.canEditItemQuantity(inOrderItem, { selectedSupplierId: 's2' }) === true
  )
  assert(
    'a row with no history renders a dash, not an order hint',
    ux.getItemOrderHistory(zeroQtyOnCreated).documents === 0 &&
      ux.formatOrderHistoryLabel(ux.getItemOrderHistory(zeroQtyOnCreated)) === null
  )
  assert(
    'legacy row history falls back to exactly one document',
    ux.getItemOrderHistory(inOrderItem).documents === 1 &&
      ux.getItemOrderHistory(inOrderItem).qty === 0 &&
      ux.getItemOrderHistory(inOrderItem).orderId === 'po-2' &&
      ux.getItemOrderHistory(inOrderItem).source === 'fallback'
  )
  assert(
    'aggregate history fields win over the legacy single order id',
    ux.getItemOrderHistory({
      ...inOrderItem,
      ordered_qty_total: 30,
      ordered_document_count: 3,
    }).documents === 3 &&
      ux.getItemOrderHistory({
        ...inOrderItem,
        ordered_qty_total: 30,
        ordered_document_count: 3,
      }).qty === 30
  )
  assert(
    'history label is pluralised',
    ux.formatOrderHistoryLabel({ documents: 1 }) === 'Заказано · 1 документ' &&
      ux.formatOrderHistoryLabel({ documents: 2 }) === 'Заказано · 2 документа' &&
      ux.formatOrderHistoryLabel({ documents: 5 }) === 'Заказано · 5 документов'
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
  // s4 already has po-4 and a fresh positive row: the export follows what is about to
  // be ordered, not the document that was already sent.
  const repeatExport = ux.filterItemsForSupplierPlanExport(exportRows, s4)
  assert(
    'export follows the fresh draft of a supplier that already has an order',
    repeatExport.length === 1 && repeatExport[0].id === 'e2'
  )
  assert(
    'export menu still says «заказ» only when nothing new is drafted',
    ux.isSupplierPlanExportOrder(s4) === false &&
      ux.isSupplierPlanExportOrder(s2) === true &&
      ux.getExportMenuLabel(ux.isSupplierPlanExportOrder(s2)) === 'Скачать заказ'
  )
  const createdOnlyExport = ux.filterItemsForSupplierPlanExport(
    exportRows.filter((row) => row.id !== 'e2'),
    s4
  )
  assert(
    'without a draft the export falls back to the generated order rows',
    createdOnlyExport.length === 1 &&
      createdOnlyExport[0].id === 'e1' &&
      createdOnlyExport[0].generatedPurchaseOrderId === 'po-4'
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

  const navigationRows = [
    { id: 'q1', editable: true },
    { id: 'q2', editable: false },
    { id: 'q3', editable: true },
  ]
  assert(
    'Enter navigation skips non-editable rows',
    ux.getNextEditableItemId(navigationRows, 'q1', (row) => row.editable) === 'q3'
  )
  assert(
    'Enter navigation stops at the last editable row',
    ux.getNextEditableItemId(navigationRows, 'q3', (row) => row.editable) == null
  )
  assert(
    'next page navigation can find its first editable row',
    ux.getFirstEditableItemId(navigationRows, (row) => row.editable) === 'q1'
  )
}

async function stageFilterOptionsCache() {
  console.log('Stage 2b: filter options SWR cache')
  const cache = await import(
    pathToFileURL(path.join(ROOT, 'src/services/procurementFilterOptionsCache.js')).href
  )
  const ux = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/procurementPlannerUx.js')).href
  )

  cache.resetFilterOptionsCacheForTests()
  const storage = cache.createMemoryStorage()
  const sampleOptions = {
    categories: ['A'],
    categorySubcategories: [{ categoryName: 'A', subcategoryName: 'a' }],
    suppliers: [{ id: 's1', name: 'Агро', planningStatus: 'draft' }],
    generatedSupplierCount: 0,
    pendingSupplierCount: 1,
    inconsistentSupplierCount: 0,
    unassignedOrderableCount: 0,
  }

  let scanCount = 0
  const scan = async () => {
    scanCount += 1
    return {
      ...sampleOptions,
      suppliers: [{ id: 's1', name: `Агро-${scanCount}`, planningStatus: 'draft' }],
      pendingSupplierCount: scanCount,
    }
  }

  const now = Date.now()
  cache.setCachedFilterOptions('snap-1', sampleOptions, { storage, now })
  const hit = cache.getCachedFilterOptions('snap-1', { storage, now })
  assert('cache hit returns options without scan', hit?.options?.suppliers?.[0]?.id === 's1')

  scanCount = 0
  const fresh = await cache.loadSnapshotFilterOptionsCached('snap-1', scan, {
    storage,
    now,
    forceRefresh: false,
  })
  assert('fresh cache no scan', fresh.fromCache === true && fresh.refreshPromise == null)
  assert('fresh cache keeps options', fresh.options.suppliers[0].name === 'Агро')
  assert('fresh cache scan count zero', scanCount === 0)

  const staleNow = now + cache.FILTER_OPTIONS_REVALIDATE_AFTER_MS + 1000
  scanCount = 0
  const swr = await cache.loadSnapshotFilterOptionsCached('snap-1', scan, {
    storage,
    now: staleNow,
    forceRefresh: false,
  })
  assert('stale cache background scan', swr.fromCache === true && Boolean(swr.refreshPromise))
  assert('stale serves cache immediately', swr.options.suppliers[0].name === 'Агро')
  const refreshed = await swr.refreshPromise
  assert(
    'background refresh updates cache',
    refreshed.suppliers[0].name === 'Агро-1' &&
      cache.getCachedFilterOptions('snap-1', { storage, now: staleNow })?.options?.suppliers?.[0]
        ?.name === 'Агро-1'
  )

  scanCount = 0
  const forced = await cache.loadSnapshotFilterOptionsCached('snap-1', scan, {
    storage,
    now: staleNow,
    forceRefresh: true,
  })
  assert(
    'forced refresh updates cache',
    forced.fromCache === false &&
      forced.options.suppliers[0].name === 'Агро-1' &&
      cache.getCachedFilterOptions('snap-1', { storage, now: Date.now() })?.options?.suppliers?.[0]
        ?.name === 'Агро-1'
  )

  storage.setItem(cache.FILTER_OPTIONS_STORAGE_KEY, '{not-json')
  assert(
    'invalid storage ignored',
    cache.getCachedFilterOptions('snap-missing', { storage }) == null
  )

  cache.resetFilterOptionsCacheForTests()
  cache.setCachedFilterOptions(
    'snap-expired',
    sampleOptions,
    { storage, now: Date.now() - cache.FILTER_OPTIONS_CACHE_TTL_MS - 1000 }
  )
  cache.resetFilterOptionsCacheForTests()
  assert(
    'stale storage ignored',
    cache.getCachedFilterOptions('snap-expired', {
      storage,
      now: Date.now(),
    }) == null
  )

  cache.resetFilterOptionsCacheForTests()
  scanCount = 0
  let resolveScan
  const slowScan = () =>
    new Promise((resolve) => {
      scanCount += 1
      resolveScan = () => resolve(sampleOptions)
    })
  const first = cache.revalidateSnapshotFilterOptions('snap-dedupe', slowScan, { storage })
  const second = cache.revalidateSnapshotFilterOptions('snap-dedupe', slowScan, { storage })
  assert('in-flight dedupe shares promise', first === second)
  assert('in-flight dedupe single scan', scanCount === 1)
  resolveScan()
  await first

  cache.resetFilterOptionsCacheForTests()
  scanCount = 0
  let resolveRefresh
  const delayedScan = () =>
    new Promise((resolve) => {
      scanCount += 1
      resolveRefresh = () =>
        resolve({
          ...sampleOptions,
          suppliers: [{ id: 's1', name: 'Updated', planningStatus: 'created' }],
        })
    })
  const keepCachedAt = Date.now() - cache.FILTER_OPTIONS_REVALIDATE_AFTER_MS - 1000
  cache.setCachedFilterOptions('snap-keep', sampleOptions, {
    storage,
    now: keepCachedAt,
  })
  const keep = await cache.loadSnapshotFilterOptionsCached('snap-keep', delayedScan, {
    storage,
    now: Date.now(),
    forceRefresh: false,
  })
  assert(
    'cached list preserved during revalidation',
    keep.options.suppliers[0].name === 'Агро' && scanCount === 1
  )
  resolveRefresh()
  await keep.refreshPromise
  assert(
    'revalidation replaces cache after completion',
    cache.getCachedFilterOptions('snap-keep', { storage })?.options?.suppliers?.[0]?.name ===
      'Updated'
  )

  cache.resetFilterOptionsCacheForTests()
  const deltaStorage = cache.createMemoryStorage()
  const baseForDelta = {
    ...sampleOptions,
    suppliers: [
      {
        id: 's1',
        name: 'Агро',
        planningStatus: 'draft',
        orderablePositions: 1,
        totalQty: 1,
        pendingPositions: 1,
        generatedPositions: 0,
        generatedOrderId: null,
      },
    ],
  }
  cache.setCachedFilterOptions('snap-delta', baseForDelta, {
    storage: deltaStorage,
    now: Date.now(),
  })
  const deltaNext = ux.applyItemDeltaToFilterOptions(
    baseForDelta,
    {
      id: 'sku-1',
      platformSupplierId: 's1',
      umagSupplierName: 'Агро',
      finalOrderQty: 1,
      generatedPurchaseOrderId: null,
    },
    {
      id: 'sku-1',
      platformSupplierId: 's1',
      umagSupplierName: 'Агро',
      finalOrderQty: 4,
      generatedPurchaseOrderId: null,
    }
  )
  cache.setCachedFilterOptions('snap-delta', deltaNext, {
    storage: deltaStorage,
    now: Date.now(),
  })
  cache.resetFilterOptionsCacheForTests()
  const persistedDelta = cache.getCachedFilterOptions('snap-delta', { storage: deltaStorage })
  assert(
    'local delta persisted',
    persistedDelta?.options?.suppliers?.[0]?.totalQty === 4 &&
      persistedDelta?.options?.suppliers?.[0]?.planningStatus === 'draft'
  )

  const selectSrc = read('src/components/suppliers/SearchableSupplierSelect.jsx')
  assert(
    'cold loading text',
    selectSrc.includes("loadingLabel = 'Загрузка поставщиков…'") &&
      selectSrc.includes('{loading ? loadingLabel : emptyLabel}')
  )
}

async function stageSupplierScopeOptions() {
  console.log('Stage 2c: Today/All supplier selector scope')
  const ux = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/procurementPlannerUx.js')).href
  )

  const scheduled = [
    { id: 'sched-1', name: 'Сегодняшний', status: 'active', orderWeekdays: ['mon'] },
    { id: 'sched-empty', name: 'Без строк', status: 'active', orderWeekdays: ['mon'] },
  ]
  const catalog = [
    ...scheduled,
    { id: 'other-1', name: 'Другой день', status: 'active', orderWeekdays: ['tue'] },
    { id: 'inactive-1', name: 'Неактивный', status: 'inactive', orderWeekdays: ['mon'] },
  ]
  const snapshotSuppliers = [
    {
      id: 'sched-1',
      name: 'Сегодняшний',
      planningStatus: 'draft',
      orderablePositions: 2,
      totalQty: 5,
      pendingPositions: 2,
      generatedPositions: 0,
      generatedOrderId: null,
    },
    {
      id: 'legacy-1',
      name: 'Legacy Snapshot',
      planningStatus: 'draft',
      orderablePositions: 1,
      totalQty: 3,
      pendingPositions: 1,
      generatedPositions: 0,
      generatedOrderId: null,
    },
  ]

  const today = ux.buildPlannerSupplierSelectOptions({
    scope: 'today',
    scheduledSuppliers: scheduled,
    catalogSuppliers: catalog,
    snapshotSuppliers,
  })
  assert('default Today options', today.length === 2)
  assert(
    'N count matches scheduled',
    today.length === scheduled.length && today.some((row) => row.id === 'sched-empty')
  )
  assert(
    'planned missing snapshot visible',
    today.some((row) => row.id === 'sched-empty' && row.name === 'Без строк')
  )

  const all = ux.buildPlannerSupplierSelectOptions({
    scope: 'all',
    scheduledSuppliers: scheduled,
    catalogSuppliers: catalog,
    snapshotSuppliers,
  })
  assert(
    'All union',
    all.some((row) => row.id === 'sched-1') &&
      all.some((row) => row.id === 'other-1') &&
      all.some((row) => row.id === 'sched-empty')
  )
  assert(
    'legacy visible in All',
    all.some((row) => row.id === 'legacy-1' && row.name === 'Legacy Snapshot')
  )
  assert(
    'inactive excluded from All',
    !all.some((row) => row.id === 'inactive-1')
  )
  assert(
    'scope switch clears hidden selection',
    ux.isSupplierInTodaysOrderList('other-1', scheduled, snapshotSuppliers) === false &&
      ux.isSupplierInTodaysOrderList('sched-1', scheduled, snapshotSuppliers) === true
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

  // Вся группа «Закупки» работает на телефоне: ни группа, ни один её пункт
  // больше не помечены webOnly. Список ниже — полный, чтобы возврат флага
  // на любой пункт был пойман здесь.
  for (const id of [
    'procurement-group',
    'procurement',
    'receiving',
    'suppliers',
    'settlements',
    'supplier-payments',
  ]) {
    assert(`${id} is not web-only`, !webOnlyNav.WEB_ONLY_NAV_IDS.has(id))
  }
  assert(
    'only payroll and price-tags stay desktop-only',
    [...webOnlyNav.WEB_ONLY_NAV_IDS].sort().join(',') === 'employees-payroll,price-tags'
  )
  const groupBlock =
    navSource.match(/id:\s*'procurement-group'[\s\S]*?\n  \},/)?.[0] || ''
  assert(
    'platform nav marks nothing in the group webOnly',
    groupBlock.length > 0 && !/webOnly:\s*true/.test(groupBlock)
  )
  assert(
    'group children cover procurement nav modules',
    /id:\s*'procurement-group'[\s\S]*?id:\s*'procurement'[\s\S]*?id:\s*'receiving'[\s\S]*?id:\s*'suppliers'[\s\S]*?id:\s*'supplier-finance'/.test(
      navSource
    )
  )
  assert(
    'legacy settlements/payments are not in visible nav',
    !/id:\s*'settlements'/.test(groupBlock) && !/id:\s*'supplier-payments'/.test(groupBlock)
  )

  const procurementGroupFixture = {
    id: 'procurement-group',
    label: 'Закупки',
    children: [
      { id: 'procurement', path: '/platform/procurement', label: 'Закуп' },
      { id: 'receiving', path: '/platform/receiving', label: 'Приёмка', webOnly: true },
      { id: 'suppliers', path: '/platform/suppliers', label: 'Поставщики', webOnly: true },
      {
        id: 'settlements',
        path: '/platform/settlements',
        label: 'Взаиморасчёты',
        webOnly: true,
      },
      {
        id: 'supplier-payments',
        path: '/platform/supplier-payments',
        label: 'Оплаты поставщикам',
        webOnly: true,
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
  const mobileProcurementGroup = filtered.find((i) => i.id === 'procurement-group')
  assert('procurement-group survives on mobile', Boolean(mobileProcurementGroup))
  assert(
    'only «Закуп» remains inside it',
    mobileProcurementGroup.children.length === 1 &&
      mobileProcurementGroup.children[0].id === 'procurement'
  )
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
    '/platform/receiving',
    '/platform/suppliers',
    '/platform/settlements',
    '/platform/supplier-payments',
  ]
  for (const prefix of expectedPrefixes) {
    assert(`prefix includes ${prefix}`, prefixes.includes(prefix))
  }
  assert(
    'procurement is not a web-only prefix any more',
    !prefixes.includes('/platform/procurement')
  )
  assert(
    'payroll leaf prefix also collected',
    prefixes.includes('/platform/employees/payroll')
  )

  const nestedRoutes = [
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
  for (const route of [
    '/platform/procurement',
    '/platform/procurement/analytics',
    '/platform/procurement/analytics/order-1',
    '/platform/procurement/order-1',
  ]) {
    assert(
      `path guard lets ${route} through`,
      desktop.isDesktopWebOnlyPath(route, prefixes) === false
    )
  }
  assert(
    'unrelated path not guarded',
    desktop.isDesktopWebOnlyPath('/platform/employees', prefixes) === false
  )

  // Expectation flipped deliberately: launch mode no longer hides anything.
  // Hiding «Закупки» in an installed app on a full-size screen was
  // indistinguishable from a bug for the person using it.
  assert(
    'installed app on a wide screen is NOT blocked',
    desktop.isDesktopWebOnlyBlocked({ isDesktopViewport: true, pwaStandalone: true }) === false
  )
  assert(
    'narrow viewport blocked',
    desktop.isDesktopWebOnlyBlocked({ isDesktopViewport: false, pwaStandalone: false }) === true
  )
  assert(
    'desktop browser allowed',
    desktop.isDesktopWebOnlyBlocked({ isDesktopViewport: true, pwaStandalone: false }) === false
  )

  // Width decides, launch mode does not: an installed app on a wide screen keeps
  // its tiles, a phone hides them.
  const narrowFlags = { isDesktopViewport: false }
  const wideFlags = { isDesktopViewport: true }
  for (const prefix of expectedPrefixes) {
    assert(
      `dashboard hides ${prefix} on a narrow screen`,
      desktop.shouldHideDesktopWebOnlyLink(prefix, narrowFlags, prefixes) === true
    )
    assert(
      `dashboard keeps ${prefix} on a wide screen`,
      desktop.shouldHideDesktopWebOnlyLink(prefix, wideFlags, prefixes) === false
    )
    assert(
      `dashboard keeps ${prefix} in an installed app on a wide screen`,
      desktop.shouldHideDesktopWebOnlyLink(
        prefix,
        { isDesktopViewport: true, pwaStandalone: true },
        prefixes
      ) === false
    )
  }
  assert(
    'dashboard keeps employees on PWA',
    desktop.shouldHideDesktopWebOnlyLink('/platform/employees', narrowFlags, prefixes) === false
  )
  assert(
    'dashboard keeps the «Закуп» tile on a narrow screen',
    desktop.shouldHideDesktopWebOnlyLink('/platform/procurement', narrowFlags, prefixes) === false
  )
}

function stageSourceContracts() {
  console.log('Stage 4: source contracts')
  const service = read('src/services/procurementPlanningService.js')
  const planner = read('src/components/procurement/ProcurementPlannerView.jsx')
  const uxSrc = read('src/utils/procurementPlannerUx.js')
  const page = read('src/pages/platform/procurement/ProcurementPage.jsx')
  const nav = read('src/platform/platformNav.js')
  const app = read('src/App.jsx')
  const dashboard = read('src/pages/platform/PlatformDashboard.jsx')
  const select = read('src/components/suppliers/SearchableSupplierSelect.jsx')
  const pkg = read('package.json')

  const listFnMatch = uxSrc.match(
    /export function listTodaysOrderSuppliers\([\s\S]*?\n\}/
  )
  assert(
    'listTodaysOrderSuppliers filters by orderWeekdays only',
    Boolean(listFnMatch) &&
      listFnMatch[0].includes('orderWeekdays') &&
      !listFnMatch[0].includes('deliveryWeekdays') &&
      !uxSrc.includes('listTodaysScheduledSuppliers') &&
      !uxSrc.includes('isSupplierInTodaySchedule') &&
      uxSrc.includes('isSupplierInTodaysOrderList')
  )
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
  assert(
    'planner still scopes the supplier list by today order days',
    planner.includes('listTodaysOrderSuppliers') &&
      !planner.includes('listTodaysScheduledSuppliers') &&
      planner.includes('getAllSuppliersSync') &&
      planner.includes('dataVersion')
  )
  assert('planner workflow strip', planner.includes('proc-planner__workflow'))
  assert(
    'the bulky orders-progress block is gone together with its computation',
    !planner.includes('Прогресс заказов') &&
      !planner.includes('ordersProgress') &&
      !planner.includes('formatOrdersProgress') &&
      !read('src/utils/procurementPlannerUx.js').includes(
        'export function formatOrdersProgress'
      ) &&
      !planner.includes('proc-planner__meta')
  )
  assert(
    'snapshot line and chips live in the tabs row, not in a card above the table',
    planner.includes('createPortal') &&
      planner.includes('headerSlot') &&
      planner.includes('proc-planner__topbar') &&
      read('src/pages/platform/procurement/ProcurementPage.jsx').includes(
        'procurement-page__tabs-aside'
      ) &&
      read('src/pages/platform/procurement/ProcurementPage.jsx').includes(
        '<ProcurementPlannerView headerSlot={tabsAsideEl} />'
      )
  )
  assert('pending save ref guard', planner.includes('pendingSaveCountRef'))
  assert('failed save ids ref', planner.includes('failedSaveIdsRef'))
  assert('delta summary update on blur', planner.includes('applyItemDeltaToFilterOptions'))
  assert(
    'individual quantity save patches only its row',
    planner.includes('function applySavedItem(updated)') &&
      planner.includes('it.id === updated.id ? updated : it')
  )
  const quantityCommitBlock = planner.match(
    /async function commitQuantity[\s\S]*?async function handleReset/
  )?.[0] || ''
  const resetBlock = planner.match(/async function handleReset[\s\S]*?function findVisibleQtyInputs/)?.[0] || ''
  assert('individual quantity save does not reload the table', !quantityCommitBlock.includes('loadItems('))
  assert(
    'individual quantity save block is actually inspected',
    quantityCommitBlock.includes('updateItemFinalOrderQty') &&
      quantityCommitBlock.includes('applySavedItem(updated)')
  )
  assert('reset-to-recommendation does not reload the table', !resetBlock.includes('loadItems('))
  assert(
    'Enter advances to next editable SKU and across pages',
    planner.includes('getNextEditableItemId') &&
      planner.includes("pendingFocusRef.current = 'firstEditable'") &&
      planner.includes('getFirstEditableItemId')
  )
  assert(
    'failed or duplicate save never advances focus',
    planner.includes('savingItemIdsRef.current.has(item.id)') &&
      planner.includes('if (!result.ok) return') &&
      planner.includes('if (e.repeat) return')
  )
  assert(
    'blur and Enter share one commit path',
    planner.includes('onBlur={(e) => void commitQuantity(item, e.target.value)}') &&
      planner.includes('void handleQtyEnter(item, e.target)')
  )
  assert(
    'UMAG sync invalidates norms cache',
    planner.includes('invalidateProcurementNormsCache()')
  )
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
  assert(
    'no visible planning badges in planner dropdown',
    !planner.includes('renderOptionStatus') &&
      !planner.includes('renderSupplierStatus') &&
      !planner.includes('SUPPLIER_PLANNING_STATUS_LABELS')
  )
  assert(
    'selector uses loading state for cold miss',
    planner.includes('Загрузка поставщиков…') &&
      planner.includes('filterOptionsLoading') &&
      planner.includes('getCachedFilterOptions')
  )
  assert(
    'select supports loading/empty labels',
    select.includes('loadingLabel') &&
      select.includes('Загрузка поставщиков…') &&
      select.includes('emptyLabel')
  )
  assert(
    'select supports dropdownHeader',
    select.includes('dropdownHeader') && select.includes('searchable-supplier-select__header')
  )
  assert(
    'planner defaults Today supplier scope',
    planner.includes("useState('today')") &&
      planner.includes('buildPlannerSupplierSelectOptions') &&
      planner.includes('Сегодня ·') &&
      planner.includes('На сегодня заказов нет') &&
      !planner.includes('На сегодня визитов нет')
  )
  assert(
    'planner persists local filter delta to cache',
    planner.includes('setCachedFilterOptions(snapshot.id, next)')
  )
  assert(
    'Orders tab no plan list',
    !page.includes('ProcurementPlanDayList') && !page.includes('Визиты поставщиков')
  )
  assert(
    'procurement tabs order Planning → Orders → Norms',
    /role="tablist"[\s\S]*Планирование[\s\S]*Заказы[\s\S]*Нормы/.test(page)
  )
  assert(
    'nav no longer marks any sibling of «Закуп» desktop-only',
    !/id:\s*'receiving'[\s\S]{0,320}webOnly:\s*true/.test(nav) &&
      !/id:\s*'suppliers'[\s\S]{0,320}webOnly:\s*true/.test(nav) &&
      !/id:\s*'settlements'[\s\S]{0,320}webOnly:\s*true/.test(nav) &&
      !/id:\s*'supplier-payments'[\s\S]{0,320}webOnly:\s*true/.test(nav)
  )
  // Каждый маршрут группы перечислен поимённо: если gate вернут на любой из
  // них, упадёт именно этот assert, а не общий подсчёт.
  const ungatedSections = [
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
  for (const section of ungatedSections) {
    const routeBlock = new RegExp(
      `path="${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]{0,260}DesktopWebOnlyRoute`
    )
    assert(`App does not gate ${section}`, !routeBlock.test(app))
  }
  assert(
    'no route in App.jsx is wrapped in DesktopWebOnlyRoute',
    !app.includes('<DesktopWebOnlyRoute>')
  )
  assert(
    'dashboard still uses the shared web-only link helper',
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
  await stageFilterOptionsCache()
  await stageSupplierScopeOptions()
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
