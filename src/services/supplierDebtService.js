/**
 * Native current supplier debt — single source of truth, agreeing with
 * «К оплате» (see fetchNativeSupplierDebts() below): a supply's amount owed
 * is its original_supply_amount unless platform_paid_at is set, full stop.
 * UMAG's own current_debt field is never consulted — the old "Этап 2.1
 * canonical debt" formula built on it was retired once staff started
 * marking documents paid in UMAG immediately at receiving time, which made
 * current_debt stop meaning "still owed" at all.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchAllSupabaseRows } from '../utils/supabasePagination'
import { toAqtobeDateKey } from '../utils/supplierPaymentObligations'

/**
 * Pseudo supplier id for open obligations whose UMAG document has no supplier
 * selected (platform_supplier_id IS NULL) — e.g. a receiving the receiver has
 * not finished filling in yet. Shown as «Поставщик не выбран» so the
 * «Поставщики» total always equals «К оплате».
 */
export const UNASSIGNED_SUPPLIER_ID = '__unassigned__'
export const UNASSIGNED_SUPPLIER_NAME = 'Поставщик не выбран'

function toNumber(value) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

const roundTiyn = (value) => Math.round(value * 100) / 100

function assertSupabaseReady() {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase не настроен.')
  }
}

/**
 * Every open obligation by the NATIVE formula — is_source_deleted = false AND
 * platform_paid_at IS NULL — never UMAG's own current_debt. This is the same
 * predicate «К оплате» uses (see isActiveOpenObligation/resolveOwedAmount in
 * utils/supplierPaymentObligations.js): once staff started marking documents
 * paid in UMAG immediately at receiving time, current_debt stopped meaning
 * "still owed" at all, so it must never feed a debt total shown next to
 * «К оплате» anywhere in the app.
 */
async function fetchOpenUnassignedObligationRows() {
  assertSupabaseReady()
  const { data, error } = await fetchAllSupabaseRows(() =>
    supabase
      .from('supplier_payment_obligations')
      .select('id, original_supply_amount, supply_document_date, due_date')
      .eq('is_source_deleted', false)
      .is('platform_paid_at', null)
      .is('platform_supplier_id', null)
      .order('id', { ascending: true })
  )
  if (error) {
    throw new Error(error.message || 'Не удалось рассчитать задолженность без поставщика')
  }
  return data || []
}

/**
 * Returns to a supplier whose money has not come back yet (is_source_deleted = false AND platform_refunded_at IS NULL):
 * the supplier owes us this, so it reduces what we owe him. Needs a real supplier (unassigned returns are not netted).
 */
async function fetchOpenReturnRows(platformSupplierIds) {
  assertSupabaseReady()

  if (Array.isArray(platformSupplierIds) && platformSupplierIds.length === 0) {
    return []
  }

  const { data, error } = await fetchAllSupabaseRows(() => {
    let query = supabase
      .from('umag_supply_returns')
      .select('id, platform_supplier_id, amount')
      .eq('is_source_deleted', false)
      .is('platform_refunded_at', null)
      .not('platform_supplier_id', 'is', null)
      .order('id', { ascending: true })

    if (Array.isArray(platformSupplierIds)) {
      query = query.in('platform_supplier_id', platformSupplierIds)
    }

    return query
  })

  if (error) {
    throw new Error(error.message || 'Не удалось рассчитать неполученные возвраты поставщиков')
  }
  return data || []
}

async function fetchOpenNativeObligationRows(platformSupplierIds) {
  assertSupabaseReady()

  if (Array.isArray(platformSupplierIds) && platformSupplierIds.length === 0) {
    return []
  }

  const { data, error } = await fetchAllSupabaseRows(() => {
    let query = supabase
      .from('supplier_payment_obligations')
      .select(
        'id, platform_supplier_id, original_supply_amount, supply_document_date, due_date, is_source_deleted, platform_paid_at'
      )
      .eq('is_source_deleted', false)
      .is('platform_paid_at', null)
      .order('id', { ascending: true })

    if (Array.isArray(platformSupplierIds)) {
      query = query.in('platform_supplier_id', platformSupplierIds)
    }

    return query
  })

  if (error) {
    throw new Error(error.message || 'Не удалось рассчитать текущую задолженность поставщиков')
  }
  return data || []
}

