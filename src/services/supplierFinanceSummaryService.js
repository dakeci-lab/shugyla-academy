/**
 * Единый Financial Summary для будущего раздела «Расчёты» (Этап 2.4).
 *
 * One canonical read for the global KPIs a future shared header AND
 * PaymentScheduleTab both need — debt/overdue/dueToday/upcoming/termsMissing
 * come from the SAME obligations read + buildPaymentScheduleView() pass
 * "Оплаты поставщикам" already uses (one todayKey, one obligations set), so
 * this is not a fourth independent formula — see fetchSupplierFinanceSummary().
 *
 * No supplier-level breakdown here (Этап 2.4 scope) — PaymentScheduleTab
 * keeps reading listPaymentObligations()/buildPaymentScheduleView() directly
 * for its per-supplier lists, unchanged.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { fetchAllSupabaseRows } from '../utils/supabasePagination'
import { isUmagPaymentRefund } from '../utils/supplierLedger'
import { buildPaymentScheduleView, toAqtobeDateKey } from '../utils/supplierPaymentObligations'
import { addDaysToDateKey, getMonthRangeKeys } from '../utils/settlementsPeriod'
import { fetchLastUmagSyncRun } from './umagSettlementsService'
import { listPaymentObligations } from './supplierPaymentObligationsService'

function assertCloudReady() {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    throw new Error('Финансовая сводка доступна только в облачном режиме')
  }
}

function toNumber(value) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * SUM(umag_document_payments.amount) for real supplier payments — payments
 * classified as a refund by isUmagPaymentRefund() are excluded, never counted
 * as money paid out. Filtered strictly by payment_time (when money actually
 * moved), independent of the linked приёмка's own doc_time — a June receiving
 * paid in August counts in August's total, per the canonical rule.
 *
 * Deliberately has NO fallback to umag_supplies.payment_amount: if this
 * query fails, the caller gets an explicit unavailable state, never a
 * silent 0 dressed up as a confirmed "оплачено" figure.
 */
async function fetchPaidThisMonth(todayKey) {
  const [year, month] = todayKey.split('-').map(Number)
  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const { dateFrom: monthStart, dateTo: lastDayOfMonth } = getMonthRangeKeys(year, month)
  const nextMonthStart = addDaysToDateKey(lastDayOfMonth, 1)

  // Half-open range on a timestamptz column — safer than a `<= ...23:59:59.999`
  // upper bound, which can miss a payment_time with finer-than-millisecond
  // fractional seconds. Asia/Aqtobe has no DST, so the fixed +05:00 offset
  // (already used for this exact column elsewhere) stays correct year-round.
  const fromIso = `${monthStart}T00:00:00+05:00`
  const toIso = `${nextMonthStart}T00:00:00+05:00`

  if (!isSupabaseConfigured() || !supabase) {
    return {
      amount: null,
      monthKey,
      status: 'unavailable',
      error: 'Supabase не настроен.',
    }
  }

  const { data, error } = await fetchAllSupabaseRows(() =>
    supabase
      .from('umag_document_payments')
      .select('id, amount, payment_type, class_name')
      .eq('is_source_deleted', false)
      .gte('payment_time', fromIso)
      .lt('payment_time', toIso)
      .order('payment_time', { ascending: true })
      .order('id', { ascending: true })
  )

  if (error) {
    return {
      amount: null,
      monthKey,
      status: 'unavailable',
      error: error.message || 'Не удалось загрузить оплаты поставщикам за месяц',
    }
  }

  return { amount: sumNonRefundPaymentAmount(data), monthKey, status: 'ok', error: null }
}

/**
 * Pure: SUM(amount) over raw umag_document_payments rows, excluding refunds
 * (isUmagPaymentRefund) — split out from fetchPaidThisMonth so it's directly
 * testable without a live Supabase connection.
 */
export function sumNonRefundPaymentAmount(rows) {
  return (rows || [])
    .filter((row) => !isUmagPaymentRefund(row))
    .reduce((sum, row) => sum + toNumber(row.amount), 0)
}

/**
 * Global financial summary.
 *
 * @returns {Promise<{
 *   todayKey: string,
 *   debt: number,
 *   overdue: {amount: number, count: number},
 *   dueToday: {amount: number, count: number},
 *   upcoming: {amount: number, count: number},
 *   termsMissing: {amount: number, count: number},
 *   openObligationsCount: number,
 *   paidThisMonth: {amount: number|null, monthKey: string, status: 'ok'|'unavailable', error: string|null},
 *   lastSync: object|null,
 * }>}
 *
 * debt = overdue.amount + dueToday.amount + upcoming.amount + termsMissing.amount
 * by construction — see buildPaymentScheduleView() in utils/supplierPaymentObligations.js.
 * `count` in every bucket = number of individual obligations (accounting
 * rows), not number of suppliers — matches "Оплаты поставщикам"'s existing
 * tab counters.
 *
 * Error semantics: obligations are load-bearing — a failure there rejects
 * this whole call, same as fetchSupplierPaymentsDashboard() already does
 * today (nothing new invented). paidThisMonth is a narrower, independent
 * metric — its own failure degrades only paidThisMonth (status:'unavailable',
 * amount:null) while debt/overdue/etc. remain valid. lastSync never throws
 * (fetchLastUmagSyncRun() already returns null on error) and preserves the
 * original success/partial/failed/running status verbatim — never
 * normalized to success.
 */
function buildFinanceSummaryFromParts(obligations, todayKey, paidThisMonth, lastRun) {
  const view = buildPaymentScheduleView(obligations, todayKey)

  return {
    todayKey,
    debt: view.summaries.totalActiveDebt,
    overdue: { amount: view.summaries.overdue, count: view.tabCounts.overdue },
    dueToday: { amount: view.summaries.dueToday, count: view.tabCounts.today },
    upcoming: { amount: view.summaries.deferredNotYetDue, count: view.tabCounts.upcoming },
    termsMissing: { amount: view.summaries.termsMissing, count: view.tabCounts.termsMissing },
    openObligationsCount: view.activeCount,
    paidThisMonth,
    lastSync: lastRun,
  }
}

async function loadFinanceSummaryData({ obligations: obligationsInput } = {}) {
  const todayKey = toAqtobeDateKey()

  const [obligations, lastRun, paidThisMonth] = await Promise.all([
    obligationsInput != null
      ? Promise.resolve(obligationsInput)
      : listPaymentObligations({ includePaid: false }),
    fetchLastUmagSyncRun(),
    fetchPaidThisMonth(todayKey),
  ])

  return {
    obligations,
    todayKey,
    lastRun,
    paidThisMonth,
    view: buildPaymentScheduleView(obligations, todayKey),
  }
}

export async function fetchSupplierFinanceSummary({ obligations: obligationsInput } = {}) {
  assertCloudReady()

  const { obligations, todayKey, lastRun, paidThisMonth } = await loadFinanceSummaryData({
    obligations: obligationsInput,
  })

  return buildFinanceSummaryFromParts(obligations, todayKey, paidThisMonth, lastRun)
}

/**
 * One bulk read for the unified «Расчёты» shell: obligations feed both KPI
 * summary and the embedded payment list without a second listPaymentObligations().
 */
export async function fetchSupplierFinancePageData() {
  assertCloudReady()

  const { obligations, todayKey, lastRun, paidThisMonth, view } = await loadFinanceSummaryData()

  return {
    summary: buildFinanceSummaryFromParts(obligations, todayKey, paidThisMonth, lastRun),
    obligations,
    view,
  }
}
