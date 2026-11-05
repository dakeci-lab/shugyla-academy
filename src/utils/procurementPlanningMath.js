/** Pure planning formulas for Procurement Planning v1. */

export const PLANNING_WEEK_COUNT = 8

/**
 * Days of cover at current demand: round(calculationStock / avgDaily).
 * Returns null when avgDaily <= 0 (UI shows «—»).
 */
export function calcReserveDays(calculationStock, avgDaily) {
  const stock = Number(calculationStock)
  const avg = Number(avgDaily)
  if (!Number.isFinite(stock) || !Number.isFinite(avg) || avg <= 0) return null
  return Math.round(stock / avg)
}

/**
 * Tone of «Запас/дн» in the product windows, from what is on the SHELF only (stock vs the target), without what is on its way:
 * 'below-norm' (green) — less than the target, time to order; 'above-norm' (red) — more than target + one cycle. The goods in
 * transit are shown in their own column, so an empty shelf is never painted as «too much».
 */
export function shelfToneFromItem(item) {
  const avg = Number(item?.avgDaily)
  const target = Number(item?.targetDays)
  if (!Number.isFinite(avg) || avg <= 0 || !Number.isFinite(target)) return null
  const stock = Math.max(0, Number(item?.calculationStock) || 0)
  const cycle = Number.isFinite(Number(item?.cycleDays)) ? Number(item.cycleDays) : 0
  if (stock < avg * target) return 'below-norm'
  if (stock > avg * (target + cycle)) return 'above-norm'
  return null
}

/** Export row mapping for XLSX/PDF from a purchase order + items. */
export function mapPurchaseOrderForExport(order) {
  const items = (order?.items || []).map((item) => {
    const qty = Number(item.orderQty ?? item.ordered_qty ?? item.orderedQty ?? 0)
    const price = Number(item.purchasePrice ?? item.purchase_price ?? 0)
    const bonusQty = Math.max(0, Number(item.bonusQty ?? item.bonus_qty ?? 0) || 0)
    const discountPct = Math.min(100, Math.max(0, Number(item.discountPct ?? item.discount_pct ?? 0) || 0))
    const factor = 1 - discountPct / 100
    return {
      productName: item.productName ?? item.product_name ?? '',
      barcode: item.barcode ?? '',
      orderedQty: qty,
      bonusQty,
      receiveQty: qty + bonusQty,
      purchasePrice: price,
      discountPct,
      discountedPrice: Math.round(price * factor * 100) / 100,
      baseTotal: Math.round(qty * price * 100) / 100,
      lineTotal: Math.round(qty * price * factor * 100) / 100,
    }
  })
  const totalAmount = items.reduce((sum, row) => sum + row.lineTotal, 0)
  const baseTotal = items.reduce((sum, row) => sum + row.baseTotal, 0)
  return {
    withBonus: items.some((row) => row.bonusQty > 0),
    withDiscount: items.some((row) => row.discountPct > 0),
    baseTotal,
    discountTotal: Math.round((baseTotal - totalAmount) * 100) / 100,
    number: order?.number ?? null,
    supplierName: order?.supplierName ?? order?.supplier_name ?? '',
    purchaseDate: order?.date ?? order?.purchase_date ?? '',
    expectedDeliveryDate: order?.expectedDeliveryDate ?? order?.expected_delivery_date ?? '',
    createdByName: order?.createdByName ?? order?.created_by_name ?? '',
    comment: order?.comment ?? '',
    items,
    totalAmount,
    itemsCount: items.length,
  }
}
