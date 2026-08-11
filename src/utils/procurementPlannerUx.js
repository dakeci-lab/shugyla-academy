/**
 * Pure UX helpers for the procurement planner (summaries, workflow, guards).
 */

function finiteNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function positiveQty(row) {
  return finiteNumber(row?.final_order_qty ?? row?.finalOrderQty, 0) > 0
}

function supplierIdOf(row) {
  return row?.platform_supplier_id ?? row?.platformSupplierId ?? null
}

function generatedIdOf(row) {
  return row?.generated_purchase_order_id ?? row?.generatedPurchaseOrderId ?? null
}

function qtyOf(row) {
  return finiteNumber(row?.final_order_qty ?? row?.finalOrderQty, 0)
}

function supplierNameOf(row, fallbackId = '') {
  return row?.umag_supplier_name || row?.umagSupplierName || fallbackId || ''
}

/** True when the supplier already has a purchase order for this snapshot revision. */
export function isSupplierOrderCreated(summary) {
  return Boolean(summary?.generatedOrderId) || (summary?.generatedPositions || 0) > 0
}

/** Generated order exists but leftover pending qty remains (server will skip second create). */
export function isSupplierInconsistent(summary) {
  return isSupplierOrderCreated(summary) && (summary?.pendingPositions || 0) > 0
}

/**
 * Create empty accumulator used while paginating snapshot filter rows.
 */
export function createSnapshotFilterAccumulator() {
  return {
    categories: new Set(),
    pairs: new Set(),
    suppliers: new Map(),
    unassignedOrderableCount: 0,
  }
}

function emptySupplierSummary(id, name = '') {
  return {
    id,
    name: name || id,
    orderablePositions: 0,
    totalQty: 0,
    pendingPositions: 0,
    generatedPositions: 0,
    generatedOrderId: null,
  }
}

/**
 * Fold one DB/client row into the filter accumulator.
 * @param {object} row
 * @param {ReturnType<typeof createSnapshotFilterAccumulator>} state
 */
export function accumulateSnapshotFilterRow(row, state) {
  const cat = row?.category_name || row?.categoryName || ''
  const sub = row?.subcategory_name || row?.subcategoryName || ''
  if (cat) state.categories.add(cat)
  if (cat && sub) state.pairs.add(`${cat}\u0000${sub}`)

  const qty = qtyOf(row)
  const orderable = qty > 0
  const generatedId = generatedIdOf(row)
  const supplierId = supplierIdOf(row)
  const supplierName = supplierNameOf(row, supplierId)

  if (!supplierId) {
    if (orderable) state.unassignedOrderableCount += 1
    return
  }

  let summary = state.suppliers.get(supplierId)
  if (!summary) {
    summary = emptySupplierSummary(supplierId, supplierName)
    state.suppliers.set(supplierId, summary)
  } else if (supplierName && summary.name === summary.id) {
    summary.name = supplierName
  } else if (supplierName && !summary.name) {
    summary.name = supplierName
  }

  if (!orderable) return

  summary.orderablePositions += 1
  summary.totalQty += qty
  if (generatedId) {
    summary.generatedPositions += 1
    if (!summary.generatedOrderId) summary.generatedOrderId = generatedId
  } else {
    summary.pendingPositions += 1
  }
}

/** @param {object} summary */
export function getSupplierPlanningStatus(summary) {
  if (isSupplierOrderCreated(summary)) return 'created'
  if ((summary?.orderablePositions || 0) > 0 || (summary?.pendingPositions || 0) > 0) {
    return 'draft'
  }
  return 'empty'
}

export const SUPPLIER_PLANNING_STATUS_LABELS = {
  created: 'создан',
  draft: 'черновик',
  empty: 'нет позиций',
}

function recomputeSupplierAggregates(suppliers, unassignedOrderableCount = 0) {
  let generatedSupplierCount = 0
  let pendingSupplierCount = 0
  let inconsistentSupplierCount = 0

  const nextSuppliers = (suppliers || []).map((summary) => {
    const planningStatus = getSupplierPlanningStatus(summary)
    if (planningStatus === 'created') generatedSupplierCount += 1
    if (planningStatus === 'draft') pendingSupplierCount += 1
    if (isSupplierInconsistent(summary)) inconsistentSupplierCount += 1
    return { ...summary, planningStatus }
  })

  return {
    suppliers: nextSuppliers,
    generatedSupplierCount,
    pendingSupplierCount,
    inconsistentSupplierCount,
    unassignedOrderableCount,
  }
}

