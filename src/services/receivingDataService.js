import { isCloudMode } from '../lib/dataMode'
import {
  getCloudReceivingDocuments,
  isModuleReady,
  getModuleError,
  getModuleLoadState,
  MODULE_STATUS,
} from '../lib/cloudStore'
import { refreshProcurementData } from './platformDataService'
import * as local from './receivingLocalAdapter'
import * as cloud from './receivingSupabaseAdapter'
import {
  getOptimisticOverlayForMerge,
  getOptimisticDeletedOrderIds,
  mergeReceivingDocuments,
} from './purchaseOptimisticStore'

export function isReceivingDataReady() {
  return !isCloudMode() || isModuleReady('receiving')
}

export function isReceivingDataLoading() {
  if (!isCloudMode()) return false
  const state = getModuleLoadState('receiving')
  return state === MODULE_STATUS.IDLE || state === MODULE_STATUS.LOADING
}

export function getReceivingDataError() {
  if (!isCloudMode()) return null
  return getModuleError('receiving')
}

function getReceivingSource() {
  if (isCloudMode()) {
    if (!isModuleReady('receiving')) return []
    const documents = getCloudReceivingDocuments() || []
    const overlay = getOptimisticOverlayForMerge()
    const deletedOrderIds = getOptimisticDeletedOrderIds()
    return mergeReceivingDocuments(documents, overlay.documents, deletedOrderIds)
  }
  return local.getLocalReceivingBundle().documents
}

async function afterReceivingMutation() {
  if (isCloudMode()) {
    await refreshProcurementData()
  }
}

export function getReceivingDocumentsSync() {
  return getReceivingSource()
}

export function getReceivingDocumentByIdSync(id) {
  return getReceivingDocumentsSync().find((doc) => doc.id === id) || null
}

/** Загружает один документ независимо от состояния общего кэша модуля. */
export async function loadReceivingDocumentById(id) {
  if (!id) return null
  if (isCloudMode()) return cloud.fetchDocumentById(id)
  return local.getLocalReceivingDocumentById(id)
}

export async function loadReceivingDocuments() {
  if (isCloudMode()) {
    return cloud.fetchReceivingDataCloud()
  }
  return local.fetchReceivingDataLocal()
}

export async function startReceivingDocument(documentId, options = {}) {
  const result = isCloudMode()
    ? await cloud.startReceivingDocumentCloud(documentId, options)
    : await local.startReceivingDocumentLocal(documentId, options)
  await afterReceivingMutation()
  return result
}

export async function transferFromPurchase(orderId, user) {
  const result = isCloudMode()
    ? await cloud.transferFromPurchaseCloud(orderId, user)
    : await local.transferFromPurchaseLocal(orderId, user)
  await afterReceivingMutation()
  return result
}

export async function saveReceivingDocument(documentId, items, user, options = {}) {
  const result = isCloudMode()
    ? await cloud.saveReceivingDocumentCloud(documentId, items, user, options)
    : await local.saveReceivingDocumentLocal(documentId, items, user, options)
  await afterReceivingMutation()
  return result
}

/** Upload pending discrepancy photos and return items with durable references. */
export async function uploadReceivingItemPhotos(documentId, items) {
  return isCloudMode()
    ? cloud.uploadReceivingItemPhotosCloud(documentId, items)
    : local.uploadReceivingItemPhotosLocal(documentId, items)
}

export async function completeReceivingDocument(documentId, items, user, options = {}) {
  const result = isCloudMode()
    ? await cloud.completeReceivingDocumentCloud(documentId, items, user, options)
    : await local.completeReceivingDocumentLocal(documentId, items, user, options)
  await afterReceivingMutation()
  return result
}

export async function recordReceivingUmagExport(documentId, metadata = {}) {
  const result = isCloudMode()
    ? await cloud.recordReceivingUmagExportCloud(documentId, metadata)
    : await local.recordReceivingUmagExportLocal(documentId, metadata)
  await afterReceivingMutation()
  return result
}

export async function acceptSimpleDelivery(documentId, user) {
  const result = isCloudMode()
    ? await cloud.acceptSimpleDeliveryCloud(documentId, user)
    : await local.acceptSimpleDeliveryLocal(documentId, user)
  await afterReceivingMutation()
  return result
}

export async function unacceptSimpleDelivery(documentId) {
  const result = isCloudMode()
    ? await cloud.unacceptSimpleDeliveryCloud(documentId)
    : await local.unacceptSimpleDeliveryLocal(documentId)
  await afterReceivingMutation()
  return result
}
