import { isCloudMode } from '../lib/dataMode'
import * as local from './purchaseLocalAdapter'

/**
 * Сервис закупок — локальный mock, позже purchase_orders / purchase_order_items в Supabase
 */

function getAdapter() {
  // TODO: подключить purchaseSupabaseAdapter при готовности таблиц
  return local
}

export function getPurchaseOrdersSync() {
  return getAdapter().getLocalPurchasesBundle().orders
}

export function getPurchaseOrderByIdSync(id) {
  return getPurchaseOrdersSync().find((o) => o.id === id) || null
}

export async function loadPurchases() {
  if (isCloudMode()) {
    return getAdapter().fetchPurchasesDataCloud()
  }
  return getAdapter().fetchPurchasesData()
}

export async function createPurchaseOrder(data) {
  const adapter = getAdapter()
  if (isCloudMode()) {
    return adapter.createPurchaseOrderCloud(data)
  }
  return adapter.createPurchaseOrder(data)
}

export async function updatePurchaseOrder(orderId, updates) {
  const adapter = getAdapter()
  if (isCloudMode()) {
    return adapter.updatePurchaseOrderCloud(orderId, updates)
  }
  return adapter.updatePurchaseOrder(orderId, updates)
}

export async function cancelPurchaseOrder(orderId) {
  const adapter = getAdapter()
  if (isCloudMode()) {
    return adapter.cancelPurchaseOrderCloud(orderId)
  }
  return adapter.cancelPurchaseOrder(orderId)
}

export async function transferPurchaseToReceiving(orderId) {
  const adapter = getAdapter()
  if (isCloudMode()) {
    return adapter.transferPurchaseToReceivingCloud(orderId)
  }
  return adapter.transferPurchaseToReceiving(orderId)
}
