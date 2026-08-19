/**
 * Supplier reconciliation acts (акты сверки).
 * UMAG snapshot is frozen at create time; source umag_supplies stay read-only.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { fetchLastUmagSyncRun, formatUmagDate, formatUmagMoney } from './umagSettlementsService'
import { fetchCanonicalSupplierDebt } from './supplierDebtService'

export const RECONCILIATION_BUCKET = 'supplier-reconciliation-docs'
export const MAX_RECONCILIATION_FILE_BYTES = 15 * 1024 * 1024
export const RECONCILIATION_ROUNDING_THRESHOLD = 0.01

export const RECONCILIATION_ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
])

export const RECONCILIATION_STATUS = {
  DRAFT: 'draft',
  MATCHED: 'matched',
  DISCREPANCY: 'discrepancy',
  RESOLVED: 'resolved',
}

const RECON_SELECT = `
  id,
  supplier_id,
  umag_supplier_id,
  supplier_name,
  date_from,
  date_to,
  status,
  umag_supply_count,
  umag_supply_amount,
  umag_supply_return_count,
  umag_supply_return_amount,
  umag_payment_amount,
  umag_payment_refund_amount,
  umag_debt,
  supplier_reported_balance,
  difference,
  comment,
  resolution_note,
  snapshot_synced_at,
  snapshot_last_umag_sync_id,
  created_by,
  updated_by,
  closed_by,
  created_at,
  updated_at,
  closed_at,
  created_by_user:academy_users!created_by(id, full_name),
  closed_by_user:academy_users!closed_by(id, full_name)
`

const DOC_SELECT =
  'id, reconciliation_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at'

function assertCloudReady() {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    throw new Error('Акты сверки доступны только в облачном режиме')
  }
}

function toNumber(value) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function emptySnapshot() {
  return {
    umagSupplyCount: 0,
    umagSupplyAmount: 0,
    umagSupplyReturnCount: 0,
    umagSupplyReturnAmount: 0,
    umagPaymentAmount: 0,
    umagPaymentRefundAmount: 0,
    umagDebt: 0,
  }
}

export function reconciliationStatusLabel(status) {
  switch (status) {
    case RECONCILIATION_STATUS.DRAFT:
      return 'Черновик'
    case RECONCILIATION_STATUS.MATCHED:
      return 'Сверено'
    case RECONCILIATION_STATUS.DISCREPANCY:
      return 'Есть расхождение'
    case RECONCILIATION_STATUS.RESOLVED:
      return 'Расхождение устранено'
    default:
      return status || '—'
  }
}

/**
 * difference = supplier_reported_balance - umag_debt
 */
export function computeReconciliationDifference(supplierReportedBalance, umagDebt) {
  if (supplierReportedBalance == null || supplierReportedBalance === '') return null
  const reported = toNumber(supplierReportedBalance)
  const debt = toNumber(umagDebt)
  return Math.round((reported - debt) * 10000) / 10000
}

export function deriveReconciliationStatus(supplierReportedBalance, difference) {
  if (supplierReportedBalance == null || supplierReportedBalance === '') {
    return RECONCILIATION_STATUS.DRAFT
  }
  if (difference == null) return RECONCILIATION_STATUS.DRAFT
  if (Math.abs(difference) <= RECONCILIATION_ROUNDING_THRESHOLD) {
    return RECONCILIATION_STATUS.MATCHED
  }
  return RECONCILIATION_STATUS.DISCREPANCY
}

export function describeDifference(difference) {
  if (difference == null) {
    return { amountLabel: '—', hint: 'Укажите задолженность по акту поставщика' }
  }
  if (Math.abs(difference) <= RECONCILIATION_ROUNDING_THRESHOLD) {
    return { amountLabel: formatUmagMoney(0), hint: 'Сверено' }
  }
  const abs = Math.abs(difference)
  const signed = `${difference > 0 ? '+' : '−'}${formatUmagMoney(abs).replace(' ₸', '')} ₸`
  if (difference > 0) {
    return {
      amountLabel: signed,
      hint: `Поставщик показывает на ${formatUmagMoney(abs)} больше`,
    }
  }
  return {
    amountLabel: signed,
    hint: `UMAG показывает на ${formatUmagMoney(abs)} больше`,
  }
}

