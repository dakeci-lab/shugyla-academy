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
import { normalizeReceivingDocument, RECEIVING_STATUS } from '../utils/receivingData'
import {
  PROCUREMENT_WORKFLOW_MODE,
  getReceivingChecklistToggleState,
} from '../utils/procurementWorkflow'
import { SYNC_STATUS } from '../utils/syncStatus'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import { toastSuccess, toastError } from './notificationService'
import * as local from './purchaseLocalAdapter'
import * as cloud from './purchaseSupabaseAdapter'
import * as receivingCloud from './receivingSupabaseAdapter'
import * as receivingLocal from './receivingLocalAdapter'
import { getPurchaseOrdersSync } from './purchaseDataService'
import { getReceivingDocumentsSync } from './receivingDataService'
import { refreshData } from './academyDataService'
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
  clearOptimisticReceivingSyncState,
} from './purchaseOptimisticStore'

const DELETE_SUCCESS_MESSAGE = 'Закупка успешно удалена'
const DELETE_ERROR_MESSAGE = 'Не удалось удалить закупку'
const ACCEPT_SUCCESS_MESSAGE = 'Поставка принята'
const UNACCEPT_SUCCESS_MESSAGE = 'Отметка снята'
const ACCEPT_ERROR_MESSAGE = 'Не удалось принять поставку'
const UNACCEPT_ERROR_MESSAGE = 'Не удалось снять отметку'

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

/** Cloud: optimistic только в in-memory store (не localStorage) */
function applySimpleDeliveryStateCloud(document, order, { received, user }) {
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

  const previousDocument = normalizeReceivingDocument({ ...document })
  const previousOrder = order ? normalizePurchaseOrder({ ...order }) : null

  upsertCloudReceivingDocument(normalizeReceivingDocument({ ...document, ...docPatch }))

  if (order) {
    upsertCloudPurchase(
      normalizePurchaseOrder({
        ...order,
        status: received ? PURCHASE_STATUS.RECEIVED : PURCHASE_STATUS.AWAITING_RECEIVING,
        updatedAt: now,
      })
    )
  }

  return { previousDocument, previousOrder }
}

function revertSimpleDeliveryStateCloud(snapshot) {
  if (!snapshot) return
  if (snapshot.previousDocument) {
    upsertCloudReceivingDocument(snapshot.previousDocument)
  }
  if (snapshot.previousOrder) {
    upsertCloudPurchase(snapshot.previousOrder)
  }
}

const ENSURE_CLOUD_RETRY_DELAYS_MS = [0, 250, 500, 1000, 1500, 2000]

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForPurchaseOrderInCloud(orderId, { attempts = 20, delayMs = 400 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const cloudOrder = await cloud.fetchOrderById(orderId)
    if (cloudOrder) return cloudOrder

    const localOrder = getPurchaseOrdersSync().find((item) => item.id === orderId)
    const localDocument = getReceivingDocumentsSync().find(
      (item) => item.purchaseOrderId === orderId
    )

    if (localOrder && localOrder.syncStatus !== SYNC_STATUS.ERROR) {
      try {
        await cloud.syncSimplePurchaseCloud(localOrder, localDocument)
        const synced = await cloud.fetchOrderById(orderId)
        if (synced) return synced
      } catch (error) {
        console.warn('[ensurePurchaseAndReceiving] sync retry', error)
      }
    }

    if (attempt < attempts - 1) {
      await delay(delayMs)
    }
  }

  return null
}

function buildReceivingDocumentPayload(document, order, cloudOrder) {
  const orderId = order?.id ?? document?.purchaseOrderId ?? cloudOrder?.id
  const docId =
    document?.id ??
    cloudOrder?.receivingDocumentId ??
    order?.receivingDocumentId ??
    crypto.randomUUID()

  return normalizeReceivingDocument({
    id: docId,
    purchaseOrderId: orderId,
    supplierId: document?.supplierId ?? order?.supplierId ?? cloudOrder?.supplierId ?? null,
    supplierName: document?.supplierName ?? order?.supplierName ?? cloudOrder?.supplierName ?? '',
    status: RECEIVING_STATUS.AWAITING_RECEIVING,
    expectedDeliveryDate:
      document?.expectedDeliveryDate ??
      order?.expectedDeliveryDate ??
      cloudOrder?.expectedDeliveryDate ??
      '',
    totalAmount: document?.totalAmount ?? order?.totalAmount ?? cloudOrder?.totalAmount ?? 0,
    workflowMode: PROCUREMENT_WORKFLOW_MODE.SIMPLE,
  })
}

