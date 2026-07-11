import { isCloudMode } from '../lib/dataMode'
import {
  upsertCloudPurchase,
  upsertCloudReceivingDocument,
  patchCloudPurchase,
  patchCloudReceivingDocument,
  removeCloudPurchase,
  removeCloudReceivingByPurchaseId,
  getCloudPurchases,
  getCloudReceivingDocuments,
} from '../lib/cloudStore'
import { normalizePurchaseOrder, PURCHASE_STATUS } from '../utils/purchaseData'
import { RECEIVING_STATUS } from '../utils/receivingData'
import { SYNC_STATUS } from '../utils/syncStatus'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import { toastSuccess, toastError } from './notificationService'
import * as local from './purchaseLocalAdapter'
import * as cloud from './purchaseSupabaseAdapter'
import * as receivingCloud from './receivingSupabaseAdapter'
import * as receivingLocal from './receivingLocalAdapter'
import { getPurchaseOrdersSync } from './purchaseDataService'
import { getReceivingDocumentsSync } from './receivingDataService'
import { getLocalReceivingBundle } from './receivingLocalAdapter'
import {
  saveOptimisticPurchase,
  updateOptimisticPurchase,
  clearOptimisticPurchase,
  getOptimisticOverlay,
  saveOptimisticDelete,
  clearOptimisticDelete,
  restoreOptimisticDelete,
  isOptimisticDeleted,
  getOptimisticDeleteSnapshot,
  updateOptimisticReceivingDocument,
  upsertOptimisticReceivingDocument,
  upsertOptimisticPurchase,
  mergePurchaseOrders,
  mergeReceivingDocuments,
} from './purchaseOptimisticStore'

const DELETE_SUCCESS_MESSAGE = 'Закупка успешно удалена'
const DELETE_ERROR_MESSAGE = 'Не удалось удалить закупку'
const ACCEPT_SUCCESS_MESSAGE = 'Поставка принята'
const UNACCEPT_SUCCESS_MESSAGE = 'Отметка снята'

/** Заказы из Supabase приходят без syncStatus — их тоже нужно удалять в облаке */
function shouldDeletePurchaseFromCloud(order) {
  return order.syncStatus !== SYNC_STATUS.PENDING
}

function getPurchaseSnapshot(orderId) {
  if (isCloudMode()) {
    const overlay = getOptimisticOverlay()
    const orders = mergePurchaseOrders(getCloudPurchases() || [], overlay.orders)
    const documents = mergeReceivingDocuments(
      getCloudReceivingDocuments() || [],
      overlay.documents
    )
    const order = orders.find((item) => item.id === orderId)
    const document = documents.find((item) => item.purchaseOrderId === orderId) || null
    return { order, document }
  }

  const order =
    local.getLocalPurchasesBundle().orders.find((item) => item.id === orderId) || null
  const document =
    getLocalReceivingBundle().documents.find((item) => item.purchaseOrderId === orderId) ||
    null
  return { order, document }
}

function resolveReceivingDocumentForAction({ documentId, orderId, fallbackDocument }) {
  const fromStore = getReceivingDocumentsSync().find(
    (doc) =>
      doc.id === documentId ||
      (orderId && doc.purchaseOrderId === orderId)
  )
  return fromStore || fallbackDocument || null
}

function resolveOrderForReceivingDocument(document, fallbackOrder) {
  if (fallbackOrder) return fallbackOrder
  if (!document?.purchaseOrderId) return null
  return getPurchaseOrdersSync().find((item) => item.id === document.purchaseOrderId) || null
}

function materializeReceivingDocument(document, order) {
  if (!document?.id) return null

  if (isCloudMode()) {
    const ensured = upsertOptimisticReceivingDocument(document, {})
    upsertCloudReceivingDocument(ensured)
    if (order) {
      const ensuredOrder = upsertOptimisticPurchase(order, {})
      upsertCloudPurchase(ensuredOrder)
    }
    return ensured
  }

  return receivingLocal.ensureSimpleReceivingDocumentLocal(document, order)
}

/** Фоновое сохранение отметки чек-листа — только статус, без доп. этапов */
async function persistSimpleDeliveryChecklistState({
  documentId,
  document,
  order,
  received,
  user,
}) {
  if (!isCloudMode()) {
    materializeReceivingDocument(document, order)
    if (received) {
      await receivingLocal.acceptSimpleDeliveryLocal(documentId, user)
    } else {
      await receivingLocal.unacceptSimpleDeliveryLocal(documentId)
    }
    return
  }

  const existing = await receivingCloud.fetchDocumentById(documentId)
  if (!existing) {
    console.warn(
      '[SimpleDeliveryChecklist] document not in Supabase yet, status kept in overlay',
      documentId
    )
    return
  }

  if (received) {
    await receivingCloud.acceptSimpleDeliveryCloud(documentId, user)
  } else {
    await receivingCloud.unacceptSimpleDeliveryCloud(documentId)
  }
}

