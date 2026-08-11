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

  const scheduledSeven = Array.from({ length: 7 }, (_, index) => ({
    id: `sched-${index + 1}`,
    name: `Visit ${index + 1}`,
    status: 'active',
    deliveryWeekdays: ['mon'],
  }))
  const snapshotForToday = [
    {
      id: 'sched-1',
      name: 'Visit 1',
      planningStatus: 'created',
      generatedOrderId: 'po-1',
      generatedPositions: 1,
      pendingPositions: 0,
    },
    {
      id: 'sched-2',
      name: 'Visit 2',
      planningStatus: 'created',
      generatedOrderId: 'po-2',
      generatedPositions: 1,
      pendingPositions: 0,
    },
    {
      id: 'outside-draft',
      name: 'Outside Draft',
      planningStatus: 'draft',
      pendingPositions: 2,
      generatedPositions: 0,
    },
    {
      id: 'outside-created',
      name: 'Outside Created',
      planningStatus: 'created',
      generatedOrderId: 'po-x',
      generatedPositions: 1,
      pendingPositions: 0,
    },
    {
      id: 'outside-empty',
      name: 'Outside Empty',
      planningStatus: 'empty',
      pendingPositions: 0,
      generatedPositions: 0,
    },
  ]
  const progress = ux.formatOrdersProgress({
    scheduledSuppliers: scheduledSeven,
    snapshotSuppliers: snapshotForToday,
    unassignedOrderableCount: 1,
    inconsistentSupplierCount: 1,
  })
  assert(
    'today progress uses scheduled denominator',
    progress.createdLabel === 'Сегодня: создано 2 из 7'
  )
  assert('remaining N from schedule', progress.remainingLabel === 'Осталось 5')
  assert(
    'unscheduled created/draft counted',
    progress.unscheduledLabel === 'Вне графика: 2'
  )
  assert('unassigned warning present', progress.unassignedLabel.includes('Без поставщика: 1'))
  assert('inconsistent warning present', progress.inconsistentLabel === 'Расхождение: 1')
  assert('allDone false while unassigned remain', progress.allDone === false)
  assert(
    'unscheduled snapshot suppliers ignored in denominator',
    progress.total === 7 && progress.createdToday === 2
  )

  const noVisits = ux.formatOrdersProgress({
    scheduledSuppliers: [],
    snapshotSuppliers: snapshotForToday,
    unassignedOrderableCount: 0,
    inconsistentSupplierCount: 0,
  })
  assert(
    'zero visits label',
    noVisits.createdLabel === 'На сегодня визиты не запланированы'
  )
  assert(
    'zero visits marks all draft/created as unscheduled',
    noVisits.unscheduledLabel === 'Вне графика: 4'
  )

  const nameFallbackProgress = ux.formatOrdersProgress({
    scheduledSuppliers: [
      {
        id: 'new-platform-id',
        name: 'Legacy Supplier',
        status: 'active',
        deliveryWeekdays: ['mon'],
      },
    ],
    snapshotSuppliers: [
      {
        id: 'old-snapshot-id',
        name: 'Legacy Supplier',
        planningStatus: 'created',
        generatedOrderId: 'po-legacy',
        generatedPositions: 1,
        pendingPositions: 0,
      },
    ],
  })
  assert(
    'name fallback matches created order',
    nameFallbackProgress.createdLabel === 'Сегодня: создано 1 из 1' &&
      nameFallbackProgress.remainingLabel == null
  )

  const inactiveExcluded = ux.listTodaysScheduledSuppliers(
    [
      {
        id: 'active-1',
        name: 'Active',
        status: 'active',
        deliveryWeekdays: ['mon'],
      },
      {
        id: 'inactive-1',
        name: 'Inactive',
        status: 'inactive',
        deliveryWeekdays: ['mon'],
      },
      {
        id: 'archived-1',
        name: 'Archived',
        status: 'archived',
        deliveryWeekdays: ['mon'],
      },
      {
        id: 'other-day',
        name: 'Tuesday',
        status: 'active',
        deliveryWeekdays: ['tue'],
      },
    ],
    { weekdayId: 'mon' }
  )
  assert(
    'inactive excluded from today schedule',
    inactiveExcluded.length === 1 && inactiveExcluded[0].id === 'active-1'
  )

  const doneProgress = ux.formatOrdersProgress({
    scheduledSuppliers: scheduledSeven.slice(0, 2),
    snapshotSuppliers: snapshotForToday.slice(0, 2),
    unassignedOrderableCount: 0,
    inconsistentSupplierCount: 0,
  })
  assert('allDone true only without unassigned/inconsistent', doneProgress.allDone === true)
  assert(
    'allDone false with inconsistent only',
    ux.formatOrdersProgress({
      scheduledSuppliers: scheduledSeven.slice(0, 2),
      snapshotSuppliers: snapshotForToday.slice(0, 2),
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
    { id: 'sched-1', name: 'Сегодняшний', status: 'active', deliveryWeekdays: ['mon'] },
    { id: 'sched-empty', name: 'Без строк', status: 'active', deliveryWeekdays: ['mon'] },
  ]
  const catalog = [
    ...scheduled,
    { id: 'other-1', name: 'Другой день', status: 'active', deliveryWeekdays: ['tue'] },
    { id: 'inactive-1', name: 'Неактивный', status: 'inactive', deliveryWeekdays: ['mon'] },
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
    ux.isSupplierInTodaySchedule('other-1', scheduled, snapshotSuppliers) === false &&
      ux.isSupplierInTodaySchedule('sched-1', scheduled, snapshotSuppliers) === true
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
  const page = read('src/pages/platform/procurement/ProcurementPage.jsx')
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
  assert(
    'planner today progress uses schedule helpers',
    planner.includes('listTodaysScheduledSuppliers') &&
      planner.includes('getAllSuppliersSync') &&
      planner.includes('dataVersion')
  )
  assert('planner shows unscheduled warning', planner.includes('ordersProgress.unscheduledLabel'))
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
      planner.includes('На сегодня визитов нет')
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
