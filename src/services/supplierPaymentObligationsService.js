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
  formatPaymentAccountSnapshot,
  formatPaymentTermsDaysSnapshot,
  formatPlatformPaymentMark,
  isPlatformMarkedPaid,
  resolveObligationTermsPatch,
  resolveOwedAmount,
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
  payment_account_id_snapshot,
  deferment_days_snapshot,
  due_date,
  terms_snapshot_created_at,
  is_source_deleted,
  first_seen_at,
  last_synced_at,
  paid_at,
  platform_paid_at,
  platform_paid_by,
  platform_payment_account_id,
  created_at,
  updated_at,
  supplier:platform_suppliers!platform_supplier_id(id, name, payment_account_id, deferral_days)
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
    paymentAccountIdSnapshot: row.payment_account_id_snapshot,
    defermentDaysSnapshot:
      row.deferment_days_snapshot == null ? null : Number(row.deferment_days_snapshot),
    dueDate: row.due_date,
    termsSnapshotCreatedAt: row.terms_snapshot_created_at,
    isSourceDeleted: Boolean(row.is_source_deleted),
    firstSeenAt: row.first_seen_at,
    lastSyncedAt: row.last_synced_at,
    paidAt: row.paid_at,
    platformPaidAt: row.platform_paid_at,
    platformPaidBy: row.platform_paid_by,
    platformPaymentAccountId: row.platform_payment_account_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supplierName: supplierJoin?.name || 'Без названия',
    supplierPaymentAccountId: supplierJoin?.payment_account_id || null,
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
      // Not current_debt — UMAG's debt is no longer trusted (staff zero it out
      // in UMAG immediately at receiving time). Unpaid = not natively marked.
      query = query.is('platform_paid_at', null)
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
 * Keep every still-open (not natively marked paid, not source-deleted)
 * obligation of this supplier in sync with its CURRENT payment terms — called
 * right after the supplier form saves. Previously this only filled
 * obligations whose due_date was still NULL and left already-snapshotted ones
 * stale forever (see docs/suppliers/retroactive-payment-terms.md): a receipt
 * synced under old terms kept its original due date even after the
 * supplier's terms were edited, with no way in the UI to fix it short of a
 * manual DB update.
 *
 * Platform-marked-paid and source-deleted rows are never touched — they're
 * historical record, not schedule.
 */
export async function refreshObligationTermsForSupplier(platformSupplierId, supplier) {
  assertCloudReady()
  if (!platformSupplierId) return { updated: 0 }

  const terms = resolveSupplierPaymentTerms(supplier)

  const { data: rows, error } = await supabase
    .from('supplier_payment_obligations')
    .select(
      'id, supply_document_date, source_doc_time, due_date, payment_account_id_snapshot, deferment_days_snapshot'
    )
    .eq('platform_supplier_id', platformSupplierId)
    .eq('is_source_deleted', false)
    .is('platform_paid_at', null)

  if (error) throw new Error(error.message || 'Не удалось обновить сроки оплаты')

  const now = new Date().toISOString()
  let updated = 0
  for (const row of rows || []) {
    const docDate =
      row.supply_document_date ||
      (row.source_doc_time ? toAqtobeDateKey(new Date(row.source_doc_time)) : null)

    const patch = resolveObligationTermsPatch(
      {
        paymentAccountIdSnapshot: row.payment_account_id_snapshot,
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

/**
 * Mark an obligation paid natively — instant, no UMAG round trip. Once set,
 * it stays "Оплачено" regardless of what the next UMAG sync writes to
 * current_debt (see deriveObligationStatus/isPlatformMarkedPaid); only
 * unmarkObligationPaid clears it.
 *
 * Also writes the matching entry to platform_supplier_ledger_events
 * (external_source='platform') so «Взаиморасчёты» reflects this click as the
 * payment moment instead of UMAG's own (now untrustworthy, see
 * rebuildLedgerEventsForPeriod) document-payment timestamp.
 */
export async function markObligationPaid(obligation, { paidByEmployeeId, accountId, employeeName, accountName } = {}) {
  assertCloudReady()
  const obligationId = obligation?.id
  if (!obligationId) throw new Error('Обязательство не указано')
  const paidAt = new Date().toISOString()
  const { error } = await supabase
    .from('supplier_payment_obligations')
    .update({
      platform_paid_at: paidAt,
      platform_paid_by: paidByEmployeeId ?? null,
      platform_payment_account_id: accountId ?? null,
    })
    .eq('id', obligationId)
  if (error) throw new Error(error.message || 'Не удалось отметить оплату')

  const amount = Math.abs(Number(obligation?.originalSupplyAmount ?? 0)) || 0
  const { error: ledgerError } = await supabase
    .from('platform_supplier_ledger_events')
    .upsert(
      {
        platform_supplier_id: obligation?.platformSupplierId ?? null,
        umag_supplier_id: null,
        supplier_name: obligation?.supplierName ?? null,
        external_source: 'platform',
        external_id: String(obligationId),
        event_type: 'supplier_payment',
        occurred_at: paidAt,
        document_number: null,
        amount,
        balance_delta: -amount,
        currency: 'KZT',
        status: 'posted',
        linked_umag_supply_id: obligation?.umagSupplyId ?? null,
        linked_umag_return_id: null,
        linked_umag_payment_id: null,
        details: [employeeName, accountName].filter(Boolean).join(' · ') || null,
        metadata: {},
        synced_at: paidAt,
      },
      { onConflict: 'external_source,event_type,external_id' }
    )
  if (ledgerError) {
    throw new Error(ledgerError.message || 'Не удалось записать операцию во взаиморасчёты')
  }
}

export async function unmarkObligationPaid(obligationId) {
  assertCloudReady()
  if (!obligationId) throw new Error('Обязательство не указано')
  const { error } = await supabase
    .from('supplier_payment_obligations')
    .update({
      platform_paid_at: null,
      platform_paid_by: null,
      platform_payment_account_id: null,
    })
    .eq('id', obligationId)
  if (error) throw new Error(error.message || 'Не удалось отменить отметку оплаты')

  const { error: deleteError } = await supabase
    .from('platform_supplier_ledger_events')
    .delete()
    .eq('external_source', 'platform')
    .eq('event_type', 'supplier_payment')
    .eq('external_id', String(obligationId))
  if (deleteError) {
    throw new Error(deleteError.message || 'Не удалось удалить запись из взаиморасчётов')
  }
}

export {
  buildPaymentScheduleView,
  buildSupplierPaymentSummary,
  deriveObligationStatus,
  formatDaysUntilDue,
  formatPaymentAccountSnapshot,
  formatPaymentTermsDaysSnapshot,
  formatPlatformPaymentMark,
  formatUmagDate,
  formatUmagDateTime,
  formatUmagMoney,
  isPlatformMarkedPaid,
  resolveOwedAmount,
  resolveSupplierPaymentTerms,
  toAqtobeDateKey,
}
