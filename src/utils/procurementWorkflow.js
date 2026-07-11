import { PURCHASE_STATUS } from './purchaseData'
import { RECEIVING_STATUS, normalizeReceivingDocument } from './receivingData'
import { toDateKey, buildWeekDates } from './shiftData'
import {
  dateToSupplierWeekdayId,
  SUPPLIER_STATUS,
} from './supplierData'
import {
  SYNC_STATUS,
  SYNC_STATUS_LABELS,
  isSyncPending,
  isSyncError,
} from './syncStatus'

/** Режимы модуля закупа */
export const PROCUREMENT_WORKFLOW_MODE = {
  SIMPLE: 'simple',
  ANALYTICS: 'analytics',
}

/** Статусы простой поставки (UI) */
export const SIMPLE_DELIVERY_STATUS = {
  PENDING: 'pending',
  RECEIVED: 'received',
  OVERDUE: 'overdue',
}

export const SIMPLE_DELIVERY_LABELS = {
  pending: 'Ожидается',
  received: 'Принято',
  overdue: 'Просрочено',
}

export const SIMPLE_DELIVERY_ICONS = {
  pending: '⬜',
  received: '✅',
  overdue: '⚠',
}

/** Источник записи в чек-листе приёмки */
export const RECEIVING_ENTRY_SOURCE = {
  EXPECTED: 'expected',
  PURCHASE: 'purchase',
}

/** Статус ожидаемой поставки в приёмке (раздел «Приёмка») */
export const EXPECTED_DELIVERY_LABEL = 'Ожидается'

/** Заголовок блока плана закупок (раздел «Закуп») */
export const PROCUREMENT_PLAN_LABEL = 'План закупок'

/** Статус записи в плане закупок (раздел «Закуп») */
export const PROCUREMENT_PLAN_ITEM_STATUS = 'К заказу'

export function getWorkflowMode(entity) {
  return entity?.workflowMode ?? entity?.workflow_mode ?? PROCUREMENT_WORKFLOW_MODE.ANALYTICS
}

export function isSimpleWorkflow(entity) {
  return getWorkflowMode(entity) === PROCUREMENT_WORKFLOW_MODE.SIMPLE
}

export function isPurchaseReceived(order) {
  return (
    order?.status === PURCHASE_STATUS.RECEIVED ||
    order?.status === RECEIVING_STATUS.RECEIVED
  )
}

export function resolveSimpleDeliveryStatus(document, todayKey = toDateKey(new Date())) {
  if (!document) return SIMPLE_DELIVERY_STATUS.PENDING
  if (document.status === RECEIVING_STATUS.RECEIVED) {
    return SIMPLE_DELIVERY_STATUS.RECEIVED
  }
  const deliveryDate = document.expectedDeliveryDate
  if (deliveryDate && deliveryDate < todayKey) {
    return SIMPLE_DELIVERY_STATUS.OVERDUE
  }
  return SIMPLE_DELIVERY_STATUS.PENDING
}

export function filterSimplePurchases(orders) {
  return (orders || []).filter(isSimpleWorkflow)
}

export function filterSimpleReceivingDocuments(documents, simpleOrderIds = null) {
  const orderIds = simpleOrderIds instanceof Set ? simpleOrderIds : null
  return (documents || []).filter((doc) => {
    if (isSimpleWorkflow(doc)) return true
    if (orderIds && doc.purchaseOrderId && orderIds.has(doc.purchaseOrderId)) return true
    return false
  })
}

/** Связка закупа с документом приёмки (в т.ч. optimistic / fallback) */
export function resolveSimpleReceivingDocument(order, documents) {
  if (!order) return null

  const list = documents || []
  const linked =
    list.find((doc) => doc.purchaseOrderId === order.id) ||
    list.find((doc) => doc.id === order.receivingDocumentId)

  if (linked) return linked

  if (!order.receivingDocumentId) return null

  return normalizeReceivingDocument({
    id: order.receivingDocumentId,
    purchaseOrderId: order.id,
    supplierId: order.supplierId ?? null,
    supplierName: order.supplierName ?? '',
    status: RECEIVING_STATUS.AWAITING_RECEIVING,
    expectedDeliveryDate: order.expectedDeliveryDate ?? '',
    totalAmount: order.totalAmount ?? 0,
    workflowMode: PROCUREMENT_WORKFLOW_MODE.SIMPLE,
  })
}

/** Записи простой приёмки для списка / чек-листа */
export function buildSimpleReceivingEntries(orders, documents) {
  const simpleOrders = filterSimplePurchases(orders)
  const orderIds = new Set(simpleOrders.map((order) => order.id))
  const relevantDocuments = filterSimpleReceivingDocuments(documents, orderIds)

  return simpleOrders
    .map((order) => ({
      source: RECEIVING_ENTRY_SOURCE.PURCHASE,
      order,
      document: resolveSimpleReceivingDocument(order, relevantDocuments),
      supplier: null,
      dateKey: order.expectedDeliveryDate || '',
      id: order.id,
    }))
    .filter((entry) => entry.document)
    .sort((a, b) => {
      const dateCmp = (a.dateKey || '').localeCompare(b.dateKey || '')
      if (dateCmp !== 0) return dateCmp
      return getReceivingEntrySupplierName(a).localeCompare(getReceivingEntrySupplierName(b), 'ru')
    })
}

