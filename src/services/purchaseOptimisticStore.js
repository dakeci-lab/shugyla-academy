import { normalizePurchaseOrder } from '../utils/purchaseData'
import { normalizeReceivingDocument } from '../utils/receivingData'

const OVERLAY_KEY = 'shugyla_purchase_optimistic_overlay'

function emptyOverlay() {
  return { orders: [], documents: [], pendingDeletes: [] }
}

function readOverlay() {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY)
    if (!raw) return emptyOverlay()
    const parsed = JSON.parse(raw)
    return {
      orders: (parsed.orders || []).map(normalizePurchaseOrder).filter(Boolean),
      documents: (parsed.documents || [])
        .map((doc) => normalizeReceivingDocument(doc))
        .filter(Boolean),
      pendingDeletes: (parsed.pendingDeletes || []).map((entry) => ({
        orderId: entry.orderId,
        order: normalizePurchaseOrder(entry.order),
        document: entry.document
          ? normalizeReceivingDocument(entry.document)
          : null,
      })).filter((entry) => entry.orderId && entry.order),
    }
  } catch {
    return emptyOverlay()
  }
}

function writeOverlay(overlay) {
  localStorage.setItem(
    OVERLAY_KEY,
    JSON.stringify({
      orders: overlay.orders,
      documents: overlay.documents,
      pendingDeletes: overlay.pendingDeletes,
    })
  )
}

export function getOptimisticOverlay() {
  return readOverlay()
}

export function getOptimisticDeletedOrderIds() {
  return readOverlay().pendingDeletes.map((entry) => entry.orderId)
}

export function getOptimisticDeleteSnapshot(orderId) {
  return readOverlay().pendingDeletes.find((entry) => entry.orderId === orderId) || null
}

export function isOptimisticDeleted(orderId) {
  return getOptimisticDeleteSnapshot(orderId) != null
}

export function saveOptimisticPurchase(order, document) {
  const overlay = readOverlay()
  overlay.orders = overlay.orders.filter((item) => item.id !== order.id)
  overlay.orders.unshift(order)
  if (document) {
    overlay.documents = overlay.documents.filter((item) => item.id !== document.id)
    overlay.documents.unshift(document)
  }
  writeOverlay(overlay)
}

export function updateOptimisticPurchase(orderId, patch) {
  const overlay = readOverlay()
  overlay.orders = overlay.orders.map((item) =>
    item.id === orderId ? normalizePurchaseOrder({ ...item, ...patch }) : item
  )
  writeOverlay(overlay)
  return overlay.orders.find((item) => item.id === orderId) || null
}

export function updateOptimisticReceivingDocument(documentId, patch) {
  const overlay = readOverlay()
  overlay.documents = overlay.documents.map((item) =>
    item.id === documentId ? normalizeReceivingDocument({ ...item, ...patch }) : item
  )
  writeOverlay(overlay)
  return overlay.documents.find((item) => item.id === documentId) || null
}

export function upsertOptimisticReceivingDocument(document, patch) {
  const overlay = readOverlay()
  const idx = overlay.documents.findIndex((item) => item.id === document.id)
  const next = normalizeReceivingDocument({
    ...(idx >= 0 ? overlay.documents[idx] : document),
    ...patch,
  })

  if (idx >= 0) {
    overlay.documents[idx] = next
  } else {
    overlay.documents.unshift(next)
  }

  writeOverlay(overlay)
  return next
}

export function upsertOptimisticPurchase(order, patch) {
  const overlay = readOverlay()
  const idx = overlay.orders.findIndex((item) => item.id === order.id)
  const next = normalizePurchaseOrder({
    ...(idx >= 0 ? overlay.orders[idx] : order),
    ...patch,
  })

  if (idx >= 0) {
    overlay.orders[idx] = next
  } else {
    overlay.orders.unshift(next)
  }

  writeOverlay(overlay)
  return next
}

/** После успешной синхронизации с Supabase убираем optimistic-копии */
export function clearOptimisticReceivingSyncState(documentId, orderId) {
  const overlay = readOverlay()
  overlay.documents = overlay.documents.filter((item) => item.id !== documentId)
  if (orderId) {
    overlay.orders = overlay.orders.filter((item) => item.id !== orderId)
  }
  writeOverlay(overlay)
}

export function clearOptimisticPurchase(orderId) {
  const overlay = readOverlay()
  overlay.orders = overlay.orders.filter((item) => item.id !== orderId)
  overlay.documents = overlay.documents.filter((item) => item.purchaseOrderId !== orderId)
  writeOverlay(overlay)
}

export function saveOptimisticDelete(orderId, snapshot) {
  const overlay = readOverlay()
  overlay.pendingDeletes = overlay.pendingDeletes.filter((entry) => entry.orderId !== orderId)
  overlay.pendingDeletes.push({
    orderId,
    order: snapshot.order,
    document: snapshot.document || null,
  })
  overlay.orders = overlay.orders.filter((item) => item.id !== orderId)
  overlay.documents = overlay.documents.filter((item) => item.purchaseOrderId !== orderId)
  writeOverlay(overlay)
}

export function clearOptimisticDelete(orderId) {
  const overlay = readOverlay()
  overlay.pendingDeletes = overlay.pendingDeletes.filter((entry) => entry.orderId !== orderId)
  writeOverlay(overlay)
}

export function restoreOptimisticDelete(orderId) {
  const overlay = readOverlay()
  const entry = overlay.pendingDeletes.find((item) => item.orderId === orderId)
  if (!entry) return null

  overlay.pendingDeletes = overlay.pendingDeletes.filter((item) => item.orderId !== orderId)
  overlay.orders = overlay.orders.filter((item) => item.id !== orderId)
  overlay.orders.unshift(entry.order)
  if (entry.document) {
    overlay.documents = overlay.documents.filter((item) => item.id !== entry.document.id)
    overlay.documents.unshift(entry.document)
  }
  writeOverlay(overlay)
  return entry
}

export function mergePurchaseOrders(baseOrders, overlayOrders, deletedOrderIds = []) {
  const deleted = new Set(deletedOrderIds)
  const merged = new Map()

  for (const order of baseOrders || []) {
    if (!deleted.has(order.id)) merged.set(order.id, order)
  }
  for (const order of overlayOrders || []) {
    if (!deleted.has(order.id)) merged.set(order.id, order)
  }

  return [...merged.values()]
}

export function mergeReceivingDocuments(
  baseDocuments,
  overlayDocuments,
  deletedPurchaseOrderIds = []
) {
  const deleted = new Set(deletedPurchaseOrderIds)
  const merged = new Map()

  for (const doc of baseDocuments || []) {
    if (!deleted.has(doc.purchaseOrderId)) merged.set(doc.id, doc)
  }
  for (const doc of overlayDocuments || []) {
    if (!deleted.has(doc.purchaseOrderId)) merged.set(doc.id, doc)
  }

  return [...merged.values()]
}