function applySimpleDeliveryState(document, order, { received, user }) {
  const now = new Date().toISOString()

  const docPatch = received
    ? {
        status: RECEIVING_STATUS.RECEIVED,
        receivedBy: user?.login || user?.id || '',
        receivedByName: user?.name || '',
        updatedAt: now,
      }
    : {
        status: RECEIVING_STATUS.AWAITING_RECEIVING,
        receivedBy: null,
        receivedByName: null,
        updatedAt: now,
      }

  const updatedDocument = upsertOptimisticReceivingDocument(document, docPatch)
  upsertCloudReceivingDocument(updatedDocument)

  if (order) {
    const orderPatch = {
      status: received ? PURCHASE_STATUS.RECEIVED : PURCHASE_STATUS.AWAITING_RECEIVING,
      updatedAt: now,
    }
    const updatedOrder = upsertOptimisticPurchase(order, orderPatch)
    upsertCloudPurchase(updatedOrder)
  }
}

/** Чек-лист приёмки: только отметка выполнения (без следующих этапов процесса) */
function markSimpleDeliveryChecklist({ documentId, user, notifyChange, context, received }) {
  const document = resolveReceivingDocumentForAction({
    documentId,
    orderId: context.orderId ?? context.order?.id,
    fallbackDocument: context.document,
  })
  if (!document?.id) {
    console.error('[SimpleDeliveryChecklist] document not found', { documentId, context })
    return false
  }

  const order = resolveOrderForReceivingDocument(document, context.order)
  const resolvedDocumentId = document.id

  applySimpleDeliveryState(document, order, { received, user: received ? user : null })
  toastSuccess(received ? ACCEPT_SUCCESS_MESSAGE : UNACCEPT_SUCCESS_MESSAGE)
  notifyChange?.()

  void persistSimpleDeliveryChecklistState({
    documentId: resolvedDocumentId,
    document,
    order,
    received,
    user,
  }).catch((error) => {
    console.error('[SimpleDeliveryChecklist] background persist failed', error)
  })

  return true
}

/** Optimistic Accept — мгновенная отметка приёмки */
export function optimisticAcceptSimpleDelivery(documentId, user, notifyChange, context = {}) {
  return markSimpleDeliveryChecklist({
    documentId,
    user,
    notifyChange,
    context,
    received: true,
  })
}

/** Optimistic Unaccept — снятие отметки приёмки */
export function optimisticUnacceptSimpleDelivery(documentId, notifyChange, context = {}) {
  return markSimpleDeliveryChecklist({
    documentId,
    user: null,
    notifyChange,
    context,
    received: false,
  })
}

/** Переключить отметку чек-листа (принять / снять) */
export function toggleSimpleReceivingEntry(entry, user, notifyChange) {
  const document = entry?.document
  const order = entry?.order
  if (!document?.id) return false

  const context = { document, order, orderId: order?.id }
  const isReceived = document.status === RECEIVING_STATUS.RECEIVED

  if (isReceived) {
    return optimisticUnacceptSimpleDelivery(document.id, notifyChange, context)
  }
  return optimisticAcceptSimpleDelivery(document.id, user, notifyChange, context)
}

async function runOptimisticCreateSync(orderId, user, notifyChange) {
  const overlay = getOptimisticOverlay()
  const order = overlay.orders.find((item) => item.id === orderId)
  const document = overlay.documents.find((item) => item.purchaseOrderId === orderId)
  if (!order) return

  try {
    await cloud.syncSimplePurchaseCloud(order, document)

    if (isOptimisticDeleted(orderId)) {
      try {
        await cloud.deletePurchaseOrderCloud(orderId)
      } catch (error) {
        console.error('[OptimisticCreateSync] cleanup after delete', error)
      }
      clearOptimisticDelete(orderId)
      notifyChange?.()
      return
    }

    const syncedOrder = normalizePurchaseOrder({
      ...order,
      syncStatus: SYNC_STATUS.SYNCED,
      syncError: null,
    })

    clearOptimisticPurchase(orderId)
    upsertCloudPurchase(syncedOrder)
    if (document) {
      upsertCloudReceivingDocument(document)
    }
    local.updatePurchaseOrderSync(orderId, {
      syncStatus: SYNC_STATUS.SYNCED,
      syncError: null,
    })
    notifyChange?.()
    toastSuccess('Закупка успешно создана')
  } catch (error) {
    if (isOptimisticDeleted(orderId)) {
      clearOptimisticDelete(orderId)
      notifyChange?.()
      return
    }

    const message = toUserErrorMessage(error, 'Не удалось создать закупку.')
    const patch = { syncStatus: SYNC_STATUS.ERROR, syncError: message }

    updateOptimisticPurchase(orderId, patch)
    patchCloudPurchase(orderId, patch)
    local.updatePurchaseOrderSync(orderId, patch)
    notifyChange?.()
    toastError(toUserErrorMessage(error, 'Не удалось создать закупку.'))
  }
}