/**
 * Finalize accumulator into filter options + global progress counters.
 * @param {ReturnType<typeof createSnapshotFilterAccumulator>} state
 */
export function finalizeSnapshotFilterOptions(state) {
  const categorySubcategories = [...state.pairs]
    .map((key) => {
      const [categoryName, subcategoryName] = key.split('\u0000')
      return { categoryName, subcategoryName }
    })
    .sort((a, b) => {
      const catCmp = a.categoryName.localeCompare(b.categoryName, 'ru')
      if (catCmp !== 0) return catCmp
      return a.subcategoryName.localeCompare(b.subcategoryName, 'ru')
    })

  const aggregates = recomputeSupplierAggregates(
    [...state.suppliers.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    state.unassignedOrderableCount
  )

  return {
    categories: [...state.categories].sort((a, b) => a.localeCompare(b, 'ru')),
    categorySubcategories,
    ...aggregates,
  }
}

/** Normalize an item/row into a contribution used by summary deltas. */
export function getItemSummaryContribution(item) {
  const supplierId = supplierIdOf(item)
  const qty = qtyOf(item)
  const generatedId = generatedIdOf(item)
  return {
    supplierId,
    supplierName: supplierNameOf(item, supplierId || ''),
    qty,
    orderable: qty > 0,
    generatedId: generatedId || null,
  }
}

function cloneFilterOptions(filterOptions) {
  return {
    categories: [...(filterOptions?.categories || [])],
    categorySubcategories: [...(filterOptions?.categorySubcategories || [])],
    suppliers: (filterOptions?.suppliers || []).map((s) => ({ ...s })),
    generatedSupplierCount: filterOptions?.generatedSupplierCount || 0,
    pendingSupplierCount: filterOptions?.pendingSupplierCount || 0,
    inconsistentSupplierCount: filterOptions?.inconsistentSupplierCount || 0,
    unassignedOrderableCount: filterOptions?.unassignedOrderableCount || 0,
  }
}

function applyContribution(options, contribution, sign) {
  const delta = sign >= 0 ? 1 : -1
  if (!contribution?.supplierId) {
    if (contribution?.orderable) {
      options.unassignedOrderableCount = Math.max(
        0,
        (options.unassignedOrderableCount || 0) + delta
      )
    }
    return
  }

  let summary = options.suppliers.find((s) => s.id === contribution.supplierId)
  if (!summary) {
    if (sign < 0) return
    summary = emptySupplierSummary(contribution.supplierId, contribution.supplierName)
    options.suppliers.push(summary)
  } else if (contribution.supplierName && (!summary.name || summary.name === summary.id)) {
    summary.name = contribution.supplierName
  }

  if (!contribution.orderable) return

  summary.orderablePositions = Math.max(0, (summary.orderablePositions || 0) + delta)
  summary.totalQty = Math.max(0, finiteNumber(summary.totalQty, 0) + delta * contribution.qty)

  if (contribution.generatedId) {
    summary.generatedPositions = Math.max(0, (summary.generatedPositions || 0) + delta)
    if (sign > 0) {
      if (!summary.generatedOrderId) summary.generatedOrderId = contribution.generatedId
    } else if (summary.generatedPositions === 0) {
      summary.generatedOrderId = null
    }
  } else {
    summary.pendingPositions = Math.max(0, (summary.pendingPositions || 0) + delta)
  }
}

/**
 * Apply old→new item delta to filter options without a full snapshot scan.
 * @param {object} filterOptions
 * @param {object} oldItem
 * @param {object} newItem
 */
export function applyItemDeltaToFilterOptions(filterOptions, oldItem, newItem) {
  const next = cloneFilterOptions(filterOptions)
  applyContribution(next, getItemSummaryContribution(oldItem), -1)
  applyContribution(next, getItemSummaryContribution(newItem), +1)

  const aggregates = recomputeSupplierAggregates(
    next.suppliers.sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    next.unassignedOrderableCount
  )

  return {
    categories: next.categories,
    categorySubcategories: next.categorySubcategories,
    ...aggregates,
  }
}

/** Aggregate progress copy from supplier-level counters. */
export function formatOrdersProgress({
  generatedSupplierCount = 0,
  pendingSupplierCount = 0,
  unassignedOrderableCount = 0,
  inconsistentSupplierCount = 0,
} = {}) {
  const total = generatedSupplierCount + pendingSupplierCount
  const remaining = pendingSupplierCount
  const createdLabel =
    total === 0
      ? 'Заказов пока нет'
      : `Создано ${generatedSupplierCount} из ${total} заказов`
  const remainingLabel = remaining > 0 ? `Осталось ${remaining}` : null
  const unassignedLabel =
    unassignedOrderableCount > 0
      ? `Без поставщика: ${unassignedOrderableCount} позиций`
      : null
  const inconsistentLabel =
    inconsistentSupplierCount > 0
      ? `Расхождение: ${inconsistentSupplierCount}`
      : null
  const allDone =
    total > 0 &&
    remaining === 0 &&
    unassignedOrderableCount === 0 &&
    inconsistentSupplierCount === 0
  return {
    createdLabel,
    remainingLabel,
    unassignedLabel,
    inconsistentLabel,
    allDone,
    total,
    remaining,
  }
}

/**
 * Compact workflow strip for the selected supplier.
 * @returns {{ step: string, label: string, orderId?: string|null, inconsistent?: boolean }}
 */
export function getSupplierWorkflowStatus({
  supplierId = '',
  summary = null,
} = {}) {
  if (!supplierId) {
    return { step: 'select_supplier', label: '1. Выберите поставщика' }
  }

  const pending = summary?.pendingPositions || 0
  const orderable = summary?.orderablePositions || 0
  const orderId = summary?.generatedOrderId || null

  if (isSupplierOrderCreated(summary)) {
    return {
      step: 'created',
      label: 'Заказ создан',
      orderId,
      inconsistent: pending > 0,
    }
  }

  if (orderable === 0) {
    return { step: 'enter_qty', label: '2. Укажите количество' }
  }

  const qty = finiteNumber(summary?.totalQty, 0)
  const qtyLabel = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100)
  return {
    step: 'draft',
    label: `Черновик · ${orderable} позиций · ${qtyLabel} шт.`,
    orderId: null,
  }
}

