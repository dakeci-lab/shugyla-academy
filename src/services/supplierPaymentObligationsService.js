/**
 * Supplier payment obligations — native paid marks, return refund marks and
 * payment-terms snapshots. current_debt / payment amounts are updated only via umag-sync.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { fetchAllSupabaseRows } from '../utils/supabasePagination'
import {
  resolveObligationTermsPatch,
  resolveSupplierPaymentTerms,
  toAqtobeDateKey,
} from '../utils/supplierPaymentObligations'

function assertCloudReady() {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    throw new Error('Оплаты поставщикам доступны только в облачном режиме')
  }
}

function toNumber(value) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Total actually paid to suppliers per payment account (platform_payment_account_id
 * — the account chosen at the moment «Оплачено» was clicked, independent of
 * the supplier's default), across every natively-marked-paid obligation.
 * Powers «Выплачено поставщикам» on Настройки → Счета оплаты (Уровень А of
 * the ДДС discussion — a report, not a running balance: the platform has no
 * inflow tracking, so this only ever shows money going out).
 */
export async function fetchPaymentAccountPaidTotals() {
  assertCloudReady()

  const { data, error } = await fetchAllSupabaseRows(() =>
    supabase
      .from('supplier_payment_obligations')
      .select('id, platform_payment_account_id, original_supply_amount')
      .not('platform_paid_at', 'is', null)
      .order('id', { ascending: true })
  )
  if (error) throw new Error(error.message || 'Не удалось загрузить суммы по счетам оплаты')

  const totals = new Map()
  for (const row of data || []) {
    const key = row.platform_payment_account_id || null
    const amount = Math.abs(toNumber(row.original_supply_amount))
    totals.set(key, (totals.get(key) || 0) + amount)
  }
  return totals
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

  // Rows that need the same patch (typically same document date → same due
  // date) are written in one UPDATE ... WHERE id IN (...), and the groups run
  // in parallel — instead of one sequential round trip per row.
  const groups = new Map()
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

    const key = JSON.stringify(patch)
    const group = groups.get(key) || { patch, ids: [] }
    group.ids.push(row.id)
    groups.set(key, group)
  }

  const CHUNK = 100
  const writes = []
  for (const { patch, ids } of groups.values()) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      writes.push(
        supabase
          .from('supplier_payment_obligations')
          .update({ ...patch, terms_snapshot_created_at: now })
          .in('id', chunk)
          .then(({ error: updError }) => {
            if (updError) throw new Error(updError.message || 'Не удалось сохранить срок оплаты')
            return chunk.length
          })
      )
    }
  }

  const counts = await Promise.all(writes)
  return { updated: counts.reduce((sum, n) => sum + n, 0) }
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

/**
 * Mark a supplier return «Возврат получен» natively — the supplier's money for
 * it arrived. Independent of UMAG's payed_amount (closed in UMAG at entry by
 * policy) and of supply payments: returns are money IN, supplies money OUT,
 * never netted. Needs supplier_payments.manage (column-level grant + RLS).
 */
export async function markReturnRefunded(returnId, { refundedByEmployeeId, accountId } = {}) {
  assertCloudReady()
  if (!returnId) throw new Error('Возврат не указан')
  const { error } = await supabase
    .from('umag_supply_returns')
    .update({
      platform_refunded_at: new Date().toISOString(),
      platform_refunded_by: refundedByEmployeeId ?? null,
      platform_refund_account_id: accountId ?? null,
    })
    .eq('id', returnId)
  if (error) throw new Error(error.message || 'Не удалось отметить получение возврата')
}

export async function unmarkReturnRefunded(returnId) {
  assertCloudReady()
  if (!returnId) throw new Error('Возврат не указан')
  const { error } = await supabase
    .from('umag_supply_returns')
    .update({
      platform_refunded_at: null,
      platform_refunded_by: null,
      platform_refund_account_id: null,
    })
    .eq('id', returnId)
  if (error) throw new Error(error.message || 'Не удалось отменить отметку возврата')
}
