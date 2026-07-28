/**
 * UMAG settlements stage-1: read mirrored supplies/suppliers + invoke umag-sync.
 * No UMAG secrets on the client.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { extractFunctionErrorBody, isGenericInvokeErrorMessage } from '../utils/edgeFunctionErrors'

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
      supplies: [],
      returns: [],
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

/**
 * Build unified chronological operations for one supplier (newest first).
 * Supply amounts are shown as +, return amounts as − (presentation only).
 */
export function buildSupplierOperationHistory(supplies = [], returns = []) {
  const ops = []
  for (const supply of supplies) {
    ops.push({
      id: `supply:${supply.id}`,
      kind: 'supply',
      label: 'Приёмка',
      sortAt: supply.doc_time,
      amount: toNumber(supply.amount),
      signedAmount: toNumber(supply.amount),
      source: supply,
    })
  }
  for (const ret of returns) {
    const abs = Math.abs(toNumber(ret.amount))
    ops.push({
      id: `return:${ret.id}`,
      kind: 'return',
      label: 'Возврат поставщику',
      sortAt: ret.document_time,
      amount: abs,
      signedAmount: -abs,
      source: ret,
    })
  }
  ops.sort((a, b) => {
    const ta = new Date(a.sortAt || 0).getTime()
    const tb = new Date(b.sortAt || 0).getTime()
    if (tb !== ta) return tb - ta
    return String(a.id).localeCompare(String(b.id))
  })
  return ops
}

export function filterSupplierOperations(operations, filter = 'all') {
  if (filter === 'supplies') return operations.filter((op) => op.kind === 'supply')
  if (filter === 'returns') return operations.filter((op) => op.kind === 'return')
  return operations
}

export function formatSignedUmagMoney(value) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  const absLabel = formatUmagMoney(Math.abs(n)).replace(' ₸', '')
  if (n > 0) return `+${absLabel} ₸`
  if (n < 0) return `−${absLabel} ₸`
  return `${absLabel} ₸`
}

/**
 * Load supplies + returns for period and aggregate by canonical supplier.
 * @param {{ dateFrom: string, dateTo: string, search?: string }} params
 */
export async function fetchUmagSettlementsBySupplier({ dateFrom, dateTo, search = '' }) {
  if (!isSupabaseConfigured() || !supabase) {
    return { rows: [], totals: emptyTotals(), error: 'Supabase не настроен.' }
  }

  const fromIso = `${dateFrom}T00:00:00+05:00`
  const toIso = `${dateTo}T23:59:59.999+05:00`

  const [suppliesRes, returnsRes] = await Promise.all([
    supabase
      .from('umag_supplies')
      .select(
        'id, umag_supply_id, supplier_id, platform_supplier_id, umag_supplier_id, supplier_name, supplier_legal_name, doc_time, amount, payment_amount, payment_refund_amount, debt, account, comment, umag_user_name'
      )
      .eq('is_source_deleted', false)
      .gte('doc_time', fromIso)
      .lte('doc_time', toIso)
      .order('doc_time', { ascending: false }),
    supabase
      .from('umag_supply_returns')
      .select(
        'id, umag_return_id, platform_supplier_id, umag_supplier_id, supplier_name, user_name, amount, payed_amount, document_time, operation_time, note, is_provided, account_names, operation_type'
      )
      .eq('is_source_deleted', false)
      .gte('document_time', fromIso)
      .lte('document_time', toIso)
      .order('document_time', { ascending: false }),
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

  const supplies = suppliesRes.data || []
  const returns = returnsRes.data || []
  const byKey = new Map()

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

  let rows = [...byKey.values()].map((row) => ({
    ...row,
    operations: buildSupplierOperationHistory(row.supplies, row.returns),
  }))

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
