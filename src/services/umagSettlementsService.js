/**
 * UMAG settlements stage-1: read mirrored supplies/suppliers + invoke umag-sync.
 * No UMAG secrets on the client.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { extractFunctionErrorBody, isGenericInvokeErrorMessage } from '../utils/edgeFunctionErrors'
import {
  LEDGER_EVENT_TYPES,
  attachRunningBalances,
  ledgerEventLabel,
  ledgerEventStatusLabel,
  sortLedgerNewestFirst,
} from '../utils/supplierLedger'

export const UMAG_SETTLEMENTS_ERROR_CODES = {
  VALIDATION: 'VALIDATION_ERROR',
  UMAG_AUTH: 'UMAG_AUTH_FAILED',
  UMAG_NETWORK: 'UMAG_NETWORK_ERROR',
  UMAG_NOT_CONFIGURED: 'UMAG_NOT_CONFIGURED',
  UMAG_TIMEOUT: 'UMAG_TIMEOUT',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  PARTIAL: 'PARTIAL_SYNC',
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

/** Paginate PostgREST selects past the default 1000-row cap. */
async function fetchAllSupabaseRows(buildQuery, pageSize = 1000) {
  const rows = []
  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return { data: rows, error: null }
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
 * @param {{ dateFrom: string, dateTo: string, syncSuppliers?: boolean }} params
 */
export async function syncUmagSettlements({ dateFrom, dateTo, syncSuppliers = true }) {
  if (!isSupabaseConfigured() || !supabase) {
    return fail(UMAG_SETTLEMENTS_ERROR_CODES.UNKNOWN, 'Supabase не настроен.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return fail(UMAG_SETTLEMENTS_ERROR_CODES.VALIDATION)
  }

  try {
    const { data, error } = await supabase.functions.invoke('umag-sync', {
      body: { action: 'sync', dateFrom, dateTo, syncSuppliers },
    })

    if (error) {
      const body = await extractFunctionErrorBody(error)
      if (body && typeof body === 'object') {
        if (body.success === false || body.ok === false) {
          const code = mapErrorCode(body.code)
          return fail(code, body.message || USER_MESSAGES[code])
        }
      }
      const msg = error.message || ''
      if (!isGenericInvokeErrorMessage(msg) && /unauthorized|jwt|session/i.test(msg)) {
        return fail(UMAG_SETTLEMENTS_ERROR_CODES.UNAUTHORIZED)
      }
      if (/forbidden/i.test(msg)) {
        return fail(UMAG_SETTLEMENTS_ERROR_CODES.FORBIDDEN)
      }
      return fail(UMAG_SETTLEMENTS_ERROR_CODES.UMAG_NETWORK)
    }

    if (data?.success === true) {
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

    if (data?.success === false) {
      const code = mapErrorCode(data.code)
      return fail(code, data.message || USER_MESSAGES[code])
    }

    return fail(UMAG_SETTLEMENTS_ERROR_CODES.UMAG_NETWORK)
  } catch {
    return fail(UMAG_SETTLEMENTS_ERROR_CODES.UMAG_NETWORK)
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

function supplierSettlementKey({ platformSupplierId, supplierId, umagSupplierId, name }) {
  return (
    platformSupplierId ||
    supplierId ||
    (umagSupplierId != null ? `umag:${umagSupplierId}` : `name:${name || 'Без названия'}`)
  )
}

function ensureSettlementRow(byKey, seed) {
  const key = supplierSettlementKey(seed)
  let row = byKey.get(key)
  if (!row) {
    row = {
      key,
      platformSupplierId: seed.platformSupplierId || null,
      supplierId: seed.platformSupplierId || seed.supplierId || null,
      umagSupplierUuid: seed.supplierId || null,
      umagSupplierId: seed.umagSupplierId ?? null,
      name: seed.name || 'Без названия',
      legalName: seed.legalName || null,
      supplyCount: 0,
      amount: 0,
      paymentAmount: 0,
      paymentRefundAmount: 0,
      debt: 0,
      returnCount: 0,
      returnAmount: 0,
      documentPaymentAmount: 0,
      documentRefundAmount: 0,
      supplies: [],
      returns: [],
      payments: [],
    }
    byKey.set(key, row)
  } else {
    if (!row.platformSupplierId && seed.platformSupplierId) {
      row.platformSupplierId = seed.platformSupplierId
      row.supplierId = seed.platformSupplierId
    }
    if (!row.name && seed.name) row.name = seed.name
    if (!row.legalName && seed.legalName) row.legalName = seed.legalName
    if (row.umagSupplierId == null && seed.umagSupplierId != null) {
      row.umagSupplierId = seed.umagSupplierId
    }
  }
  return row
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
    const type = String(payment.payment_type || '').toUpperCase()
    const isRefund =
      type === 'SUPPLY_REFUND' ||
      signed < 0 ||
      String(payment.class_name || '') === 'SupplyReturn'
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
      documentNumber: String(payment.umag_payment_id || payment.id || ''),
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
 * Load supplies + returns + payments for period and aggregate by canonical supplier.
 * @param {{ dateFrom: string, dateTo: string, search?: string }} params
 */
export async function fetchUmagSettlementsBySupplier({ dateFrom, dateTo, search = '' }) {
  if (!isSupabaseConfigured() || !supabase) {
    return { rows: [], totals: emptyTotals(), error: 'Supabase не настроен.' }
  }

  const fromIso = `${dateFrom}T00:00:00+05:00`
  const toIso = `${dateTo}T23:59:59.999+05:00`

  const [suppliesRes, returnsRes, paymentsRes, openingRes] = await Promise.all([
    fetchAllSupabaseRows(() =>
      supabase
        .from('umag_supplies')
        .select(
          'id, umag_supply_id, supplier_id, platform_supplier_id, umag_supplier_id, supplier_name, supplier_legal_name, doc_time, amount, payment_amount, payment_refund_amount, debt, account, comment, umag_user_name'
        )
        .eq('is_source_deleted', false)
        .gte('doc_time', fromIso)
        .lte('doc_time', toIso)
        .order('doc_time', { ascending: false })
    ),
    fetchAllSupabaseRows(() =>
      supabase
        .from('umag_supply_returns')
        .select(
          'id, umag_return_id, platform_supplier_id, umag_supplier_id, supplier_name, user_name, amount, payed_amount, document_time, operation_time, note, is_provided, account_names, operation_type'
        )
        .eq('is_source_deleted', false)
        .gte('document_time', fromIso)
        .lte('document_time', toIso)
        .order('document_time', { ascending: false })
    ),
    fetchAllSupabaseRows(() =>
      supabase
        .from('umag_document_payments')
        .select(
          'id, umag_payment_id, platform_supplier_id, umag_supplier_id, supplier_name, payment_time, amount, payment_type, class_name, linked_umag_supply_id, linked_umag_return_id, account_name, user_name, note'
        )
        .eq('is_source_deleted', false)
        .gte('payment_time', fromIso)
        .lte('payment_time', toIso)
        .order('payment_time', { ascending: false })
    ),
    fetchAllSupabaseRows(() =>
      supabase
        .from('platform_supplier_ledger_events')
        .select('platform_supplier_id, umag_supplier_id, balance_delta')
        .lt('occurred_at', fromIso)
        .order('occurred_at', { ascending: true })
    ),
  ])

  if (suppliesRes.error) {
    return {
      rows: [],
      totals: emptyTotals(),
      error: suppliesRes.error.message || 'Не удалось загрузить приёмки UMAG.',
    }
  }
  if (returnsRes.error) {
    return {
      rows: [],
      totals: emptyTotals(),
      error: returnsRes.error.message || 'Не удалось загрузить возвраты поставщикам UMAG.',
    }
  }
  // Payments / opening ledger may be absent before migration — treat as empty.
  const payments = paymentsRes.error ? [] : paymentsRes.data || []
  const openingRows = openingRes.error ? [] : openingRes.data || []

  const supplies = suppliesRes.data || []
  const returns = returnsRes.data || []
  const byKey = new Map()

  const openingByKey = new Map()
  for (const row of openingRows) {
    const key = supplierSettlementKey({
      platformSupplierId: row.platform_supplier_id,
      umagSupplierId: row.umag_supplier_id,
      name: null,
    })
    openingByKey.set(key, (openingByKey.get(key) || 0) + toNumber(row.balance_delta))
  }

  for (const supply of supplies) {
    const row = ensureSettlementRow(byKey, {
      platformSupplierId: supply.platform_supplier_id,
      supplierId: supply.supplier_id,
      umagSupplierId: supply.umag_supplier_id,
      name: supply.supplier_name,
      legalName: supply.supplier_legal_name,
    })
    row.supplyCount += 1
    row.amount += toNumber(supply.amount)
    row.paymentAmount += toNumber(supply.payment_amount)
    row.paymentRefundAmount += toNumber(supply.payment_refund_amount)
    row.debt += toNumber(supply.debt)
    row.supplies.push(supply)
  }

  for (const ret of returns) {
    const row = ensureSettlementRow(byKey, {
      platformSupplierId: ret.platform_supplier_id,
      umagSupplierId: ret.umag_supplier_id,
      name: ret.supplier_name,
    })
    row.returnCount += 1
    row.returnAmount += Math.abs(toNumber(ret.amount))
    row.returns.push(ret)
  }

  for (const payment of payments) {
    const row = ensureSettlementRow(byKey, {
      platformSupplierId: payment.platform_supplier_id,
      umagSupplierId: payment.umag_supplier_id,
      name: payment.supplier_name,
    })
    const signed = toNumber(payment.amount)
    const abs = Math.abs(signed)
    const type = String(payment.payment_type || '').toUpperCase()
    const isRefund =
      type === 'SUPPLY_REFUND' ||
      signed < 0 ||
      String(payment.class_name || '') === 'SupplyReturn'
    if (!isRefund) {
      row.documentPaymentAmount = (row.documentPaymentAmount || 0) + abs
    } else {
      row.documentRefundAmount = (row.documentRefundAmount || 0) + abs
    }
    row.payments = row.payments || []
    row.payments.push(payment)
  }

  let rows = [...byKey.values()].map((row) => {
    const openingBalance = openingByKey.get(row.key) || 0
    const history = buildSupplierOperationHistory(
      row.supplies,
      row.returns,
      row.payments || [],
      openingBalance
    )
    const paidFromDocuments = toNumber(row.documentPaymentAmount)
    return {
      ...row,
      openingBalance,
      closingBalance: history.closingBalance,
      // Prefer real payment documents for "Оплачено" when available.
      paymentAmount: paidFromDocuments > 0 ? paidFromDocuments : row.paymentAmount,
      // Closing ledger balance is the period debt signal when ledger exists.
      debt: history.operations.length > 0 ? history.closingBalance : row.debt,
      operations: history.operations,
    }
  })

  const q = search.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.legalName && row.legalName.toLowerCase().includes(q))
    )
  }

  rows.sort((a, b) => {
    if (b.debt !== a.debt) return b.debt - a.debt
    return b.amount - a.amount
  })

  const totals = rows.reduce(
    (acc, row) => {
      acc.supplyCount += row.supplyCount
      acc.amount += row.amount
      acc.paymentAmount += row.paymentAmount
      acc.paymentRefundAmount += row.paymentRefundAmount
      acc.debt += row.debt
      acc.returnCount += row.returnCount
      acc.returnAmount += row.returnAmount
      return acc
    },
    emptyTotals()
  )

  return {
    rows,
    totals,
    error: null,
    suppliesCount: supplies.length,
    returnsCount: returns.length,
    paymentsCount: payments.length,
    paymentsLoadError: paymentsRes.error?.message || null,
  }
}

function emptyTotals() {
  return {
    supplyCount: 0,
    amount: 0,
    paymentAmount: 0,
    paymentRefundAmount: 0,
    debt: 0,
    returnCount: 0,
    returnAmount: 0,
  }
}