export function formatReconciliationPeriod(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return '—'
  return `${formatUmagDate(`${dateFrom}T12:00:00+05:00`)}–${formatUmagDate(`${dateTo}T12:00:00+05:00`)}`
}

function safeFileName(name) {
  const base = String(name || 'document')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
  return base || 'document'
}

export function validateReconciliationFile(file) {
  if (!file) return 'Выберите файл'
  const mime = String(file.type || '').toLowerCase()
  const byExt = /\.(pdf|jpe?g|png)$/i.test(file.name || '')
  const allowed =
    RECONCILIATION_ALLOWED_MIME.has(mime) ||
    (byExt && (mime === '' || mime === 'application/octet-stream'))

  if (!allowed) {
    return 'Допустимы только PDF, JPG и PNG'
  }
  if (file.size > MAX_RECONCILIATION_FILE_BYTES) {
    return 'Размер файла не должен превышать 15 МБ'
  }
  return null
}

function resolveMime(file) {
  const mime = String(file.type || '').toLowerCase()
  if (RECONCILIATION_ALLOWED_MIME.has(mime)) {
    return mime === 'image/jpg' ? 'image/jpeg' : mime
  }
  if (/\.pdf$/i.test(file.name || '')) return 'application/pdf'
  if (/\.png$/i.test(file.name || '')) return 'image/png'
  if (/\.jpe?g$/i.test(file.name || '')) return 'image/jpeg'
  return mime || 'application/octet-stream'
}

function userNameFromJoin(join) {
  if (!join) return null
  if (Array.isArray(join)) return join[0]?.full_name || null
  return join.full_name || null
}

export function normalizeReconciliation(row) {
  if (!row) return null
  return {
    id: row.id,
    supplierId: row.supplier_id,
    umagSupplierId: row.umag_supplier_id,
    supplierName: row.supplier_name || '',
    dateFrom: row.date_from,
    dateTo: row.date_to,
    status: row.status,
    umagSupplyCount: toNumber(row.umag_supply_count),
    umagSupplyAmount: toNumber(row.umag_supply_amount),
    umagSupplyReturnCount: toNumber(row.umag_supply_return_count),
    umagSupplyReturnAmount: toNumber(row.umag_supply_return_amount),
    umagPaymentAmount: toNumber(row.umag_payment_amount),
    umagPaymentRefundAmount: toNumber(row.umag_payment_refund_amount),
    umagDebt: toNumber(row.umag_debt),
    supplierReportedBalance:
      row.supplier_reported_balance == null ? null : toNumber(row.supplier_reported_balance),
    difference: row.difference == null ? null : toNumber(row.difference),
    comment: row.comment || '',
    resolutionNote: row.resolution_note || '',
    snapshotSyncedAt: row.snapshot_synced_at,
    snapshotLastUmagSyncId: row.snapshot_last_umag_sync_id,
    createdBy: row.created_by,
    createdByName: userNameFromJoin(row.created_by_user),
    updatedBy: row.updated_by,
    closedBy: row.closed_by,
    closedByName: userNameFromJoin(row.closed_by_user),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  }
}

export function normalizeReconciliationDocument(row) {
  if (!row) return null
  return {
    id: row.id,
    reconciliationId: row.reconciliation_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: toNumber(row.size_bytes),
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  }
}

/**
 * Period snapshot from active (non-deleted) umag_supplies + umag_supply_returns,
 * plus the canonical current open debt (Этап 2.1 — не по диапазону дат).
 *
 * umagDebt = fetchCanonicalSupplierDebt() = Σ supplier_payment_obligations.current_debt
 * for this supplier's OPEN obligations right now — a closing/current-debt value,
 * independent of the период сверки. The период still governs every other field
 * below (приёмки/возвраты/оплаты = движение за период).
 */
