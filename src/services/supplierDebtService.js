/**
 * Canonical current supplier debt — single source of truth (Этап 2.1),
 * with a batch path (Этап 2.5) so callers with many suppliers on screen
 * never issue one query per supplier.
 *
 * debt = SUM(supplier_payment_obligations.current_debt)
 *        WHERE is_source_deleted = false AND current_debt > 0
 *
 * No date filter: this is the live open debt, independent of when the
 * underlying приёмка was created. Every screen/flow that needs "how much do
 * we owe this supplier right now" must call fetchCanonicalSupplierDebt()
 * (one supplier) or fetchCanonicalSupplierDebts() (many, one bulk query)
 * instead of re-deriving its own SUM — both share the exact same predicate
 * via fetchOpenObligationRows() below, so there is one formula, not two.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isActiveOpenObligation } from '../utils/supplierPaymentObligations'

/**
 * Raised when a supplier is only known by its UMAG id and has no canonical
 * platform_suppliers link yet — supplier_payment_obligations has no
 * umag_supplier_id column, so its debt genuinely cannot be resolved.
 * Callers must surface this, never treat it as a debt of 0.
 */
export class UnresolvedSupplierDebtError extends Error {
  constructor(umagSupplierId) {
    super(
      `Поставщик UMAG #${umagSupplierId} ещё не сопоставлен с карточкой поставщика — канонический долг недоступен`
    )
    this.name = 'UnresolvedSupplierDebtError'
    this.umagSupplierId = umagSupplierId
  }
}

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
 * Bulk resolve umagSupplierId -> canonical platform_supplier_id using the
 * same link umag-sync itself relies on (platform_suppliers.umag_supplier_id,
 * is_merged = false). Mirrors loadPlatformSupplierMap() in
 * supabase/functions/umag-sync/index.ts — not a new matching strategy.
 * One query regardless of how many ids are requested.
 */
export async function resolvePlatformSupplierIdsByUmagIds(umagSupplierIds) {
  const ids = [...new Set((umagSupplierIds || []).filter((id) => id != null))]
  if (ids.length === 0) return new Map()

  assertSupabaseReady()
  const { data, error } = await supabase
    .from('platform_suppliers')
    .select('id, umag_supplier_id')
    .in('umag_supplier_id', ids)
    .eq('is_merged', false)

  if (error) {
    throw new Error(error.message || 'Не удалось сопоставить поставщиков UMAG с карточками поставщиков')
  }

  const map = new Map()
  for (const row of data || []) {
    if (row.umag_supplier_id != null) map.set(Number(row.umag_supplier_id), row.id)
  }
  return map
}

async function resolvePlatformSupplierIdByUmagId(umagSupplierId) {
  const map = await resolvePlatformSupplierIdsByUmagIds([umagSupplierId])
  return map.get(umagSupplierId) ?? null
}

/**
 * The one canonical read: every open obligation row for the given canonical
 * platformSupplierIds (or all suppliers, if omitted entirely). Both
 * fetchCanonicalSupplierDebt() and fetchCanonicalSupplierDebts() build on
 * this — the predicate lives in exactly one place.
 *
 * @param {string[]} [platformSupplierIds] — omit for every open obligation;
 *   pass an array (possibly empty) to scope to exactly those suppliers.
 */
async function fetchOpenObligationRows(platformSupplierIds) {
  assertSupabaseReady()

  let query = supabase
    .from('supplier_payment_obligations')
    .select('platform_supplier_id, current_debt, is_source_deleted')
    .eq('is_source_deleted', false)
    .gt('current_debt', 0)

  if (Array.isArray(platformSupplierIds)) {
    if (platformSupplierIds.length === 0) return []
    query = query.in('platform_supplier_id', platformSupplierIds)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(error.message || 'Не удалось рассчитать текущую задолженность поставщиков')
  }
  return (data || []).filter(isActiveOpenObligation)
}

/**
 * Canonical current open debt for one supplier.
 *
 * @param {{ platformSupplierId?: string|null, umagSupplierId?: number|null }} params
 * @returns {Promise<{ platformSupplierId: string, debt: number, openObligationCount: number }>}
 */
export async function fetchCanonicalSupplierDebt({
  platformSupplierId = null,
  umagSupplierId = null,
} = {}) {
  assertSupabaseReady()

  let canonicalId = platformSupplierId || null

  if (!canonicalId) {
    if (umagSupplierId == null) {
      throw new Error('Не указан поставщик для расчёта текущей задолженности')
    }
    canonicalId = await resolvePlatformSupplierIdByUmagId(umagSupplierId)
    if (!canonicalId) {
      throw new UnresolvedSupplierDebtError(umagSupplierId)
    }
  }

  const rows = await fetchOpenObligationRows([canonicalId])
  const debt = rows.reduce((sum, row) => sum + toNumber(row.current_debt), 0)

  return {
    platformSupplierId: canonicalId,
    debt,
    openObligationCount: rows.length,
  }
}

/**
 * Canonical current open debt for MANY suppliers in ONE bulk query — no
 * per-supplier round-trip. Rows with platform_supplier_id = NULL (no
 * canonical link at all) are excluded from the map rather than lumped under
 * one key — conflating unrelated unmapped suppliers' debt under a single
 * bucket would misattribute money to whichever row happens to look it up.
 * Callers that need those totals (e.g. a global KPI) should use
 * listPaymentObligations()/buildPaymentScheduleView() instead, which already
 * include them correctly in an aggregate that isn't attributed per-row.
 *
 * @param {{ platformSupplierIds?: string[] }} [params] — omit (or undefined)
 *   for every open obligation company-wide; pass an array to scope the query.
 * @returns {Promise<Map<string, number>>} platformSupplierId -> debt
 */
export async function fetchCanonicalSupplierDebts({ platformSupplierIds } = {}) {
  const rows = await fetchOpenObligationRows(
    Array.isArray(platformSupplierIds) ? platformSupplierIds.filter(Boolean) : undefined
  )

  const map = new Map()
  for (const row of rows) {
    if (!row.platform_supplier_id) continue
    const id = row.platform_supplier_id
    map.set(id, (map.get(id) || 0) + toNumber(row.current_debt))
  }
  return map
}
