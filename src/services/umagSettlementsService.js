/**
 * UMAG settlements stage-1: read mirrored supplies/suppliers + invoke umag-sync.
 * No UMAG secrets on the client.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import {
  extractFunctionErrorBody,
  isGenericInvokeErrorMessage,
  resolveEdgeFunctionUserMessage,
} from '../utils/edgeFunctionErrors'
import {
  LEDGER_EVENT_TYPES,
  attachRunningBalances,
  isUmagPaymentRefund,
  ledgerEventLabel,
  ledgerEventStatusLabel,
  sortLedgerNewestFirst,
} from '../utils/supplierLedger'
import { fetchAllSupabaseRows } from '../utils/supabasePagination'
import { buildNativeSettlementPaymentRows } from '../utils/supplierPaymentObligations'
import { ensurePaymentAccountsLoaded, getPaymentAccountName } from './paymentAccountsService'

export const UMAG_SETTLEMENTS_ERROR_CODES = {
  VALIDATION: 'VALIDATION_ERROR',
  UMAG_AUTH: 'UMAG_AUTH_FAILED',
  UMAG_NETWORK: 'UMAG_NETWORK_ERROR',
  UMAG_NOT_CONFIGURED: 'UMAG_NOT_CONFIGURED',
  UMAG_TIMEOUT: 'UMAG_TIMEOUT',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  PARTIAL: 'PARTIAL_SYNC',
  // Этап 2.3 backend contract (409) — recognized explicitly here (Этап 2.7)
  // so callers can treat it as a compact business conflict, not a scary
  // "unknown error". body.message from the Edge Function was already
  // surfaced correctly before this addition (resolveEdgeFunctionUserMessage
  // prefers a Cyrillic body.message) — this only adds a distinguishable code.
  SYNC_ALREADY_RUNNING: 'SYNC_ALREADY_RUNNING',
  UNKNOWN: 'UNKNOWN',
}

const USER_MESSAGES = {
  [UMAG_SETTLEMENTS_ERROR_CODES.VALIDATION]: 'Укажите корректный период синхронизации.',
  [UMAG_SETTLEMENTS_ERROR_CODES.UMAG_AUTH]:
    'Не удалось войти в UMAG. Проверьте логин и пароль интеграции.',
  [UMAG_SETTLEMENTS_ERROR_CODES.UMAG_NETWORK]:
    'Не удалось получить данные из UMAG. Повторите попытку.',
  [UMAG_SETTLEMENTS_ERROR_CODES.UMAG_NOT_CONFIGURED]:
    'Подключение к UMAG ещё не настроено. Установите секреты Edge Function.',
  [UMAG_SETTLEMENTS_ERROR_CODES.UMAG_TIMEOUT]:
    'Превышено время ожидания ответа UMAG. Повторите попытку.',
  [UMAG_SETTLEMENTS_ERROR_CODES.FORBIDDEN]:
    'Недостаточно прав для синхронизации с UMAG.',
  [UMAG_SETTLEMENTS_ERROR_CODES.UNAUTHORIZED]: 'Сессия истекла. Войдите снова.',
  [UMAG_SETTLEMENTS_ERROR_CODES.PARTIAL]:
    'Синхронизация завершилась с расхождением агрегатов. Проверьте журнал.',
  [UMAG_SETTLEMENTS_ERROR_CODES.SYNC_ALREADY_RUNNING]:
    'Синхронизация UMAG уже выполняется. Дождитесь её завершения.',
  [UMAG_SETTLEMENTS_ERROR_CODES.UNKNOWN]:
    'Не удалось выполнить синхронизацию UMAG. Повторите попытку.',
}

export function formatUmagMoney(value) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${n.toLocaleString('ru-KZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₸`
}

export function formatUmagDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-KZ', {
    timeZone: 'Asia/Aqtobe',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatUmagDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-KZ', {
    timeZone: 'Asia/Aqtobe',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Local calendar YYYY-MM-DD in Asia/Aqtobe wall clock via offset format. */
export function toAqtobeDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Aqtobe',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

export function getMonthPeriodKeys(reference = new Date()) {
  const key = toAqtobeDateKey(reference)
  const [y, m] = key.split('-').map(Number)
  const dateFrom = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const dateTo = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { dateFrom, dateTo }
}

