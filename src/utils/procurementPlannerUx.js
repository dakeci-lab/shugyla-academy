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

const APP_TZ_WEEKDAY_SHORT_TO_ID = Object.freeze({
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
})

/** Weekday id (sun..sat) for a date in Asia/Almaty (or injected timeZone). */
export function getAppTimezoneWeekdayId(date = new Date(), timeZone = 'Asia/Almaty') {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date)
  return APP_TZ_WEEKDAY_SHORT_TO_ID[short] || null
}

/** Normalize supplier name for legacy id↔name matching. */
export function normalizeSupplierMatchName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Unique active suppliers scheduled for today (deliveryWeekdays).
 * Same source semantics as «Визиты поставщиков».
 * @param {Array<object>} suppliers
 * @param {{ now?: Date, weekdayId?: string|null, timeZone?: string }} [options]
 */
export function listTodaysScheduledSuppliers(
  suppliers,
  { now = new Date(), weekdayId = null, timeZone = 'Asia/Almaty' } = {}
) {
  const dayId = weekdayId || getAppTimezoneWeekdayId(now, timeZone)
  if (!dayId) return []

  const seen = new Set()
  const result = []
  for (const supplier of suppliers || []) {
    if (!supplier?.id || seen.has(supplier.id)) continue
    if (supplier.status !== 'active') continue
    if (
      !Array.isArray(supplier.deliveryWeekdays) ||
      !supplier.deliveryWeekdays.includes(dayId)
    ) {
      continue
    }
    seen.add(supplier.id)
    result.push(supplier)
  }
  return result
}

function buildSnapshotSupplierLookups(snapshotSuppliers) {
  const byId = new Map()
  const byName = new Map()
  for (const summary of snapshotSuppliers || []) {
    if (summary?.id) byId.set(summary.id, summary)
    const name = normalizeSupplierMatchName(summary?.name)
    if (name && !byName.has(name)) byName.set(name, summary)
  }
  return { byId, byName }
}

function findSnapshotSummaryForSupplier(supplier, lookups) {
  if (!supplier) return null
  if (supplier.id && lookups.byId.has(supplier.id)) {
    return lookups.byId.get(supplier.id)
  }
  const name = normalizeSupplierMatchName(supplier.name)
  if (name && lookups.byName.has(name)) return lookups.byName.get(name)
  return null
}

function isSnapshotSupplierScheduled(summary, scheduledIds, scheduledNames) {
  if (summary?.id && scheduledIds.has(summary.id)) return true
  const name = normalizeSupplierMatchName(summary?.name)
  return Boolean(name && scheduledNames.has(name))
}

function mergeSupplierSelectRow(base, summary) {
  const id = base?.id || summary?.id
  const name = base?.name || summary?.name || id || ''
  const merged = {
    ...(summary || emptySupplierSummary(id, name)),
    id,
    name,
    status: base?.status || 'active',
  }
  if (base && Object.prototype.hasOwnProperty.call(base, 'linkedToUmag')) {
    merged.linkedToUmag = base.linkedToUmag
  }
  if (base && Object.prototype.hasOwnProperty.call(base, 'isUmagActive')) {
    merged.isUmagActive = base.isUmagActive
  }
  return merged
}

function sortSupplierSelectRows(rows) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

/**
 * Build supplier rows for the planner selector.
 * - today: scheduled active visits (even without snapshot rows)
 * - all: active catalog enriched with snapshot + leftover snapshot-only legacy rows
 */
export function buildPlannerSupplierSelectOptions({
  scope = 'today',
  scheduledSuppliers = [],
  catalogSuppliers = [],
  snapshotSuppliers = [],
} = {}) {
  const lookups = buildSnapshotSupplierLookups(snapshotSuppliers)

  if (scope === 'today') {
    return sortSupplierSelectRows(
      (scheduledSuppliers || [])
        .filter((supplier) => supplier?.id)
        .map((supplier) =>
          mergeSupplierSelectRow(supplier, findSnapshotSummaryForSupplier(supplier, lookups))
        )
    )
  }

  const rows = []
  const seenIds = new Set()
  const seenNames = new Set()
  const consumedSummaryIds = new Set()

  for (const supplier of catalogSuppliers || []) {
    if (!supplier?.id || supplier.isMerged) continue
    if (supplier.status !== 'active') continue
    if (seenIds.has(supplier.id)) continue
    const summary = findSnapshotSummaryForSupplier(supplier, lookups)
    if (summary?.id) consumedSummaryIds.add(summary.id)
    const row = mergeSupplierSelectRow(supplier, summary)
    seenIds.add(row.id)
    const nameKey = normalizeSupplierMatchName(row.name)
    if (nameKey) seenNames.add(nameKey)
    rows.push(row)
  }

  for (const summary of snapshotSuppliers || []) {
    if (!summary?.id || consumedSummaryIds.has(summary.id) || seenIds.has(summary.id)) continue
    const nameKey = normalizeSupplierMatchName(summary.name)
    if (nameKey && seenNames.has(nameKey)) continue
    seenIds.add(summary.id)
    if (nameKey) seenNames.add(nameKey)
    rows.push(mergeSupplierSelectRow({ id: summary.id, name: summary.name, status: 'active' }, summary))
  }

  return sortSupplierSelectRows(rows)
}

