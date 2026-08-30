/**
 * Supplier payment obligations — read schedule + first-fill missing snapshots.
 * current_debt / payment amounts are updated only via umag-sync.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { fetchAllSupabaseRows } from '../utils/supabasePagination'
import {
  fetchLastUmagSyncRun,
  formatUmagDate,
  formatUmagDateTime,
  formatUmagMoney,
  syncUmagSettlements,
} from './umagSettlementsService'
import {
  buildPaymentScheduleView,
  buildSupplierPaymentSummary,
  deriveObligationStatus,
  describeObligationsSyncResult,
  formatDaysUntilDue,
  formatPaymentTermsSnapshot,
  resolveObligationTermsPatch,
  resolveSupplierPaymentTerms,
  toAqtobeDateKey,
} from '../utils/supplierPaymentObligations'

const OBLIGATION_SELECT = `
  id,
  platform_supplier_id,
  umag_supply_id,
  umag_supply_row_id,
  supply_document_date,
  source_doc_time,
  original_supply_amount,
  current_payment_amount,
  current_debt,
  payment_terms_type_snapshot,
  deferment_days_snapshot,
  due_date,
  terms_snapshot_created_at,
  is_source_deleted,
  first_seen_at,
  last_synced_at,
  paid_at,
  created_at,
  updated_at,
  supplier:platform_suppliers!platform_supplier_id(id, name, payment_type, deferral_days)
`

function assertCloudReady() {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    throw new Error('Оплаты поставщикам доступны только в облачном режиме')
  }
}

function toNumber(value) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function normalizeObligation(row) {
  if (!row) return null
  const supplierJoin = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier
  return {
    id: row.id,
    platformSupplierId: row.platform_supplier_id,
    umagSupplyId: row.umag_supply_id,
    umagSupplyRowId: row.umag_supply_row_id,
    supplyDocumentDate: row.supply_document_date,
    sourceDocTime: row.source_doc_time,
    originalSupplyAmount: toNumber(row.original_supply_amount),
    currentPaymentAmount: toNumber(row.current_payment_amount),
    currentDebt: toNumber(row.current_debt),
    paymentTermsTypeSnapshot: row.payment_terms_type_snapshot,
    defermentDaysSnapshot:
      row.deferment_days_snapshot == null ? null : Number(row.deferment_days_snapshot),
    dueDate: row.due_date,
    termsSnapshotCreatedAt: row.terms_snapshot_created_at,
    isSourceDeleted: Boolean(row.is_source_deleted),
    firstSeenAt: row.first_seen_at,
    lastSyncedAt: row.last_synced_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supplierName: supplierJoin?.name || 'Без названия',
    supplierPaymentType: supplierJoin?.payment_type || null,
    supplierDeferralDays:
      supplierJoin?.deferral_days == null ? null : Number(supplierJoin.deferral_days),
  }
}

export async function listPaymentObligations({ includePaid = false } = {}) {
  assertCloudReady()

  const { data, error } = await fetchAllSupabaseRows(() => {
    let query = supabase
      .from('supplier_payment_obligations')
      .select(OBLIGATION_SELECT)
      .eq('is_source_deleted', false)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })

    if (!includePaid) {
      query = query.gt('current_debt', 0)
    }

    return query
  })

  if (error) throw new Error(error.message || 'Не удалось загрузить обязательства оплаты')
  return (data || []).map(normalizeObligation).filter(Boolean)
}

export async function listPaymentObligationsForSupplier(platformSupplierId) {
  assertCloudReady()
  if (!platformSupplierId) return []
  const { data, error } = await supabase
    .from('supplier_payment_obligations')
    .select(OBLIGATION_SELECT)
    .eq('platform_supplier_id', platformSupplierId)
    .eq('is_source_deleted', false)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message || 'Не удалось загрузить оплаты поставщика')
  return (data || []).map(normalizeObligation).filter(Boolean)
}

export async function fetchSupplierPaymentsDashboard() {
  const [obligations, lastRun] = await Promise.all([
    listPaymentObligations({ includePaid: false }),
    fetchLastUmagSyncRun(),
  ])
  const todayKey = toAqtobeDateKey()
  const view = buildPaymentScheduleView(obligations, todayKey)
  return {
    obligations,
    view,
    todayKey,
    lastRun,
    error: null,
  }
}

/**
 * Keep every still-open (current_debt > 0, not source-deleted) obligation of
 * this supplier in sync with its CURRENT payment terms — called right after
 * the supplier form saves. Previously this only filled obligations whose
 * due_date was still NULL and left already-snapshotted ones stale forever
 * (see docs/suppliers/retroactive-payment-terms.md): a receipt synced under
 * old terms kept its original due date even after the supplier's terms were
 * edited, with no way in the UI to fix it short of a manual DB update.
 *
 * Paid/closed obligations (current_debt <= 0) and source-deleted rows are
 * never touched — they're historical record, not schedule.
 */
export async function refreshObligationTermsForSupplier(platformSupplierId, supplier) {
  assertCloudReady()
  if (!platformSupplierId) return { updated: 0 }

  const terms = resolveSupplierPaymentTerms(supplier)

  const { data: rows, error } = await supabase
    .from('supplier_payment_obligations')
    .select(
      'id, supply_document_date, source_doc_time, due_date, payment_terms_type_snapshot, deferment_days_snapshot'
    )
    .eq('platform_supplier_id', platformSupplierId)
    .eq('is_source_deleted', false)
    .gt('current_debt', 0)

  if (error) throw new Error(error.message || 'Не удалось обновить сроки оплаты')

  const now = new Date().toISOString()
  let updated = 0
  for (const row of rows || []) {
    const docDate =
      row.supply_document_date ||
      (row.source_doc_time ? toAqtobeDateKey(new Date(row.source_doc_time)) : null)

    const patch = resolveObligationTermsPatch(
      {
        paymentTermsTypeSnapshot: row.payment_terms_type_snapshot,
        defermentDaysSnapshot: row.deferment_days_snapshot,
        dueDate: row.due_date,
      },
      terms,
      docDate
    )
    if (!patch) continue

    const { error: updError } = await supabase
      .from('supplier_payment_obligations')
      .update({ ...patch, terms_snapshot_created_at: now })
      .eq('id', row.id)
    if (updError) throw new Error(updError.message || 'Не удалось сохранить срок оплаты')
    updated += 1
  }
  return { updated }
}

export async function syncUmagForPayments({ dateFrom, dateTo }) {
  return syncUmagSettlements({ dateFrom, dateTo, syncSuppliers: true })
}

export {
  buildPaymentScheduleView,
  buildSupplierPaymentSummary,
  deriveObligationStatus,
  formatDaysUntilDue,
  formatPaymentTermsSnapshot,
  formatUmagDate,
  formatUmagDateTime,
  formatUmagMoney,
  resolveSupplierPaymentTerms,
  toAqtobeDateKey,
}