/**
 * Native open debt per supplier in ONE bulk query: amount, number of unpaid documents and the date of
 * the oldest one — the supplier list shows «3 неоплаченных · с 15.10» under the name. Agrees with
 * «К оплате»'s old predicate (is_source_deleted = false AND platform_paid_at IS NULL, never UMAG's
 * current_debt). Rows with platform_supplier_id = NULL are not lumped under any real supplier; with
 * includeUnassigned they get their own UNASSIGNED_SUPPLIER_ID entry (always present, 0 when empty).
 *
 * @param {{ platformSupplierIds?: string[], includeUnassigned?: boolean }} [params]
 * Also counts what is overdue (due_date before today, Asia/Aqtobe): overdueCount / overdueAmount.
 *
 * `amount` is the NET debt: unpaid receipts minus unpaid returns (`receiptsAmount`, `returnsAmount` — the parts); `count` is the
 * number of unpaid receipts. Returns with no supplier chosen are not netted (the virtual «Поставщик не выбран» row stays the sum of its unpaid invoices).
 *
 * @returns {Promise<Map<string, { amount: number, receiptsAmount: number, returnsAmount: number, returnsCount: number, count: number, oldestDate: string|null, overdueCount: number, overdueAmount: number }>>}
 */
export async function fetchNativeSupplierDebtSummary({ platformSupplierIds, includeUnassigned = false } = {}) {
  const idsGiven = Array.isArray(platformSupplierIds)
  const [rows, returnRows, separateUnassignedRows] = await Promise.all([
    fetchOpenNativeObligationRows(idsGiven ? platformSupplierIds.filter(Boolean) : undefined),
    fetchOpenReturnRows(idsGiven ? platformSupplierIds.filter(Boolean) : undefined),
    // Without an id filter the single query below already returns the unassigned rows too.
    includeUnassigned && idsGiven ? fetchOpenUnassignedObligationRows() : Promise.resolve([]),
  ])
  const unassignedRows = idsGiven ? separateUnassignedRows : rows.filter((row) => !row.platform_supplier_id)
  return buildNativeDebtSummary({ rows, returnRows, unassignedRows, includeUnassigned, todayKey: toAqtobeDateKey() })
}

/**
 * Pure part: receipts rows + returns rows → the map supplier → { amount (NET), receiptsAmount, returnsAmount, … }.
 * Exported for `verify:supplier-net-debt` (the real numbers of a supplier are checked without a database).
 */
export function buildNativeDebtSummary({ rows = [], returnRows = [], unassignedRows = [], includeUnassigned = false, todayKey }) {
  const map = new Map()
  const newEntry = () => ({
    amount: 0,
    receiptsAmount: 0,
    returnsAmount: 0,
    returnsCount: 0,
    count: 0,
    oldestDate: null,
    overdueCount: 0,
    overdueAmount: 0,
  })
  const add = (id, row) => {
    const entry = map.get(id) || newEntry()
    entry.receiptsAmount += toNumber(row.original_supply_amount)
    entry.count += 1
    if (row.due_date && row.due_date < todayKey) {
      entry.overdueCount += 1
      entry.overdueAmount += toNumber(row.original_supply_amount)
    }
    const date = row.supply_document_date || null
    if (date && (!entry.oldestDate || date < entry.oldestDate)) entry.oldestDate = date
    map.set(id, entry)
  }
  if (includeUnassigned) {
    map.set(UNASSIGNED_SUPPLIER_ID, newEntry())
    for (const row of unassignedRows) add(UNASSIGNED_SUPPLIER_ID, row)
  }
  for (const row of rows) {
    if (!row.platform_supplier_id) continue
    add(row.platform_supplier_id, row)
  }
  // Unpaid returns come off the debt (a supplier with returns only gets a negative balance: he owes us).
  for (const row of returnRows) {
    const entry = map.get(row.platform_supplier_id) || newEntry()
    entry.returnsAmount += toNumber(row.amount)
    entry.returnsCount += 1
    map.set(row.platform_supplier_id, entry)
  }
  // `amount` is the NET debt (receipts − returns), rounded to tiyn at the very end; «просрочено» stays receipts only
  // (a return has no due date).
  for (const entry of map.values()) {
    entry.receiptsAmount = roundTiyn(entry.receiptsAmount)
    entry.returnsAmount = roundTiyn(entry.returnsAmount)
    entry.amount = roundTiyn(entry.receiptsAmount - entry.returnsAmount)
    entry.overdueAmount = roundTiyn(entry.overdueAmount)
  }
  return map
}

/** Same query, amounts only: platformSupplierId -> debt. */
export async function fetchNativeSupplierDebts(params = {}) {
  const summary = await fetchNativeSupplierDebtSummary(params)
  return new Map([...summary].map(([id, entry]) => [id, entry.amount]))
}
