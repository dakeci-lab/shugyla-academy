import { isCloudMode } from '../lib/dataMode'
import { getCloudPurchases } from '../lib/cloudStore'
import { refreshData } from './academyDataService'
import * as local from './purchaseLocalAdapter'
import * as cloud from './purchaseSupabaseAdapter'

function getAdapter() {
  return isCloudMode() ? cloud : local
}

function getPurchasesSource() {
  if (isCloudMode()) {
    const orders = getCloudPurchases()
    if (orders) return orders
    return []
  }
  return local.getLocalPurchasesBundle().orders
}

async function afterPurchaseMutation() {
  if (isCloudMode()) {
    await refreshData()
  }
}

export function getPurchaseOrdersSync() {
  return getPurchasesSource()
}

export function getPurchaseOrderByIdSync(id) {
  return getPurchaseOrdersSync().find((o) => o.id === id) || null
}

export async function loadPurchases() {
  if (isCloudMode()) {
    return cloud.fetchPurchasesDataCloud()
  }
  return local.fetchPurchasesData()
}

export async function createPurchaseOrder(data) {
  const id = isCloudMode()
    ? await cloud.createPurchaseOrderCloud(data)
    : await local.createPurchaseOrder(data)
  await afterPurchaseMutation()
  return id
}

export async function updatePurchaseOrder(orderId, updates) {
  const result = isCloudMode()
    ? await cloud.updatePurchaseOrderCloud(orderId, updates)
    : await local.updatePurchaseOrder(orderId, updates)
  await afterPurchaseMutation()
  return result
}

export async function cancelPurchaseOrder(orderId) {
  if (isCloudMode()) {
    await cloud.cancelPurchaseOrderCloud(orderId)
  } else {
    await local.cancelPurchaseOrder(orderId)
  }
  await afterPurchaseMutation()
}

export async function deletePurchaseOrder(orderId) {
  if (isCloudMode()) {
    await cloud.deletePurchaseOrderCloud(orderId)
  } else {
    throw new Error('Удаление закупа доступно только в облачном режиме')
  }
  await afterPurchaseMutation()
}

export async function transferPurchaseToReceiving(orderId) {
  const result = isCloudMode()
    ? await cloud.transferPurchaseToReceivingCloud(orderId)
    : await local.transferPurchaseToReceiving(orderId)
  await afterPurchaseMutation()
  return result
}

export async function addPurchaseOrderItem(orderId, item) {
  if (isCloudMode()) {
    const id = await cloud.addPurchaseOrderItemCloud(orderId, item)
    await afterPurchaseMutation()
    return id
  }
  throw new Error('Добавление позиции через API доступно в облачном режиме')
}

export async function updatePurchaseOrderItem(orderId, itemId, patch) {
  if (isCloudMode()) {
    const result = await cloud.updatePurchaseOrderItemCloud(orderId, itemId, patch)
    await afterPurchaseMutation()
    return result
  }
  throw new Error('Обновление позиции через API доступно в облачном режиме')
}

export async function deletePurchaseOrderItem(orderId, itemId) {
  if (isCloudMode()) {
    await cloud.deletePurchaseOrderItemCloud(orderId, itemId)
    await afterPurchaseMutation()
    return
  }
  throw new Error('Удаление позиции через API доступно в облачном режиме')
}
