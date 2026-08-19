/**
 * Canonical current supplier debt — single source of truth (Этап 2.1).
 *
 * debt = SUM(supplier_payment_obligations.current_debt)
 *        WHERE is_source_deleted = false AND current_debt > 0
 *
 * No date filter: this is the live open debt, independent of when the
 * underlying приёмка was created. Every screen/flow that needs "how much do
 * we owe this supplier right now" must call fetchCanonicalSupplierDebt()
 * instead of re-deriving its own SUM.
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

/**
 * Resolve umagSupplierId -> canonical platform_supplier_id using the same
 * link umag-sync itself relies on (platform_suppliers.umag_supplier_id,
 * is_merged = false). Mirrors loadPlatformSupplierMap() in
 * supabase/functions/umag-sync/index.ts — not a new matching strategy.
 */
async function resolvePlatformSupplierIdByUmagId(umagSupplierId) {
  const { data, error } = await supabase
    .from('platform_suppliers')
    .select('id')
    .eq('umag_supplier_id', umagSupplierId)
    .eq('is_merged', false)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Не удалось сопоставить поставщика UMAG с карточкой поставщика')
  }
  return data?.id || null
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
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase не настроен.')
  }

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

  const { data, error } = await supabase
    .from('supplier_payment_obligations')
    .select('current_debt, is_source_deleted')
    .eq('platform_supplier_id', canonicalId)
    .eq('is_source_deleted', false)
    .gt('current_debt', 0)

  if (error) {
    throw new Error(error.message || 'Не удалось рассчитать текущую задолженность поставщика')
  }

  const openRows = (data || []).filter(isActiveOpenObligation)
  const debt = openRows.reduce((sum, row) => sum + toNumber(row.current_debt), 0)

  return {
    platformSupplierId: canonicalId,
    debt,
    openObligationCount: openRows.length,
  }
}
