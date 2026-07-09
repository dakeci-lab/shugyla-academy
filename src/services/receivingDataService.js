import { isCloudMode } from '../lib/dataMode'
import { getCloudReceivingDocuments } from '../lib/cloudStore'
import { refreshData } from './academyDataService'
import * as local from './receivingLocalAdapter'
import * as cloud from './receivingSupabaseAdapter'

function getReceivingSource() {
  if (isCloudMode()) {
    const documents = getCloudReceivingDocuments()
    if (documents) return documents
    return []
  }
  return local.getLocalReceivingBundle().documents
}

async function afterReceivingMutation() {
  if (isCloudMode()) {
    await refreshData()
  }
}

export function getReceivingDocumentsSync() {
  return getReceivingSource()
}

export function getReceivingDocumentByIdSync(id) {
  return getReceivingDocumentsSync().find((doc) => doc.id === id) || null
}

export async function loadReceivingDocuments() {
  if (isCloudMode()) {
    return cloud.fetchReceivingDataCloud()
  }
  return local.fetchReceivingDataLocal()
}

export async function transferFromPurchase(orderId, user) {
  const result = isCloudMode()
    ? await cloud.transferFromPurchaseCloud(orderId, user)
    : await local.transferFromPurchaseLocal(orderId, user)
  await afterReceivingMutation()
  return result
}

export async function saveReceivingDocument(documentId, items, user) {
  const result = isCloudMode()
    ? await cloud.saveReceivingDocumentCloud(documentId, items, user)
    : await local.saveReceivingDocumentLocal(documentId, items, user)
  await afterReceivingMutation()
  return result
}

export async function completeReceivingDocument(documentId, items, user) {
  const result = isCloudMode()
    ? await cloud.completeReceivingDocumentCloud(documentId, items, user)
    : await local.completeReceivingDocumentLocal(documentId, items, user)
  await afterReceivingMutation()
  return result
}
