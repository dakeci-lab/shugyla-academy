import { PURCHASE_STATUS } from './purchaseData'
import { RECEIVING_STATUS, normalizeReceivingDocument } from './receivingData'
import { toDateKey } from './shiftData'

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
      order,
      document: resolveSimpleReceivingDocument(order, relevantDocuments),
      dateKey: order.expectedDeliveryDate || '',
    }))
    .filter((entry) => entry.document)
    .sort((a, b) => {
      const dateCmp = (a.dateKey || '').localeCompare(b.dateKey || '')
      if (dateCmp !== 0) return dateCmp
      return (a.order.supplierName || '').localeCompare(b.order.supplierName || '', 'ru')
    })
}

export function isSimpleReceivingEntryDone(entry) {
  return (
    entry?.document?.status === RECEIVING_STATUS.RECEIVED ||
    entry?.order?.status === PURCHASE_STATUS.RECEIVED
  )
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
    return (a.order?.supplierName || '').localeCompare(b.order?.supplierName || '', 'ru')
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