/**
 * Reason why create is disabled, or null when enabled.
 */
export function getCreateOrderDisabledReason({
  canGenerate = false,
  snapshotEditable = false,
  supplierId = '',
  summary = null,
  pendingSaveCount = 0,
  hasSaveError = false,
  generating = false,
} = {}) {
  if (!canGenerate) return 'Недостаточно прав для создания заказа'
  if (!snapshotEditable) return 'Снимок недоступен для формирования заказа'
  if (!supplierId) return 'Сначала выберите поставщика'
  if (generating) return 'Создание заказа выполняется…'
  if (pendingSaveCount > 0) return 'Дождитесь сохранения количества'
  if (hasSaveError) return 'Исправьте ошибку сохранения количества'
  if (isSupplierOrderCreated(summary)) return 'Заказ для этого поставщика уже создан'
  if ((summary?.pendingPositions || 0) === 0) {
    return 'Укажите количество больше 0 хотя бы для одной позиции'
  }
  return null
}

/** Tooltip / aria for the create control. */
export function getCreateOrderTooltip({
  disabledReason = null,
  supplierName = '',
} = {}) {
  if (disabledReason) return disabledReason
  if (supplierName) return `Создать заказ для ${supplierName}`
  return 'Создать заказ'
}

/**
 * Reason why export is disabled, or null when enabled.
 */
