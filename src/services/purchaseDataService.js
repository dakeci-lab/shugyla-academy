import { isCloudMode } from '../lib/dataMode'
import {
  getCloudPurchases,
  isModuleReady,
  getModuleError,
  getModuleLoadState,
  MODULE_STATUS,
} from '../lib/cloudStore'
import { refreshProcurementData } from './platformDataService'
import * as local from './purchaseLocalAdapter'
import * as cloud from './purchaseSupabaseAdapter'

export function isPurchasesDataReady() {
  return !isCloudMode() || isModuleReady('procurement')
}

export function isPurchasesDataLoading() {
  if (!isCloudMode()) return false
  const state = getModuleLoadState('procurement')
  return state === MODULE_STATUS.IDLE || state === MODULE_STATUS.LOADING
}

export function getPurchasesDataError() {
  if (!isCloudMode()) return null
  return getModuleError('procurement')
}

function getPurchasesSource() {
  if (isCloudMode()) {
    if (!isModuleReady('procurement')) return []
    return getCloudPurchases() || []
  }
  return local.getLocalPurchasesBundle().orders
}

async function afterPurchaseMutation() {
  if (isCloudMode()) {
    await refreshProcurementData()
  }
}

export function getPurchaseOrdersSync() {
  return getPurchasesSource()
}

export function getPurchaseOrderByIdSync(id) {
  return getPurchaseOrdersSync().find((o) => o.id === id) || null
}

/** Загружает полный закуп по прямой ссылке, даже если общий модуль ещё не успел прогреться. */
export async function getPurchaseOrderById(id) {
  if (!id) return null
  if (isCloudMode()) return cloud.fetchOrderById(id)
  return getPurchaseOrderByIdSync(id)
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

/**
 * Приёмщик отметил заказ «Сверено» (всё сошлось с накладной). Отметка общая — её видят в списке заказов.
 * `checked = false` снимает отметку.
 */
export async function setPurchaseOrderChecked(orderId, checked, user) {
  if (isCloudMode()) {
    const result = await cloud.setOrderCheckedCloud(orderId, checked)
    await afterPurchaseMutation()
    return result
  }
  return updatePurchaseOrder(
    orderId,
    checked
      ? { checkedAt: new Date().toISOString(), checkedByName: user?.name || user?.login || '' }
      : { checkedAt: null, checkedByName: null }
  )
}

/** «Сохранить»: черновик → «Сохранён». */
export async function savePurchaseOrder(orderId) {
  const result = isCloudMode()
    ? await cloud.submitPurchaseOrderCloud(orderId)
    : await local.submitPurchaseOrder(orderId)
  await afterPurchaseMutation()
  return result
}

/** «Отменить»: «Сохранён» → черновик. Отметка «Сверено» снимается на сервере. */
export async function cancelSavedPurchaseOrder(orderId) {
  const result = isCloudMode()
    ? await cloud.unsavePurchaseOrderCloud(orderId)
    : await local.unsavePurchaseOrder(orderId)
  await afterPurchaseMutation()
  return result
}

export async function deletePurchaseOrder(orderId) {
  if (isCloudMode()) {
    await cloud.deletePurchaseOrderCloud(orderId)
  } else {
    await local.deletePurchaseOrder(orderId)
  }
  await afterPurchaseMutation()
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
