/** Pure planning formulas for Procurement Planning v1. */

export const DEFAULT_NORM_DAYS = 14
export const PLANNING_SALES_DAYS = 56
export const PLANNING_WEEK_COUNT = 8

/** Parse norm days; 0 is valid and must not fall through to default. */
export function parseNormDays(value, fallback = DEFAULT_NORM_DAYS) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.round(n)
}

export function calcAvgDaily(weeklySales = []) {
  const sum = (weeklySales || []).reduce((acc, n) => {
    const v = Number(n)
    return acc + (Number.isFinite(v) ? v : 0)
  }, 0)
  return sum / PLANNING_SALES_DAYS
}

export function calcCalculationStock(rawStock) {
  const n = Number(rawStock)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

export function calcRecommendedQty(avgDaily, normDays, calculationStock) {
  const avg = Number(avgDaily)
  const days = Number(normDays)
  const stock = Number(calculationStock)
  if (!Number.isFinite(avg) || !Number.isFinite(days) || !Number.isFinite(stock)) return 0
  return Math.max(0, Math.round(avg * days - stock))
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

/**
 * When norm days change: always recompute recommendation.
 * If manual_override is false, final follows recommendation.
 * If true, final is preserved.
 */
export function applyNormDaysChange(
  { avgDaily, calculationStock, finalOrderQty, manualOverride },
  nextNormDays
) {
  const recommendedQty = calcRecommendedQty(avgDaily, nextNormDays, calculationStock)
  return {
    normDays: nextNormDays,
    recommendedQty,
    finalOrderQty: manualOverride ? finalOrderQty : recommendedQty,
  }
}

export function resolveNormDays(categoryName, subcategoryName, rules = []) {
  const cat = categoryName || ''
  const sub = subcategoryName || ''
  if (sub) {
    const subRule = rules.find(
      (r) => (r.categoryName || r.category_name || '') === cat &&
        (r.subcategoryName || r.subcategory_name || '') === sub
    )
    if (subRule) return parseNormDays(subRule.normDays ?? subRule.norm_days)
  }
  const catRule = rules.find((r) => {
    const rCat = r.categoryName || r.category_name || ''
    const rSub = r.subcategoryName || r.subcategory_name || ''
    return rCat === cat && !rSub
  })
  if (catRule) return parseNormDays(catRule.normDays ?? catRule.norm_days)
  return DEFAULT_NORM_DAYS
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