async function runOptimisticDeleteSync(orderId, needsCloudDelete, notifyChange) {
  const snapshot = getOptimisticDeleteSnapshot(orderId)
  if (!snapshot) return

  try {
    if (needsCloudDelete) {
      await cloud.deletePurchaseOrderCloud(orderId)
      await refreshData()
      clearOptimisticDelete(orderId)
    }
    notifyChange?.()
  } catch (error) {
    console.error('[OptimisticDeleteSync]', error)

    restoreOptimisticDelete(orderId)
    if (snapshot.order) {
      upsertCloudPurchase(snapshot.order)
    }
    if (snapshot.document) {
      upsertCloudReceivingDocument(snapshot.document)
    }
    notifyChange?.()
    toastError(DELETE_ERROR_MESSAGE)
  }
}

/** Optimistic Create — мгновенное создание простой закупки */
export function optimisticCreateSimplePurchase(data, user, notifyChange) {
  const syncStatus = isCloudMode() ? SYNC_STATUS.PENDING : SYNC_STATUS.SYNCED
  const { order, document } = local.createSimplePurchaseSync(
    { ...data, syncStatus, syncError: null },
    user
  )

  const normalizedOrder = normalizePurchaseOrder(order)

  if (isCloudMode()) {
    saveOptimisticPurchase(normalizedOrder, document)
    upsertCloudPurchase(normalizedOrder)
    if (document) upsertCloudReceivingDocument(document)
    notifyChange?.()
    window.setTimeout(() => {
      runOptimisticCreateSync(normalizedOrder.id, user, notifyChange)
    }, 0)
  } else {
    notifyChange?.()
    toastSuccess('Закупка успешно создана')
  }

  return { orderId: normalizedOrder.id, order: normalizedOrder, document }
}

/** Optimistic Delete — мгновенное удаление простой закупки */
export function optimisticDeleteSimplePurchase(orderId, notifyChange) {
  const { order, document } = getPurchaseSnapshot(orderId)
  if (!order) return false

  const needsCloudDelete = isCloudMode() && shouldDeletePurchaseFromCloud(order)

  if (isCloudMode()) {
    saveOptimisticDelete(orderId, { order, document })
    removeCloudPurchase(orderId)
    removeCloudReceivingByPurchaseId(orderId)
    notifyChange?.()
    toastSuccess(DELETE_SUCCESS_MESSAGE)

    window.setTimeout(() => {
      runOptimisticDeleteSync(orderId, needsCloudDelete, notifyChange)
    }, 0)
    return true
  }

  try {
    local.deletePurchaseOrderSync(orderId)
    notifyChange?.()
    toastSuccess(DELETE_SUCCESS_MESSAGE)
    return true
  } catch (error) {
    console.error('[OptimisticDelete]', error)
    toastError(DELETE_ERROR_MESSAGE)
    return false
  }
}

/** Optimistic Retry — повторная отправка несинхронизированной закупки */
export function optimisticRetrySimplePurchaseSync(orderId, user, notifyChange) {
  const patch = { syncStatus: SYNC_STATUS.PENDING, syncError: null }

  updateOptimisticPurchase(orderId, patch)
  patchCloudPurchase(orderId, patch)
  local.updatePurchaseOrderSync(orderId, patch)
  notifyChange?.()

  window.setTimeout(() => {
    runOptimisticCreateSync(orderId, user, notifyChange)
  }, 0)
}

export const createSimplePurchaseOptimistic = optimisticCreateSimplePurchase
export const deleteSimplePurchaseOptimistic = optimisticDeleteSimplePurchase
export const retrySimplePurchaseSync = optimisticRetrySimplePurchaseSync
export const acceptSimpleDeliveryOptimistic = optimisticAcceptSimpleDelivery
export const unacceptSimpleDeliveryOptimistic = optimisticUnacceptSimpleDelivery
export const toggleSimpleReceivingEntryOptimistic = toggleSimpleReceivingEntry

export function getOptimisticPurchaseOverlay() {
  return getOptimisticOverlay()
}
