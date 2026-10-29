import { isCloudMode } from '../lib/dataMode'
import {
  fetchLatestReadyProcurementSnapshot,
  fetchSnapshotItemsPage,
} from './procurementPlanningService'

const SNAPSHOT_TTL_MS = 60_000
let cachedSnapshot = { id: null, at: 0 }

async function latestSnapshotId() {
  if (cachedSnapshot.id && Date.now() - cachedSnapshot.at < SNAPSHOT_TTL_MS) return cachedSnapshot.id
  const snapshot = await fetchLatestReadyProcurementSnapshot()
  cachedSnapshot = { id: snapshot?.id || null, at: Date.now() }
  return cachedSnapshot.id
}

/**
 * Products of the latest UMAG snapshot matching a name / barcode text (the nomenclature of the platform).
 * `platformSupplierId` narrows to one supplier. Only the cloud has a snapshot; local mode returns [].
 */
export async function searchCatalogProducts({ search = '', platformSupplierId = '', limit = 8 } = {}) {
  if (!isCloudMode()) return []
  const snapshotId = await latestSnapshotId()
  if (!snapshotId) return []
  const { items } = await fetchSnapshotItemsPage({
    snapshotId,
    page: 1,
    pageSize: limit,
    search,
    platformSupplierId,
  })
  return items
}

/** Snapshot row → fields of a document row (quantity stays empty: the buyer fills it in). */
export function catalogProductToItem(product, { orderQty = 0 } = {}) {
  return {
    productName: product.productName,
    barcode: product.barcode,
    stock: product.calculationStock,
    salesPerDay: product.avgDaily,
    recommendation: product.recommendedQty,
    purchasePrice: product.purchasePrice,
    orderQty,
  }
}