export async function computeUmagSnapshotForSupplier({
  supplierId,
  platformSupplierId,
  umagSupplierId,
  dateFrom,
  dateTo,
}) {
  assertCloudReady()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    throw new Error('Укажите корректный период сверки')
  }
  const canonicalId = platformSupplierId || supplierId
  if (!canonicalId && umagSupplierId == null) {
    throw new Error('Не выбран поставщик')
  }

  const fromIso = `${dateFrom}T00:00:00+05:00`
  const toIso = `${dateTo}T23:59:59.999+05:00`

  let suppliesQuery = supabase
    .from('umag_supplies')
    .select('amount, payment_amount, payment_refund_amount')
    .eq('is_source_deleted', false)
    .gte('doc_time', fromIso)
    .lte('doc_time', toIso)

  let returnsQuery = supabase
    .from('umag_supply_returns')
    .select('amount')
    .eq('is_source_deleted', false)
    .gte('document_time', fromIso)
    .lte('document_time', toIso)

  if (canonicalId) {
    suppliesQuery = suppliesQuery.eq('platform_supplier_id', canonicalId)
    returnsQuery = returnsQuery.eq('platform_supplier_id', canonicalId)
  } else {
    suppliesQuery = suppliesQuery.eq('umag_supplier_id', umagSupplierId)
    returnsQuery = returnsQuery.eq('umag_supplier_id', umagSupplierId)
  }

  const [suppliesRes, returnsRes, canonicalDebt] = await Promise.all([
    suppliesQuery,
    returnsQuery,
    fetchCanonicalSupplierDebt({ platformSupplierId: canonicalId, umagSupplierId }),
  ])
  if (suppliesRes.error) {
    throw new Error(suppliesRes.error.message || 'Не удалось рассчитать показатели UMAG')
  }
  if (returnsRes.error) {
    throw new Error(returnsRes.error.message || 'Не удалось рассчитать возвраты поставщикам UMAG')
  }

  const snapshot = emptySnapshot()
  for (const row of suppliesRes.data || []) {
    snapshot.umagSupplyCount += 1
    snapshot.umagSupplyAmount += toNumber(row.amount)
    snapshot.umagPaymentAmount += toNumber(row.payment_amount)
    snapshot.umagPaymentRefundAmount += toNumber(row.payment_refund_amount)
  }
  for (const row of returnsRes.data || []) {
    snapshot.umagSupplyReturnCount += 1
    snapshot.umagSupplyReturnAmount += Math.abs(toNumber(row.amount))
  }
  snapshot.umagDebt = canonicalDebt.debt
  return snapshot
}

export async function listSupplierReconciliations({
  supplierId,
  platformSupplierId,
  umagSupplierId,
} = {}) {
  assertCloudReady()

  let query = supabase
    .from('supplier_reconciliations')
    .select(RECON_SELECT)
    .order('created_at', { ascending: false })

  const canonicalId = platformSupplierId || supplierId
  if (canonicalId) {
    query = query.eq('supplier_id', canonicalId)
  } else if (umagSupplierId != null) {
    query = query.eq('umag_supplier_id', umagSupplierId)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(error.message || 'Не удалось загрузить историю сверок')
  }
  return (data || []).map(normalizeReconciliation).filter(Boolean)
}

export async function getSupplierReconciliation(id) {
  assertCloudReady()
  const { data, error } = await supabase
    .from('supplier_reconciliations')
    .select(RECON_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message || 'Не удалось загрузить сверку')
  return normalizeReconciliation(data)
}