export function getPreviousMonthPeriodKeys(reference = new Date()) {
  const key = toAqtobeDateKey(reference)
  const [y, m] = key.split('-').map(Number)
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
  const dateFrom = `${prev.y}-${String(prev.m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(prev.y, prev.m, 0)).getUTCDate()
  const dateTo = `${prev.y}-${String(prev.m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { dateFrom, dateTo }
}

function mapErrorCode(code) {
  const normalized = String(code || '').toUpperCase()
  if (normalized === 'UMAG_NOT_CONFIGURED') return UMAG_SETTLEMENTS_ERROR_CODES.UMAG_NOT_CONFIGURED
  if (
    normalized === 'UMAG_AUTH_FAILED' ||
    normalized === 'UMAG_UNAUTHORIZED' ||
    normalized === 'UNAUTHORIZED_UMAG'
  ) {
    return UMAG_SETTLEMENTS_ERROR_CODES.UMAG_AUTH
  }
  if (normalized === 'UMAG_TIMEOUT') return UMAG_SETTLEMENTS_ERROR_CODES.UMAG_TIMEOUT
  if (normalized === 'VALIDATION_ERROR' || normalized === 'VALIDATION') {
    return UMAG_SETTLEMENTS_ERROR_CODES.VALIDATION
  }
  if (normalized === 'SYNC_ALREADY_RUNNING') {
    return UMAG_SETTLEMENTS_ERROR_CODES.SYNC_ALREADY_RUNNING
  }
  if (normalized === 'FORBIDDEN') return UMAG_SETTLEMENTS_ERROR_CODES.FORBIDDEN
  if (normalized === 'UNAUTHORIZED') return UMAG_SETTLEMENTS_ERROR_CODES.UNAUTHORIZED
  if (
    normalized === 'UMAG_NETWORK_ERROR' ||
    normalized === 'UMAG_UPSTREAM_ERROR' ||
    normalized === 'UMAG_REQUEST_FAILED' ||
    normalized === 'UMAG_INVALID_JSON' ||
    normalized === 'UMAG_PAGINATION_FAILED' ||
    normalized === 'SUPABASE_UPSERT_FAILED' ||
    normalized === 'INTERNAL_ERROR'
  ) {
    return UMAG_SETTLEMENTS_ERROR_CODES.UMAG_NETWORK
  }
  return UMAG_SETTLEMENTS_ERROR_CODES.UNKNOWN
}

function fail(code, message) {
  return {
    success: false,
    code,
    message: message || USER_MESSAGES[code] || USER_MESSAGES[UMAG_SETTLEMENTS_ERROR_CODES.UNKNOWN],
  }
}

function toNumber(value) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Client-side ceiling on the umag-sync request itself: the backend has no
 * wall-clock guarantee, and a plain browser fetch never times out on its
 * own. Comfortably below STALE_SYNC_THRESHOLD_MINUTES (5 min, see
 * supabase/functions/_shared/umagConfig.ts) so a stalled request fails with
 * a clear message instead of leaving the sync button spinning forever.
 */
const UMAG_SYNC_CLIENT_TIMEOUT_MS = 120_000

/**
 * Invoke umag-sync and normalize transport / Edge errors into user messages.
 * Returns either `{ data }` on success or `{ failure }` ready to be surfaced.
 */
async function invokeUmagSync(requestBody) {
  if (!isSupabaseConfigured() || !supabase) {
    return { failure: fail(UMAG_SETTLEMENTS_ERROR_CODES.UNKNOWN, 'Supabase не настроен.') }
  }

  try {
    const { data, error } = await supabase.functions.invoke('umag-sync', {
      body: requestBody,
      timeout: UMAG_SYNC_CLIENT_TIMEOUT_MS,
    })

    if (error) {
      if (error.context?.name === 'AbortError') {
        return { failure: fail(UMAG_SETTLEMENTS_ERROR_CODES.UMAG_TIMEOUT) }
      }
      const body = await extractFunctionErrorBody(error)
      if (body && typeof body === 'object') {
        if (body.success === false || body.ok === false) {
          const code = mapErrorCode(body.code)
          const message = resolveEdgeFunctionUserMessage({
            error,
            body,
            fallback: USER_MESSAGES[code] || USER_MESSAGES[UMAG_SETTLEMENTS_ERROR_CODES.UNKNOWN],
          })
          return { failure: fail(code, message) }
        }
      }
      const msg = error.message || ''
      if (!isGenericInvokeErrorMessage(msg) && /unauthorized|jwt|session/i.test(msg)) {
        return { failure: fail(UMAG_SETTLEMENTS_ERROR_CODES.UNAUTHORIZED) }
      }
      if (/forbidden/i.test(msg)) {
        return { failure: fail(UMAG_SETTLEMENTS_ERROR_CODES.FORBIDDEN) }
      }
      return {
        failure: fail(
          UMAG_SETTLEMENTS_ERROR_CODES.UMAG_NETWORK,
          resolveEdgeFunctionUserMessage({
            error,
            body,
            fallback: USER_MESSAGES[UMAG_SETTLEMENTS_ERROR_CODES.UMAG_NETWORK],
          })
        ),
      }
    }

    if (data?.success === true) return { data }

    if (data?.success === false) {
      const code = mapErrorCode(data.code)
      return { failure: fail(code, data.message || USER_MESSAGES[code]) }
    }

    return { failure: fail(UMAG_SETTLEMENTS_ERROR_CODES.UMAG_NETWORK) }
  } catch {
    return { failure: fail(UMAG_SETTLEMENTS_ERROR_CODES.UMAG_NETWORK) }
  }
}

/**
 * @param {{ dateFrom: string, dateTo: string, syncSuppliers?: boolean }} params
 */
export async function syncUmagSettlements({ dateFrom, dateTo, syncSuppliers = true }) {
  if (!isSupabaseConfigured() || !supabase) {
    return fail(UMAG_SETTLEMENTS_ERROR_CODES.UNKNOWN, 'Supabase не настроен.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return fail(UMAG_SETTLEMENTS_ERROR_CODES.VALIDATION)
  }

  const { data, failure } = await invokeUmagSync({
    action: 'sync',
    dateFrom,
    dateTo,
    syncSuppliers,
  })
  if (failure) return failure

  const paymentObligations = data.paymentObligations || null
  const failedObligations = Number(paymentObligations?.obligations_failed || 0)
  let message = 'Синхронизация с UMAG выполнена.'
  if (data.status === 'partial') {
    if (failedObligations > 0) {
      message = `Данные UMAG обновлены, календарь оплат обновлён не полностью: ${failedObligations}`
    } else {
      message = USER_MESSAGES[UMAG_SETTLEMENTS_ERROR_CODES.PARTIAL]
    }
  } else if (paymentObligations?.status === 'success') {
    message = 'Синхронизация с UMAG выполнена. Календарь оплат обновлён.'
  }
  return {
    success: true,
    status: data.status || 'success',
    warning: data.warning || null,
    period: data.period,
    suppliers: data.suppliers,
    supplies: data.supplies,
    returns: data.returns,
    paymentObligations,
    aggregates: data.aggregates,
    syncRunId: data.syncRunId,
    message,
  }
}

/**
 * Sync every month that still holds open debt.
 *
 * No dates are sent: the Edge Function derives the months from open
 * obligations, because a receipt paid in a later month can only be corrected by
 * re-reading its own document month from UMAG.
 */
export async function syncUmagOpenObligations() {
  if (!isSupabaseConfigured() || !supabase) {
    return fail(UMAG_SETTLEMENTS_ERROR_CODES.UNKNOWN, 'Supabase не настроен.')
  }

  const { data, failure } = await invokeUmagSync({ action: 'sync_open_obligations' })
  if (failure) return failure

  const months = data.months || {}
  return {
    success: true,
    status: data.status || 'success',
    warning: data.warning || null,
    period: data.period || null,
    months: {
      planned: months.planned || [],
      processed: months.processed || [],
      remaining: months.remaining || [],
      skippedOlder: months.skippedOlder || [],
    },
    supplies: data.supplies || null,
    paymentObligations: data.paymentObligations || null,
    syncRunId: data.syncRunId || null,
  }
}

export async function fetchLastUmagSyncRun() {
  if (!isSupabaseConfigured() || !supabase) return null
  const { data, error } = await supabase
    .from('umag_sync_runs')
    .select(
      'id, entity, date_from, date_to, started_at, finished_at, status, records_received, records_created, records_updated, source_total_count, source_amount, source_payment_amount, source_payment_refund_amount, source_debt, calculated_amount, calculated_payment_amount, calculated_debt, aggregates_match, warning_message, error_message'
    )
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('umag_sync_runs_fetch_failed', error.message)
    return null
  }
  return data
}

export function formatSignedUmagMoney(value) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  const absLabel = formatUmagMoney(Math.abs(n)).replace(' ₸', '')
  if (n > 0) return `+${absLabel} ₸`
  if (n < 0) return `−${absLabel} ₸`
  return `${absLabel} ₸`
}

/** Money comparison epsilon (₸) for payment status derivation. */
export const SUPPLY_PAYMENT_EPSILON = 0.01

export const SUPPLY_PAYMENT_STATUS = {
  PAID: 'paid',
  PARTIAL: 'partial',
  UNPAID: 'unpaid',
}

export const SUPPLY_PAYMENT_STATUS_LABELS = {
  [SUPPLY_PAYMENT_STATUS.PAID]: 'Оплачено',
  [SUPPLY_PAYMENT_STATUS.PARTIAL]: 'Частично оплачено',
  [SUPPLY_PAYMENT_STATUS.UNPAID]: 'Не оплачено',
}

/**
 * Derive supply payment status from UMAG mirrored fields.
 * debt is the source of truth for remaining balance.
 */
export function deriveSupplyPaymentStatus(paymentAmount, debt) {
  const paid = toNumber(paymentAmount)
  const remaining = toNumber(debt)
  if (remaining <= SUPPLY_PAYMENT_EPSILON) return SUPPLY_PAYMENT_STATUS.PAID
  if (paid > SUPPLY_PAYMENT_EPSILON) return SUPPLY_PAYMENT_STATUS.PARTIAL
  return SUPPLY_PAYMENT_STATUS.UNPAID
}

export function supplyPaymentStatusLabel(status) {
  return SUPPLY_PAYMENT_STATUS_LABELS[status] || '—'
}

/**
 * Build unified chronological operations for one supplier (newest first).
 * Includes supplies, returns, and UMAG document-payments with running balance.
 */
export function buildSupplierOperationHistory(
  supplies = [],
  returns = [],
  payments = [],
  openingBalance = 0
) {
  const ops = []

  for (const supply of supplies) {
    const amount = toNumber(supply.amount)
    const paymentAmount = toNumber(supply.payment_amount)
    const debt = toNumber(supply.debt)
    ops.push({
      id: `supply:${supply.id || supply.umag_supply_id}`,
      kind: 'supply',
      eventType: LEDGER_EVENT_TYPES.RECEIVING,
      label: ledgerEventLabel(LEDGER_EVENT_TYPES.RECEIVING),
      sortAt: supply.doc_time,
      occurredAt: supply.doc_time,
      amount,
      paymentAmount,
      debt,
      paymentStatus: deriveSupplyPaymentStatus(paymentAmount, debt),
      balanceDelta: amount,
      documentNumber: String(supply.umag_supply_id || supply.id || ''),
      statusLabel: ledgerEventStatusLabel(LEDGER_EVENT_TYPES.RECEIVING, 'posted'),
      signedAmount: amount,
      source: supply,
    })
  }

  for (const ret of returns) {
    const abs = Math.abs(toNumber(ret.amount))
    ops.push({
      id: `return:${ret.id || ret.umag_return_id}`,
      kind: 'return',
      eventType: LEDGER_EVENT_TYPES.SUPPLIER_RETURN,
      label: ledgerEventLabel(LEDGER_EVENT_TYPES.SUPPLIER_RETURN),
      sortAt: ret.document_time,
      occurredAt: ret.document_time,
      amount: abs,
      paymentAmount: null,
      debt: null,
      paymentStatus: null,
      balanceDelta: -abs,
      documentNumber: String(ret.umag_return_id || ret.id || ''),
      statusLabel: ledgerEventStatusLabel(LEDGER_EVENT_TYPES.SUPPLIER_RETURN, 'posted'),
      signedAmount: -abs,
      source: ret,
    })
  }

  for (const payment of payments) {
    const signed = toNumber(payment.amount)
    const abs = Math.abs(signed)
    const isRefund = isUmagPaymentRefund(payment)
    const eventType = isRefund
      ? LEDGER_EVENT_TYPES.SUPPLIER_REFUND
      : LEDGER_EVENT_TYPES.SUPPLIER_PAYMENT
    ops.push({
      id: `payment:${payment.id || payment.umag_payment_id}`,
      kind: isRefund ? 'refund' : 'payment',
      eventType,
      label: ledgerEventLabel(eventType),
      sortAt: payment.payment_time,
      occurredAt: payment.payment_time,
      amount: abs,
      paymentAmount: abs,
      debt: null,
      paymentStatus: null,
      balanceDelta: isRefund ? 0 : -abs,
      // umag_payment_id is the only real document number here — payment.id
      // is an internal row id (a synthetic "platform-paid:<uuid>" for native
      // marks) that must never be shown to the user as a document number.
      documentNumber: payment.umag_payment_id != null ? String(payment.umag_payment_id) : null,
      statusLabel: ledgerEventStatusLabel(eventType, 'posted'),
      signedAmount: isRefund ? abs : -abs,
      details: [payment.user_name, payment.account_name, payment.note]
        .filter(Boolean)
        .join(' · '),
      source: payment,
    })
  }

  const { eventsAsc, closingBalance } = attachRunningBalances(ops, openingBalance)
  const newestFirst = sortLedgerNewestFirst(eventsAsc)
  return { operations: newestFirst, closingBalance, openingBalance }
}

export function filterSupplierOperations(operations, filter = 'all') {
  if (filter === 'supplies') {
    return operations.filter(
      (op) => op.kind === 'supply' || op.eventType === LEDGER_EVENT_TYPES.RECEIVING
    )
  }
  if (filter === 'returns') {
    return operations.filter(
      (op) =>
        op.kind === 'return' ||
        op.kind === 'refund' ||
        op.eventType === LEDGER_EVENT_TYPES.SUPPLIER_RETURN ||
        op.eventType === LEDGER_EVENT_TYPES.SUPPLIER_REFUND
    )
  }
  if (filter === 'payments') {
    return operations.filter(
      (op) =>
        op.kind === 'payment' ||
        op.kind === 'refund' ||
        op.eventType === LEDGER_EVENT_TYPES.SUPPLIER_PAYMENT ||
        op.eventType === LEDGER_EVENT_TYPES.SUPPLIER_REFUND
    )
  }
  return operations
}

/**
 * Full operation history (individual receiving/return/payment lines) for ONE
 * supplier — fetched only when that supplier's card is opened, scoped to a
 * period picked inside the card itself (2026-09-19: the list below no longer
 * has a period at all). The card only shows this history plus the identity
 * card's lifetime «Баланс» — no separate period aggregate tiles (owner
 * decision: duplicated what the history rows already show).
 * Scoped queries only (platform_supplier_id or, failing that,
 * umag_supplier_id), never "give me everything for the period".
 * @param {{ platformSupplierId?: string|null, umagSupplierId?: number|null, dateFrom: string, dateTo: string }} params
 */
export async function fetchUmagSupplierOperationHistory({
  platformSupplierId = null,
  umagSupplierId = null,
  dateFrom,
  dateTo,
}) {
  const empty = {
    operations: [],
    openingBalance: 0,
    closingBalance: 0,
    error: null,
  }
  if (!isSupabaseConfigured() || !supabase) {
    return { ...empty, error: 'Supabase не настроен.' }
  }
  if (!platformSupplierId && umagSupplierId == null) {
    return empty
  }

  const fromIso = `${dateFrom}T00:00:00+05:00`
  const toIso = `${dateTo}T23:59:59.999+05:00`

  function scopeToSupplier(query) {
    return platformSupplierId
      ? query.eq('platform_supplier_id', platformSupplierId)
      : query.eq('umag_supplier_id', umagSupplierId)
  }

  const [suppliesRes, returnsRes, paymentsRes, openingRes, nativePaidRes] = await Promise.all([
    fetchAllSupabaseRows(() =>
      scopeToSupplier(
        supabase
          .from('umag_supplies')
          .select(
            'id, umag_supply_id, supplier_id, platform_supplier_id, umag_supplier_id, supplier_name, supplier_legal_name, doc_time, amount, payment_amount, payment_refund_amount, debt, account, comment, umag_user_name'
          )
      )
        .eq('is_source_deleted', false)
        .gte('doc_time', fromIso)
        .lte('doc_time', toIso)
        .order('doc_time', { ascending: false })
    ),
    fetchAllSupabaseRows(() =>
      scopeToSupplier(
        supabase
          .from('umag_supply_returns')
          .select(
            'id, umag_return_id, platform_supplier_id, umag_supplier_id, supplier_name, user_name, amount, payed_amount, document_time, operation_time, note, is_provided, account_names, operation_type'
          )
      )
        .eq('is_source_deleted', false)
        .gte('document_time', fromIso)
        .lte('document_time', toIso)
        .order('document_time', { ascending: false })
    ),
    fetchAllSupabaseRows(() =>
      scopeToSupplier(
        supabase
          .from('umag_document_payments')
          .select(
            'id, umag_payment_id, platform_supplier_id, umag_supplier_id, supplier_name, payment_time, amount, payment_type, class_name, linked_umag_supply_id, linked_umag_return_id, account_name, user_name, note'
          )
      )
        .eq('is_source_deleted', false)
        .gte('payment_time', fromIso)
        .lte('payment_time', toIso)
        .order('payment_time', { ascending: false })
    ),
    fetchAllSupabaseRows(() =>
      scopeToSupplier(
        supabase.from('platform_supplier_ledger_events').select('platform_supplier_id, umag_supplier_id, balance_delta')
      ).lt('occurred_at', fromIso)
    ),
    platformSupplierId
      ? fetchAllSupabaseRows(() =>
          supabase
            .from('supplier_payment_obligations')
            .select(
              'id, platform_supplier_id, umag_supply_id, original_supply_amount, platform_paid_at, platform_paid_by, platform_payment_account_id, supplier:platform_suppliers!platform_supplier_id(name)'
            )
            .eq('platform_supplier_id', platformSupplierId)
            .not('platform_paid_at', 'is', null)
            .not('platform_paid_by', 'is', null)
            .gte('platform_paid_at', fromIso)
            .lte('platform_paid_at', toIso)
        )
      : Promise.resolve({ data: [], error: null }),
  ])

  if (suppliesRes.error) {
    return { ...empty, error: suppliesRes.error.message || 'Не удалось загрузить приёмки UMAG.' }
  }
  if (returnsRes.error) {
    return { ...empty, error: returnsRes.error.message || 'Не удалось загрузить возвраты поставщикам UMAG.' }
  }

  const payments = paymentsRes.error ? [] : paymentsRes.data || []
  const openingRows = openingRes.error ? [] : openingRes.data || []
  const nativePaidObligations = nativePaidRes.error ? [] : nativePaidRes.data || []

  const employeeIds = [
    ...new Set(nativePaidObligations.map((row) => row.platform_paid_by).filter((id) => id != null)),
  ]
  const employeeNameById = new Map()
  if (employeeIds.length > 0) {
    const { data: employeeRows } = await supabase
      .from('academy_users')
      .select('id, full_name')
      .in('id', employeeIds)
    for (const row of employeeRows || []) {
      employeeNameById.set(row.id, row.full_name || null)
    }
  }

  const linkedSupplyIdsInPayments = [
    ...new Set(
      payments
        .filter((p) => !isUmagPaymentRefund(p) && p.linked_umag_supply_id != null)
        .map((p) => Number(p.linked_umag_supply_id))
    ),
  ]
  let attributedSupplyIds = new Set()
  if (linkedSupplyIdsInPayments.length > 0) {
    const { data: attributedRows } = await supabase
      .from('supplier_payment_obligations')
      .select('umag_supply_id')
      .not('platform_paid_by', 'is', null)
      .in('umag_supply_id', linkedSupplyIdsInPayments)
    attributedSupplyIds = new Set((attributedRows || []).map((row) => Number(row.umag_supply_id)))
  }

  await ensurePaymentAccountsLoaded()
  const accountNameById = { get: (accountId) => (accountId ? getPaymentAccountName(accountId) : null) }
  const nativePaymentRows = buildNativeSettlementPaymentRows(
    nativePaidObligations.map((row) => ({
      id: row.id,
      platformSupplierId: row.platform_supplier_id,
      umagSupplyId: row.umag_supply_id,
      originalSupplyAmount: row.original_supply_amount,
      platformPaidAt: row.platform_paid_at,
      platformPaidBy: row.platform_paid_by,
      platformPaymentAccountId: row.platform_payment_account_id,
      supplierName: (Array.isArray(row.supplier) ? row.supplier[0] : row.supplier)?.name || null,
    })),
    { accountNameById, employeeNameById }
  )

  const supplies = suppliesRes.data || []
  const returns = returnsRes.data || []

  let openingBalance = 0
  for (const row of openingRows) openingBalance += toNumber(row.balance_delta)

  const filteredPayments = payments.filter((payment) => {
    if (isUmagPaymentRefund(payment)) return true
    const linkedSupplyId =
      payment.linked_umag_supply_id != null ? Number(payment.linked_umag_supply_id) : null
    return !(linkedSupplyId != null && attributedSupplyIds.has(linkedSupplyId))
  })

  const history = buildSupplierOperationHistory(
    supplies,
    returns,
    [...filteredPayments, ...nativePaymentRows],
    openingBalance
  )

  return {
    operations: history.operations,
    openingBalance,
    closingBalance: history.closingBalance,
    error: null,
  }
}

