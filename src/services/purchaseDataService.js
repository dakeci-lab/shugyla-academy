import { isCloudMode } from '../lib/dataMode'
import { getCloudPurchases, isCloudStoreLoaded } from '../lib/cloudStore'
import { refreshData } from './academyDataService'
import * as local from './purchaseLocalAdapter'
import * as cloud from './purchaseSupabaseAdapter'
import {
  getOptimisticOverlayForMerge,
  getOptimisticDeletedOrderIds,
  mergePurchaseOrders,
} from './purchaseOptimisticStore'

function getAdapter() {
  return isCloudMode() ? cloud : local
}

function getPurchasesSource() {
  if (isCloudMode()) {
    if (!isCloudStoreLoaded()) return []
    const orders = getCloudPurchases() || []
    const overlay = getOptimisticOverlayForMerge()
    const deletedOrderIds = getOptimisticDeletedOrderIds()
    return mergePurchaseOrders(orders, overlay.orders, deletedOrderIds)
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
    await local.deletePurchaseOrder(orderId)
  }
  await afterPurchaseMutation()
}

export async function createSimplePurchase(data, user) {
  const id = isCloudMode()
    ? await cloud.createSimplePurchaseCloud(data, user)
    : await local.createSimplePurchase(data, user)
  await afterPurchaseMutation()
  return id
}

export async function transferPurchaseToReceiving(orderId, user) {
  const { transferFromPurchase } = await import('./receivingDataService')
  const result = await transferFromPurchase(orderId, user)
  await afterPurchaseMutation()
  return result
}

export async function addPurchaseOrderItem(orderId, item) {
  const id = isCloudMode()
    ? await cloud.addPurchaseOrderItemCloud(orderId, item)
    : await local.addPurchaseOrderItem(orderId, item)
  await afterPurchaseMutation()
  return id
}

export async function updatePurchaseOrderItem(orderId, itemId, patch) {
  const result = isCloudMode()
    ? await cloud.updatePurchaseOrderItemCloud(orderId, itemId, patch)
    : await local.updatePurchaseOrderItem(orderId, itemId, patch)
  await afterPurchaseMutation()
  return result
}

export async function deletePurchaseOrderItem(orderId, itemId) {
  if (isCloudMode()) {
    await cloud.deletePurchaseOrderItemCloud(orderId, itemId)
  } else {
    await local.deletePurchaseOrderItem(orderId, itemId)
  }
  await afterPurchaseMutation()
}