async function tryEnsurePurchaseAndReceivingInCloud(document, order) {
  const orderId = order?.id ?? document?.purchaseOrderId
  if (!orderId) {
    throw new Error('Закуп не найден')
  }

  let localOrder = order || getPurchaseOrdersSync().find((item) => item.id === orderId) || null
  let localDocument =
    document ||
    getReceivingDocumentsSync().find((item) => item.purchaseOrderId === orderId) ||
    null

  if (localOrder?.syncStatus === SYNC_STATUS.PENDING) {
    await waitForPurchaseOrderInCloud(orderId)
    localOrder = getPurchaseOrdersSync().find((item) => item.id === orderId) || localOrder
    localDocument =
      getReceivingDocumentsSync().find((item) => item.purchaseOrderId === orderId) || localDocument
  }

  let cloudOrder = await cloud.fetchOrderById(orderId)
  if (!cloudOrder && localOrder) {
    await cloud.syncSimplePurchaseCloud(localOrder, localDocument)
    cloudOrder = await cloud.fetchOrderById(orderId)
  }

  if (!cloudOrder) {
    cloudOrder = await waitForPurchaseOrderInCloud(orderId)
  }

  if (!cloudOrder) {
    throw new Error('Закуп не синхронизирован с Supabase')
  }

  const candidateIds = [
    localDocument?.id,
    document?.id,
    cloudOrder.receivingDocumentId,
    localOrder?.receivingDocumentId,
  ].filter(Boolean)

  for (const docId of candidateIds) {
    const existing = await receivingCloud.fetchDocumentById(docId)
    if (existing) {
      return { document: existing, order: cloudOrder }
    }
  }

  const docPayload = buildReceivingDocumentPayload(localDocument || document, localOrder, cloudOrder)

  await receivingCloud.syncSimpleReceivingDocumentCloud(docPayload, cloudOrder)

  let ensuredDocument = await receivingCloud.fetchDocumentById(docPayload.id)
  if (!ensuredDocument && cloudOrder.receivingDocumentId) {
    ensuredDocument = await receivingCloud.fetchDocumentById(cloudOrder.receivingDocumentId)
  }

  if (!ensuredDocument) {
    const refreshedOrder = await cloud.fetchOrderById(orderId)
    if (refreshedOrder?.receivingDocumentId) {
      ensuredDocument = await receivingCloud.fetchDocumentById(refreshedOrder.receivingDocumentId)
      if (ensuredDocument) {
        return { document: ensuredDocument, order: refreshedOrder }
      }
    }

    if (!refreshedOrder?.receivingDocumentId) {
      const created = await receivingCloud.createSimpleReceivingFromPurchaseCloud(
        refreshedOrder || cloudOrder,
        null
      )
      if (created?.receivingDocumentId) {
        ensuredDocument = await receivingCloud.fetchDocumentById(created.receivingDocumentId)
        const finalOrder = await cloud.fetchOrderById(orderId)
        if (ensuredDocument) {
          return { document: ensuredDocument, order: finalOrder || cloudOrder }
        }
      }
    }
  }

  if (!ensuredDocument?.id) {
    throw new Error('Документ приёмки не найден в Supabase')
  }

  const finalOrder = (await cloud.fetchOrderById(orderId)) || cloudOrder
  return { document: ensuredDocument, order: finalOrder }
}

async function ensurePurchaseAndReceivingInCloud(document, order) {
  let lastError = null

  for (const waitMs of ENSURE_CLOUD_RETRY_DELAYS_MS) {
    if (waitMs) {
      await delay(waitMs)
    }

    try {
      const ensured = await tryEnsurePurchaseAndReceivingInCloud(document, order)
      if (ensured?.document?.id) {
        upsertCloudReceivingDocument(ensured.document)
        if (ensured.order) {
          upsertCloudPurchase(ensured.order)
        }
        return ensured
      }
    } catch (error) {
      lastError = error
      console.warn('[ensurePurchaseAndReceivingInCloud] retry', error)
    }
  }

  throw lastError || new Error('Документ приёмки не найден в Supabase')
}