/** Whether a selected supplier id belongs to today's scheduled visits. */
export function isSupplierInTodaySchedule(
  supplierId,
  scheduledSuppliers = [],
  snapshotSuppliers = []
) {
  if (!supplierId) return false
  if ((scheduledSuppliers || []).some((supplier) => supplier?.id === supplierId)) return true

  const summary = (snapshotSuppliers || []).find((row) => row?.id === supplierId)
  if (!summary) return false
  const nameKey = normalizeSupplierMatchName(summary.name)
  if (!nameKey) return false
  return (scheduledSuppliers || []).some(
    (supplier) => normalizeSupplierMatchName(supplier?.name) === nameKey
  )
}

/**
 * Progress for today's scheduled visits vs snapshot supplier summaries.
 * Snapshot suppliers outside today's schedule are not in the denominator.
 */
export function formatOrdersProgress({
  scheduledSuppliers = [],
  snapshotSuppliers = [],
  unassignedOrderableCount = 0,
  inconsistentSupplierCount = 0,
} = {}) {
  const scheduled = Array.isArray(scheduledSuppliers) ? scheduledSuppliers : []
  const scheduledTotal = scheduled.length
  const lookups = buildSnapshotSupplierLookups(snapshotSuppliers)

  const scheduledIds = new Set()
  const scheduledNames = new Set()
  let createdToday = 0

  for (const supplier of scheduled) {
    if (supplier?.id) scheduledIds.add(supplier.id)
    const name = normalizeSupplierMatchName(supplier?.name)
    if (name) scheduledNames.add(name)

    const summary = findSnapshotSummaryForSupplier(supplier, lookups)
    if (summary && isSupplierOrderCreated(summary)) createdToday += 1
  }

  let unscheduledCount = 0
  for (const summary of snapshotSuppliers || []) {
    const status = summary?.planningStatus || getSupplierPlanningStatus(summary)
    if (status !== 'created' && status !== 'draft') continue
    if (!isSnapshotSupplierScheduled(summary, scheduledIds, scheduledNames)) {
      unscheduledCount += 1
    }
  }

  const remaining = Math.max(0, scheduledTotal - createdToday)
  const unassignedLabel =
    unassignedOrderableCount > 0
      ? `Без поставщика: ${unassignedOrderableCount} позиций`
      : null
  const inconsistentLabel =
    inconsistentSupplierCount > 0
      ? `Расхождение: ${inconsistentSupplierCount}`
      : null
  const unscheduledLabel =
    unscheduledCount > 0 ? `Вне графика: ${unscheduledCount}` : null

  if (scheduledTotal === 0) {
    return {
      createdLabel: 'На сегодня визиты не запланированы',
      remainingLabel: null,
      unscheduledLabel,
      unassignedLabel,
      inconsistentLabel,
      allDone: false,
      total: 0,
      remaining: 0,
      createdToday: 0,
      unscheduledCount,
    }
  }

  const allDone =
    remaining === 0 &&
    unassignedOrderableCount === 0 &&
    inconsistentSupplierCount === 0

  return {
    createdLabel: `Сегодня: создано ${createdToday} из ${scheduledTotal}`,
    remainingLabel: remaining > 0 ? `Осталось ${remaining}` : null,
    unscheduledLabel,
    unassignedLabel,
    inconsistentLabel,
    allDone,
    total: scheduledTotal,
    remaining,
    createdToday,
    unscheduledCount,
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
  return orderCreated ? 'Скачать заказ: PDF или Excel' : 'Скачать план: PDF или Excel'
}

export function getExportMenuLabel(orderCreated = false) {
  return orderCreated ? 'Скачать заказ' : 'Скачать план'
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

export const QUANTITY_REQUIRES_SUPPLIER_HINT = 'Выберите поставщика, чтобы задать количество'

/**
 * Количество можно править только когда в фильтре выбран поставщик и товар
 * принадлежит именно ему.
 *
 * Без выбранного поставщика правка бессмысленна и опасна: заказ формируется
 * по одному поставщику, а сохранение из общего списка уходит в снимок,
 * который потом никто не отправит. Плюс это защита от «залипшего» события
 * blur: пока пользователь менял фильтр, input мог остаться в старом состоянии.
 */
export function canEditItemQuantity(item, { filterOptions, selectedSupplierId } = {}) {
  if (!item) return false
  if (!selectedSupplierId) return false
  if (supplierIdOf(item) !== selectedSupplierId) return false
  return !isItemQuantityLocked(item, filterOptions)
}

export function getLockedQuantityHint(item, filterOptions) {
  const summary = findSupplierSummary(filterOptions, supplierIdOf(item))
  const orderId = generatedIdOf(item) || summary?.generatedOrderId || null
  if (generatedIdOf(item)) {
    return { label: 'Уже в заказе', orderId }
  }
  return { label: 'Заказ поставщику создан', orderId }
}

/**
 * Id of the next item after `fromId` (in list order) whose `isEditable`
 * predicate returns true, or null when there is none on this page.
 * Pure — used to drive Enter-to-next-quantity-input navigation.
 */
export function getNextEditableItemId(items, fromId, isEditable) {
  const list = Array.isArray(items) ? items : []
  const idx = list.findIndex((it) => it?.id === fromId)
  if (idx === -1) return null
  for (let i = idx + 1; i < list.length; i += 1) {
    if (isEditable(list[i])) return list[i].id
  }
  return null
}

/** Id of the first item whose `isEditable` predicate returns true, or null. */
export function getFirstEditableItemId(items, isEditable) {
  const list = Array.isArray(items) ? items : []
  const found = list.find((it) => isEditable(it))
  return found ? found.id : null
}

export { positiveQty }
