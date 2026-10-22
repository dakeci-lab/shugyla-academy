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
      .select('id, original_supply_amount')
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

async function fetchOpenNativeObligationRows(platformSupplierIds) {
  assertSupabaseReady()

  if (Array.isArray(platformSupplierIds) && platformSupplierIds.length === 0) {
    return []
  }

  const { data, error } = await fetchAllSupabaseRows(() => {
    let query = supabase
      .from('supplier_payment_obligations')
      .select('id, platform_supplier_id, original_supply_amount, is_source_deleted, platform_paid_at')
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
 * Native current open debt for MANY suppliers in ONE bulk query — powers the
 * «Взаиморасчёты» list's debt column, agreeing with «К оплате». Rows with
 * platform_supplier_id = NULL (no canonical link at all) are excluded from
 * the map rather than lumped under one key — conflating unrelated unmapped
 * suppliers' debt under a single bucket would misattribute money to
 * whichever row happens to look it up.
 *
 * @param {{ platformSupplierIds?: string[] }} [params]
 * @returns {Promise<Map<string, number>>} platformSupplierId -> debt
 */
export async function fetchNativeSupplierDebts({ platformSupplierIds, includeUnassigned = false } = {}) {
  const idsGiven = Array.isArray(platformSupplierIds)
  const [rows, separateUnassignedRows] = await Promise.all([
    fetchOpenNativeObligationRows(idsGiven ? platformSupplierIds.filter(Boolean) : undefined),
    // Without an id filter the single query below already returns the unassigned rows too.
    includeUnassigned && idsGiven ? fetchOpenUnassignedObligationRows() : Promise.resolve([]),
  ])
  const unassignedRows = idsGiven ? separateUnassignedRows : rows.filter((row) => !row.platform_supplier_id)

  const map = new Map()
  if (includeUnassigned) {
    // Always present (0 when nothing is unassigned) so callers can tell
    // "loaded, nothing there" from "not requested".
    map.set(
      UNASSIGNED_SUPPLIER_ID,
      unassignedRows.reduce((sum, row) => sum + toNumber(row.original_supply_amount), 0)
    )
  }
  for (const row of rows) {
    if (!row.platform_supplier_id) continue
    const id = row.platform_supplier_id
    map.set(id, (map.get(id) || 0) + toNumber(row.original_supply_amount))
  }
  return map
}
