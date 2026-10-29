import { isCloudMode } from '../lib/dataMode'
import {
  getCloudPurchases,
  putCloudPurchase,
  dropCloudPurchase,
  isModuleReady,
  getModuleError,
  getModuleLoadState,
  MODULE_STATUS,
} from '../lib/cloudStore'
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

/**
 * После изменения ОДНОГО заказа перечитываем только его и кладём в кэш. Полная перезагрузка закупа (959 заказов,
 * десятки запросов) на каждое нажатие давала мигание интерфейса; остальное догонит realtime.
 */
async function afterOrderChange(orderId, fresh) {
  if (!isCloudMode()) return
  const order = fresh === undefined ? await cloud.fetchOrderById(orderId) : fresh
  if (order) putCloudPurchase(order)
  else dropCloudPurchase(orderId)
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

/** id заказов, у которых в позициях встречается текст (название или штрихкод). */
export async function findPurchaseOrderIdsByItemText(text) {
  const q = String(text || '').trim().toLowerCase()
  if (!q) return []
  if (isCloudMode()) return cloud.searchOrderIdsByItemTextCloud(q)
  return getPurchaseOrdersSync()
    .filter((order) =>
      (order.items || []).some(
        (item) =>
          String(item.productName || '').toLowerCase().includes(q) ||
          String(item.barcode || '').includes(q)
      )
    )
    .map((order) => order.id)
}

export async function createPurchaseOrder(data) {
  const id = isCloudMode()
    ? await cloud.createPurchaseOrderCloud(data)
    : await local.createPurchaseOrder(data)
  await afterOrderChange(id)
  return id
}

export async function updatePurchaseOrder(orderId, updates) {
  const result = isCloudMode()
    ? await cloud.updatePurchaseOrderCloud(orderId, updates)
    : await local.updatePurchaseOrder(orderId, updates)
  await afterOrderChange(orderId, result)
  return result
}

/**
 * Приёмщик отметил заказ «Сверено» (всё сошлось с накладной). Отметка общая — её видят в списке заказов.
 * `checked = false` снимает отметку.
 */
export async function setPurchaseOrderChecked(orderId, checked, user) {
  if (isCloudMode()) {
    const result = await cloud.setOrderCheckedCloud(orderId, checked)
    await afterOrderChange(orderId, result)
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
  await afterOrderChange(orderId, result)
  return result
}

/** «Отменить»: «Сохранён» → черновик. Отметка «Сверено» снимается на сервере. */
export async function cancelSavedPurchaseOrder(orderId) {
  const result = isCloudMode()
    ? await cloud.unsavePurchaseOrderCloud(orderId)
    : await local.unsavePurchaseOrder(orderId)
  await afterOrderChange(orderId, result)
  return result
}

export async function deletePurchaseOrder(orderId) {
  if (isCloudMode()) {
    await cloud.deletePurchaseOrderCloud(orderId)
  } else {
    await local.deletePurchaseOrder(orderId)
  }
  await afterOrderChange(orderId, null)
}

export async function addPurchaseOrderItem(orderId, item) {
  const id = isCloudMode()
    ? await cloud.addPurchaseOrderItemCloud(orderId, item)
    : await local.addPurchaseOrderItem(orderId, item)
  await afterOrderChange(orderId)
  return id
}

/** Несколько позиций сразу (один запрос в облаке). */
export async function addPurchaseOrderItems(orderId, items) {
  if (!items.length) return []
  if (isCloudMode()) {
    const ids = await cloud.addPurchaseOrderItemsCloud(orderId, items)
    await afterOrderChange(orderId)
    return ids
  }
  const ids = []
  for (const item of items) ids.push(await local.addPurchaseOrderItem(orderId, item))
  return ids
}

export async function updatePurchaseOrderItem(orderId, itemId, patch) {
  const result = isCloudMode()
    ? await cloud.updatePurchaseOrderItemCloud(orderId, itemId, patch)
    : await local.updatePurchaseOrderItem(orderId, itemId, patch)
  await afterOrderChange(orderId)
  return result
}

export async function deletePurchaseOrderItem(orderId, itemId) {
  if (isCloudMode()) {
    await cloud.deletePurchaseOrderItemCloud(orderId, itemId)
  } else {
    await local.deletePurchaseOrderItem(orderId, itemId)
  }
  await afterOrderChange(orderId)
}