/** Записи плана закупок по расписанию поставщиков (без оформленного закупа) */
export function buildExpectedDeliveryEntries(suppliers, weekStartKey, orders = []) {
  if (!weekStartKey) return []

  const activeSuppliers = (suppliers || []).filter(
    (supplier) =>
      supplier.status === SUPPLIER_STATUS.ACTIVE &&
      Array.isArray(supplier.deliveryWeekdays) &&
      supplier.deliveryWeekdays.length > 0
  )

  if (!activeSuppliers.length) return []

  const occupied = new Set()
  for (const order of filterSimplePurchases(orders)) {
    if (order.supplierId && order.expectedDeliveryDate) {
      occupied.add(`${order.supplierId}:${order.expectedDeliveryDate}`)
    }
  }

  const entries = []
  for (const date of buildWeekDates(weekStartKey)) {
    const dateKey = toDateKey(date)
    const weekdayId = dateToSupplierWeekdayId(date)

    for (const supplier of activeSuppliers) {
      if (!supplier.deliveryWeekdays.includes(weekdayId)) continue
      const slotKey = `${supplier.id}:${dateKey}`
      if (occupied.has(slotKey)) continue

      entries.push({
        source: RECEIVING_ENTRY_SOURCE.EXPECTED,
        id: `expected-${supplier.id}-${dateKey}`,
        supplier,
        order: null,
        document: null,
        dateKey,
      })
    }
  }

  return entries.sort((a, b) => {
    const dateCmp = (a.dateKey || '').localeCompare(b.dateKey || '')
    if (dateCmp !== 0) return dateCmp
    return getReceivingEntrySupplierName(a).localeCompare(getReceivingEntrySupplierName(b), 'ru')
  })
}

/** Объединить реальные закупы и записи плана закупок по расписанию */
export function buildMergedReceivingEntries(orders, documents, suppliers, weekStartKey) {
  const purchaseEntries = buildSimpleReceivingEntries(orders, documents)
  const expectedEntries = buildExpectedDeliveryEntries(suppliers, weekStartKey, orders)
  return [...purchaseEntries, ...expectedEntries]
}

export function isExpectedReceivingEntry(entry) {
  return entry?.source === RECEIVING_ENTRY_SOURCE.EXPECTED
}

export function getReceivingEntrySupplierName(entry) {
  return entry?.supplier?.name || entry?.order?.supplierName || entry?.document?.supplierName || '—'
}

export function getReceivingEntryKey(entry) {
  return entry?.id || entry?.order?.id || `${entry?.supplier?.id}:${entry?.dateKey}`
}

export function isSimpleReceivingEntryDone(entry) {
  if (isExpectedReceivingEntry(entry)) return false
  return (
    entry?.document?.status === RECEIVING_STATUS.RECEIVED ||
    entry?.order?.status === PURCHASE_STATUS.RECEIVED
  )
}

/** Документ приёмки есть только как fallback (ещё нет строки в облачном store) */
export function isVirtualReceivingDocument(order, documents) {
  if (!order?.receivingDocumentId) return false
  const list = documents || []
  return !list.some(
    (doc) => doc.id === order.receivingDocumentId || doc.purchaseOrderId === order.id
  )
}

/**
 * Можно ли переключать чек-лист приёмки.
 * Пока закуп не синхронизирован с Supabase — галочка недоступна.
 */
export function getReceivingChecklistToggleState(order, documents, cloudMode = false) {
  if (!order?.id || !order.receivingDocumentId) {
    return { canToggle: false, reason: 'missing', statusLabel: null }
  }

  if (!cloudMode) {
    return { canToggle: true, reason: 'ready', statusLabel: null }
  }

  if (isSyncPending(order.syncStatus)) {
    return {
      canToggle: false,
      reason: 'syncing',
      statusLabel: SYNC_STATUS_LABELS[SYNC_STATUS.PENDING],
    }
  }

  if (isSyncError(order.syncStatus)) {
    return {
      canToggle: false,
      reason: 'error',
      statusLabel: SYNC_STATUS_LABELS[SYNC_STATUS.ERROR],
    }
  }

  if (isVirtualReceivingDocument(order, documents)) {
    return {
      canToggle: true,
      reason: 'virtual',
      statusLabel: null,
    }
  }

  return { canToggle: true, reason: 'ready', statusLabel: null }
}

/** Чек-лист: необработанные сверху, обработанные снизу */
export function sortReceivingChecklistEntries(entries, checkedOverrides = {}) {
  const isDone = (entry) => {
    const docId = entry.document?.id
    if (docId && checkedOverrides[docId] !== undefined) {
      return checkedOverrides[docId]
    }
    return isSimpleReceivingEntryDone(entry)
  }

  return [...(entries || [])].sort((a, b) => {
    const aDone = isDone(a)
    const bDone = isDone(b)
    if (aDone !== bDone) return aDone ? 1 : -1

    const aExpected = isExpectedReceivingEntry(a)
    const bExpected = isExpectedReceivingEntry(b)
    if (aExpected !== bExpected) return aExpected ? -1 : 1

    return getReceivingEntrySupplierName(a).localeCompare(getReceivingEntrySupplierName(b), 'ru')
  })
}

export function isDateInWeek(dateKey, weekStartKey, weekDates) {
  if (!dateKey) return false
  if (weekDates?.length) {
    return weekDates.some((date) => toDateKey(date) === dateKey)
  }
  const start = weekStartKey
  const endDate = new Date(weekStartKey)
  endDate.setDate(endDate.getDate() + 6)
  const end = toDateKey(endDate)
  return dateKey >= start && dateKey <= end
}