export async function listReconciliationDocuments(reconciliationId) {
  assertCloudReady()
  const { data, error } = await supabase
    .from('supplier_reconciliation_documents')
    .select(DOC_SELECT)
    .eq('reconciliation_id', reconciliationId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Не удалось загрузить документы сверки')
  return (data || []).map(normalizeReconciliationDocument).filter(Boolean)
}

export async function createReconciliationDocumentSignedUrl(storagePath, expiresIn = 3600) {
  assertCloudReady()
  if (!storagePath) throw new Error('Файл не найден')

  const { data, error } = await supabase.storage
    .from(RECONCILIATION_BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Не удалось открыть документ')
  }
  return data.signedUrl
}

async function uploadReconciliationFile(reconciliationId, file, uploadedBy) {
  const validationError = validateReconciliationFile(file)
  if (validationError) throw new Error(validationError)

  const mime = resolveMime(file)
  if (!RECONCILIATION_ALLOWED_MIME.has(mime) && mime !== 'image/jpeg') {
    throw new Error('Допустимы только PDF, JPG и PNG')
  }

  const path = `reconciliations/${reconciliationId}/${Date.now()}-${safeFileName(file.name)}`
  const { error: uploadError } = await supabase.storage
    .from(RECONCILIATION_BUCKET)
    .upload(path, file, {
      contentType: mime === 'image/jpg' ? 'image/jpeg' : mime,
      upsert: false,
    })

  if (uploadError) {
    const msg = uploadError.message || ''
    if (/mime|type|not allowed/i.test(msg)) {
      throw new Error('Допустимы только PDF, JPG и PNG')
    }
    if (/size|too large|maximum/i.test(msg)) {
      throw new Error('Размер файла не должен превышать 15 МБ')
    }
    throw new Error(msg || 'Не удалось загрузить файл')
  }

  const { data, error } = await supabase
    .from('supplier_reconciliation_documents')
    .insert({
      reconciliation_id: reconciliationId,
      storage_path: path,
      file_name: file.name || 'document',
      mime_type: mime === 'image/jpg' ? 'image/jpeg' : mime,
      size_bytes: file.size,
      uploaded_by: uploadedBy ?? null,
    })
    .select(DOC_SELECT)
    .single()

  if (error) {
    await supabase.storage.from(RECONCILIATION_BUCKET).remove([path]).catch(() => {})
    throw new Error(error.message || 'Не удалось сохранить метаданные файла')
  }

  return normalizeReconciliationDocument(data)
}

/**
 * @param {{
 *   supplierId?: string|null,
 *   umagSupplierId?: number|null,
 *   supplierName: string,
 *   dateFrom: string,
 *   dateTo: string,
 *   supplierReportedBalance?: number|null,
 *   comment?: string,
 *   file?: File|null,
 *   createdBy?: number|null,
 * }} input
 */
export async function createSupplierReconciliation(input) {
  assertCloudReady()

  const {
    supplierId = null,
    platformSupplierId = null,
    umagSupplierId = null,
    supplierName,
    dateFrom,
    dateTo,
    supplierReportedBalance = null,
    comment = '',
    file = null,
    createdBy = null,
  } = input

  if (!supplierName?.trim()) throw new Error('Не указан поставщик')
  if (dateFrom > dateTo) throw new Error('Дата начала не может быть позже даты окончания')

  const canonicalId = platformSupplierId || supplierId
  const snapshot = await computeUmagSnapshotForSupplier({
    platformSupplierId: canonicalId,
    umagSupplierId,
    dateFrom,
    dateTo,
  })
  const lastRun = await fetchLastUmagSyncRun()
  const difference = computeReconciliationDifference(supplierReportedBalance, snapshot.umagDebt)
  const status = deriveReconciliationStatus(supplierReportedBalance, difference)

  const payload = {
    supplier_id: canonicalId || null,
    umag_supplier_id: umagSupplierId ?? null,
    supplier_name: supplierName.trim(),
    date_from: dateFrom,
    date_to: dateTo,
    status,
    umag_supply_count: snapshot.umagSupplyCount,
    umag_supply_amount: snapshot.umagSupplyAmount,
    umag_supply_return_count: snapshot.umagSupplyReturnCount,
    umag_supply_return_amount: snapshot.umagSupplyReturnAmount,
    umag_payment_amount: snapshot.umagPaymentAmount,
    umag_payment_refund_amount: snapshot.umagPaymentRefundAmount,
    umag_debt: snapshot.umagDebt,
    supplier_reported_balance: supplierReportedBalance == null ? null : toNumber(supplierReportedBalance),
    difference,
    comment: comment?.trim() || null,
    snapshot_synced_at: lastRun?.finished_at || lastRun?.started_at || null,
    snapshot_last_umag_sync_id: lastRun?.id || null,
    created_by: createdBy ?? null,
    updated_by: createdBy ?? null,
  }

  const { data, error } = await supabase
    .from('supplier_reconciliations')
    .insert(payload)
    .select(RECON_SELECT)
    .single()

  if (error) throw new Error(error.message || 'Не удалось сохранить сверку')

  const reconciliation = normalizeReconciliation(data)

  if (file) {
    await uploadReconciliationFile(reconciliation.id, file, createdBy)
  }

  return reconciliation
}

/**
 * Draft-only edits for balance/comment. Snapshot/period stay immutable.
 */
export async function updateDraftReconciliation(id, { supplierReportedBalance, comment, updatedBy }) {
  assertCloudReady()

  const current = await getSupplierReconciliation(id)
  if (!current) throw new Error('Сверка не найдена')
  if (current.status !== RECONCILIATION_STATUS.DRAFT) {
    throw new Error('Изменять можно только черновик. Создайте новую сверку для другого периода.')
  }

  const difference = computeReconciliationDifference(supplierReportedBalance, current.umagDebt)
  const status = deriveReconciliationStatus(supplierReportedBalance, difference)

  const { data, error } = await supabase
    .from('supplier_reconciliations')
    .update({
      supplier_reported_balance:
        supplierReportedBalance == null ? null : toNumber(supplierReportedBalance),
      difference,
      status,
      comment: comment?.trim() || null,
      updated_by: updatedBy ?? null,
    })
    .eq('id', id)
    .select(RECON_SELECT)
    .single()

  if (error) throw new Error(error.message || 'Не удалось обновить сверку')
  return normalizeReconciliation(data)
}

export async function attachReconciliationDocument(reconciliationId, file, uploadedBy) {
  assertCloudReady()
  return uploadReconciliationFile(reconciliationId, file, uploadedBy)
}

export async function resolveReconciliation(id, { resolutionNote, closedBy }) {
  assertCloudReady()
  const note = String(resolutionNote || '').trim()
  if (!note) {
    throw new Error('Укажите, как устранено расхождение')
  }

  const current = await getSupplierReconciliation(id)
  if (!current) throw new Error('Сверка не найдена')
  if (current.status === RECONCILIATION_STATUS.RESOLVED) {
    throw new Error('Сверка уже закрыта')
  }
  if (current.status === RECONCILIATION_STATUS.DRAFT) {
    throw new Error('Сначала сохраните сверку с суммой по акту поставщика')
  }

  const { data, error } = await supabase
    .from('supplier_reconciliations')
    .update({
      status: RECONCILIATION_STATUS.RESOLVED,
      resolution_note: note,
      closed_by: closedBy ?? null,
      closed_at: new Date().toISOString(),
      updated_by: closedBy ?? null,
    })
    .eq('id', id)
    .select(RECON_SELECT)
    .single()

  if (error) throw new Error(error.message || 'Не удалось закрыть расхождение')
  return normalizeReconciliation(data)
}

/**
 * Latest reconciliation status per supplier key for list badges (lightweight).
 */
export async function fetchLatestReconciliationStatuses() {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('supplier_reconciliations')
    .select('supplier_id, umag_supplier_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.warn('reconciliations_latest_fetch_failed', error.message)
    return new Map()
  }

  const map = new Map()
  for (const row of data || []) {
    const key =
      row.supplier_id ||
      (row.umag_supplier_id != null ? `umag:${row.umag_supplier_id}` : null)
    if (!key || map.has(key)) continue
    map.set(key, row.status)
    // Also index by umag external id for settlements rows that still key by umag:*
    if (row.supplier_id && row.umag_supplier_id != null) {
      const umagKey = `umag:${row.umag_supplier_id}`
      if (!map.has(umagKey)) map.set(umagKey, row.status)
    }
  }
  return map
}