/** Фоновое сохранение отметки чек-листа в Supabase */
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

  const ensured = await ensurePurchaseAndReceivingInCloud(document, order)
  if (!ensured?.document?.id) {
    throw new Error('Документ приёмки не найден в Supabase')
  }

  const resolvedDocumentId = ensured.document.id

  if (received) {
    await receivingCloud.acceptSimpleDeliveryCloud(resolvedDocumentId, user)
  } else {
    await receivingCloud.unacceptSimpleDeliveryCloud(resolvedDocumentId)
  }

  clearOptimisticReceivingSyncState(
    resolvedDocumentId,
    order?.id ?? ensured.document.purchaseOrderId
  )

  const freshDocument = await receivingCloud.fetchDocumentById(resolvedDocumentId)
  if (freshDocument) {
    upsertCloudReceivingDocument(freshDocument)
  }

  const purchaseOrderId = order?.id ?? ensured.document.purchaseOrderId
  if (purchaseOrderId) {
    const freshOrder = await cloud.fetchOrderById(purchaseOrderId)
    if (freshOrder) {
      upsertCloudPurchase(freshOrder)
    }
  }
}

function applySimpleDeliveryStateLocal(document, order, { received, user }) {
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
  materializeReceivingDocument(updatedDocument, order)

  if (order) {
    const orderPatch = {
      status: received ? PURCHASE_STATUS.RECEIVED : PURCHASE_STATUS.AWAITING_RECEIVING,
      updatedAt: now,
    }
    upsertOptimisticPurchase(order, orderPatch)
    local.updatePurchaseOrderSync(order.id, orderPatch)
  }
}

/** Чек-лист приёмки: optimistic UI + сохранение в Supabase (cloud) */
function markSimpleDeliveryChecklist({ documentId, user, notifyChange, context, received }) {
  const document = resolveReceivingDocumentForAction({
    documentId,
    orderId: context.orderId ?? context.order?.id,
    fallbackDocument: context.document,
  })
  if (!document?.id) {
    console.error('[SimpleDeliveryChecklist] document not found', { documentId, context })
    return Promise.resolve(false)
  }

  const order = resolveOrderForReceivingDocument(document, context.order)
  const resolvedDocumentId = document.id

  if (isCloudMode()) {
    const toggleState = getReceivingChecklistToggleState(
      order,
      getReceivingDocumentsSync(),
      true
    )
    if (!toggleState.canToggle) {
      console.warn('[SimpleDeliveryChecklist] toggle blocked until sync', {
        documentId: resolvedDocumentId,
        reason: toggleState.reason,
      })
      return Promise.resolve(false)
    }
  }

  const cloudSnapshot = isCloudMode()
    ? applySimpleDeliveryStateCloud(document, order, {
        received,
        user: received ? user : null,
      })
    : null

  if (!isCloudMode()) {
    applySimpleDeliveryStateLocal(document, order, { received, user: received ? user : null })
    notifyChange?.()
    toastSuccess(received ? ACCEPT_SUCCESS_MESSAGE : UNACCEPT_SUCCESS_MESSAGE)
    return Promise.resolve(true)
  }

  notifyChange?.()

  return persistSimpleDeliveryChecklistState({
    documentId: resolvedDocumentId,
    document,
    order,
    received,
    user,
  })
    .then(() => {
      notifyChange?.()
      toastSuccess(received ? ACCEPT_SUCCESS_MESSAGE : UNACCEPT_SUCCESS_MESSAGE)
      return true
    })
    .catch((error) => {
      console.error('[SimpleDeliveryChecklist] persist failed', error)
      revertSimpleDeliveryStateCloud(cloudSnapshot)
      notifyChange?.()
      toastError(
        toUserErrorMessage(error, received ? ACCEPT_ERROR_MESSAGE : UNACCEPT_ERROR_MESSAGE)
      )
      return false
    })
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