export function getExportDisabledReason({
  snapshotId = '',
  snapshotStatus = '',
  supplierId = '',
  exporting = false,
  pendingSaveCount = 0,
  hasSaveError = false,
  summary = null,
} = {}) {
  if (!snapshotId) return 'Нет снимка для выгрузки'
  if (snapshotStatus === 'syncing') return 'Дождитесь окончания синхронизации'
  if (!supplierId) return 'Сначала выберите поставщика'
  if (pendingSaveCount > 0) return 'Дождитесь сохранения количества'
  if (hasSaveError) return 'Исправьте ошибку сохранения количества'
  if ((summary?.orderablePositions || 0) <= 0) {
    return 'Нет позиций с количеством для выгрузки'
  }
  if (exporting) return 'Выгрузка выполняется…'
  return null
}

export function getExportTooltip({
  disabledReason = null,
  orderCreated = false,
} = {}) {
  if (disabledReason) return disabledReason
  return orderCreated ? 'Скачать заказ: PDF или Excel' : 'Скачать черновик: PDF или Excel'
}

export function getExportMenuLabel(orderCreated = false) {
  return orderCreated ? 'Скачать заказ' : 'Скачать черновик'
}

export const EMPTY_SUPPLIER_EXPORT_MESSAGE = 'Нет позиций заказа для выгрузки'

/**
 * Filter snapshot items for supplier-scoped PDF/Excel export.
 * - created: only rows linked to summary.generatedOrderId (or any generated rows if id missing)
 * - draft/empty: positive pending rows only (qty > 0 and not yet in an order)
 * @param {Array<object>} items
 * @param {object|null} summary
 * @returns {Array<object>}
 */
export function filterItemsForSupplierPlanExport(items, summary) {
  const list = Array.isArray(items) ? items : []
  const orderCreated = isSupplierOrderCreated(summary)
  const orderId = summary?.generatedOrderId || null
  const supplierId = summary?.id || null

  return list.filter((item) => {
    if (qtyOf(item) <= 0) return false
    if (supplierId && supplierIdOf(item) !== supplierId) return false
    const generatedId = generatedIdOf(item)
    if (orderCreated) {
      if (!generatedId) return false
      if (orderId) return generatedId === orderId
      return true
    }
    return !generatedId
  })
}

export function getSyncDisabledReason({
  canSync = false,
  syncing = false,
  pendingSaveCount = 0,
  hasSaveError = false,
} = {}) {
  if (!canSync) return 'Недостаточно прав для синхронизации'
  if (syncing) return 'Синхронизация UMAG выполняется'
  if (pendingSaveCount > 0) return 'Дождитесь сохранения количества'
  if (hasSaveError) return 'Исправьте ошибку сохранения количества'
  return null
}

export function getSyncTooltip({ disabledReason = null } = {}) {
  if (disabledReason) return disabledReason
  return 'Обновить остатки и продажи из UMAG'
}

/** Whether a create click may proceed (uses sync counters). */
export function canStartCreateOrder(args) {
  return getCreateOrderDisabledReason(args) == null
}

/** Concurrent save-error tracking: success clears only that SKU. */
export function createFailedSaveIds(initial = []) {
  return new Set(initial)
}

export function applySaveResultToFailedIds(failedIds, itemId, ok) {
  const next = new Set(failedIds || [])
  if (!itemId) return next
  if (ok) next.delete(itemId)
  else next.add(itemId)
  return next
}

export function hasFailedSaves(failedIds) {
  return (failedIds?.size || 0) > 0
}

/** Row lock helpers for one-order-per-supplier semantics. */
export function findSupplierSummary(filterOptions, supplierId) {
  if (!supplierId) return null
  return (filterOptions?.suppliers || []).find((s) => s.id === supplierId) || null
}

export function isItemQuantityLocked(item, filterOptions) {
  if (generatedIdOf(item)) return true
  const summary = findSupplierSummary(filterOptions, supplierIdOf(item))
  return isSupplierOrderCreated(summary)
}

export function getLockedQuantityHint(item, filterOptions) {
  const summary = findSupplierSummary(filterOptions, supplierIdOf(item))
  const orderId = generatedIdOf(item) || summary?.generatedOrderId || null
  if (generatedIdOf(item)) {
    return { label: 'Уже в заказе', orderId }
  }
  return { label: 'Заказ поставщику создан', orderId }
}

export { positiveQty }
