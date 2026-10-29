/** Pure planning formulas for Procurement Planning v1. */

export const PLANNING_WEEK_COUNT = 8

/** Oldest week first; the newest four weeks count twice (same weights as the umag-procurement Edge function). */
export const PLANNING_WEEK_WEIGHTS = Object.freeze([1, 1, 1, 1, 2, 2, 2, 2])

export function calcAvgDaily(weeklySales = []) {
  const weights = PLANNING_WEEK_WEIGHTS
  const total = weights.reduce((a, b) => a + b, 0)
  const weighted = weights.reduce((acc, weight, index) => {
    const v = Number((weeklySales || [])[index])
    return acc + weight * (Number.isFinite(v) ? v : 0)
  }, 0)
  return weighted / (7 * total)
}

export function calcCalculationStock(rawStock) {
  const n = Number(rawStock)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

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

/** Row highlight for «Запас/дн» from the server-side status (stage 23): under -> below-norm, over -> above-norm. */
export function reserveHighlightFromStatus(reserveStatus) {
  if (reserveStatus === 'under_norm') return 'below-norm'
  if (reserveStatus === 'over_norm') return 'above-norm'
  return null
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

/** Group orderable items by platform supplier for generate contract. */
export function groupOrderableBySupplier(items = []) {
  const groups = new Map()
  let skippedNoSupplier = 0
  for (const item of items) {
    const qty = Number(item.finalOrderQty ?? item.final_order_qty ?? 0)
    if (!(qty > 0)) continue
    const supplierId = item.platformSupplierId ?? item.platform_supplier_id ?? null
    if (!supplierId) {
      skippedNoSupplier += 1
      continue
    }
    if (!groups.has(supplierId)) groups.set(supplierId, [])
    groups.get(supplierId).push(item)
  }
  return { groups, skippedNoSupplier, orderCount: groups.size }
}

/** Map snapshot/planning item → purchase_order_items row shape. */
export function mapSnapshotItemToPurchaseOrderItem(item, orderId, supplier) {
  const orderedQty = Number(item.finalOrderQty ?? item.final_order_qty ?? 0)
  const price = Number(item.purchasePrice ?? item.purchase_price ?? 0)
  return {
    purchase_order_id: orderId,
    product_name: item.productName ?? item.product_name ?? '',
    barcode: item.barcode ?? '',
    supplier_id: supplier?.id ?? item.platformSupplierId ?? item.platform_supplier_id ?? null,
    supplier_name: supplier?.name ?? item.umagSupplierName ?? item.umag_supplier_name ?? '',
    stock_qty: Number(item.calculationStock ?? item.calculation_stock ?? 0),
    sales_per_day: Number(item.avgDaily ?? item.avg_daily ?? 0),
    recommended_qty: Number(item.recommendedQty ?? item.recommended_qty ?? 0),
    ordered_qty: orderedQty,
    purchase_price: price,
    total_amount: Math.round(orderedQty * price * 100) / 100,
  }
}

/** Export row mapping for XLSX/PDF from a purchase order + items. */
export function mapPurchaseOrderForExport(order) {
  const items = (order?.items || []).map((item) => {
    const qty = Number(item.orderQty ?? item.ordered_qty ?? item.orderedQty ?? 0)
    const price = Number(item.purchasePrice ?? item.purchase_price ?? 0)
    return {
      productName: item.productName ?? item.product_name ?? '',
      barcode: item.barcode ?? '',
      orderedQty: qty,
      purchasePrice: price,
      lineTotal: Math.round(qty * price * 100) / 100,
    }
  })
  const totalAmount = items.reduce((sum, row) => sum + row.lineTotal, 0)
  return {
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
