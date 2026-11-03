/**
 * Pure UX helpers for the procurement planner (summaries, workflow, guards).
 */

import { addDaysToDateKey } from './timezone.js'

/** Matches sync `buildEightWeekRanges` / `PLANNING_WEEK_COUNT`. */
export const PLANNER_WEEK_COLUMN_COUNT = 8

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function isDateKey(value) {
  return DATE_KEY_RE.test(String(value || ''))
}

/** YYYY-MM-DD → ДД.ММ */
function formatDateKeyShortRu(dateKey) {
  const m = DATE_KEY_RE.exec(String(dateKey || ''))
  if (!m) return ''
  return `${m[3]}.${m[2]}`
}

/**
 * Eight week column labels from snapshot period (index 0 = oldest, 7 = newest).
 * Mirrors umag-procurement windows: week i = [periodFrom + i*7, periodFrom + i*7 + 6].
 *
 * @param {string|null|undefined} periodFrom
 * @param {string|null|undefined} periodTo
 * @returns {{ labels: string[], titles: string[], fromKeys: string[], toKeys: string[] }}
 */
export function buildPlannerWeekColumnLabels(periodFrom, periodTo) {
  const count = PLANNER_WEEK_COLUMN_COUNT
  if (!isDateKey(periodFrom) || !isDateKey(periodTo)) {
    const labels = Array.from({ length: count }, (_, i) => `W${i + 1}`)
    const titles = labels.map(
      (label, i) =>
        `${label}: неделя ${i + 1} из ${count} (oldest→newest; период снимка недоступен)`
    )
    return {
      labels,
      titles,
      fromKeys: Array.from({ length: count }, () => ''),
      toKeys: Array.from({ length: count }, () => ''),
    }
  }

  const from = String(periodFrom)
  const labels = []
  const titles = []
  const fromKeys = []
  const toKeys = []
  for (let i = 0; i < count; i += 1) {
    const weekFrom = addDaysToDateKey(from, i * 7)
    const weekTo = addDaysToDateKey(weekFrom, 6)
    fromKeys.push(weekFrom)
    toKeys.push(weekTo)
    labels.push(formatDateKeyShortRu(weekTo))
    titles.push(
      `Неделя ${i + 1} из ${count} (oldest→newest): ${formatDateKeyShortRu(weekFrom)}–${formatDateKeyShortRu(weekTo)}`
    )
  }
  return { labels, titles, fromKeys, toKeys }
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function positiveQty(row) {
  return finiteNumber(row?.final_order_qty ?? row?.finalOrderQty, 0) > 0
}

function supplierIdOf(row) {
  return row?.platform_supplier_id ?? row?.platformSupplierId ?? null
}

function generatedIdOf(row) {
  return row?.generated_purchase_order_id ?? row?.generatedPurchaseOrderId ?? null
}

function qtyOf(row) {
  return finiteNumber(row?.final_order_qty ?? row?.finalOrderQty, 0)
}

function supplierNameOf(row, fallbackId = '') {
  return row?.umag_supplier_name || row?.umagSupplierName || fallbackId || ''
}

/**
 * Russian plural form for a count.
 * @param {number} count
 * @param {[string, string, string]} forms [1, 2–4, 5–20]
 */
export function pluralizeRu(count, forms) {
  const list = Array.isArray(forms) ? forms : []
  const n = Math.abs(Math.trunc(finiteNumber(count, 0)))
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return list[0] ?? ''
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return list[1] ?? list[0] ?? ''
  return list[2] ?? list[1] ?? list[0] ?? ''
}

/**
 * True when at least one purchase order already exists for this supplier in the
 * current snapshot revision.
 *
 * NB: this is *history*, not a lock. Repeat orders to the same supplier are allowed,
 * so no control may be disabled just because this returns true.
 */
export function isSupplierOrderCreated(summary) {
  return Boolean(summary?.generatedOrderId) || (summary?.generatedPositions || 0) > 0
}

/**
 * Positions that were expected to land in a generated order but did not
 * (partial or failed generation).
 *
 * Prefers the explicit backend aggregate `inconsistentPositions` when the summary
 * carries it, and falls back to the legacy derivation (an order exists AND pending
 * qty remains). Once repeat orders are live, a fresh draft for an already-served
 * supplier is a normal state rather than a discrepancy — only the backend aggregate
 * can tell those two apart, hence the preference.
 */
export function isSupplierInconsistent(summary) {
  if (summary && summary.inconsistentPositions != null) {
    return finiteNumber(summary.inconsistentPositions, 0) > 0
  }
  return isSupplierOrderCreated(summary) && (summary?.pendingPositions || 0) > 0
}

/**
 * Create empty accumulator used while paginating snapshot filter rows.
 */
export function createSnapshotFilterAccumulator() {
  return {
    categories: new Set(),
    pairs: new Set(),
    /** @type {Map<string, number>} snapshot-wide SKU counts per category */
    categoryCounts: new Map(),
    /** @type {Map<string, number>} snapshot-wide SKU counts per category\\0subcategory */
    pairCounts: new Map(),
    /** @type {Map<string, number>} snapshot-wide orderable (qty>0) counts */
    categoryCountsOrderable: new Map(),
    /** @type {Map<string, number>} */
    pairCountsOrderable: new Map(),
    /**
     * @type {Map<string, Map<string, number>>}
     * supplierId → categoryName → count (all SKUs of supplier)
     */
    categoryCountsBySupplier: new Map(),
    /** @type {Map<string, Map<string, number>>} supplierId → pairKey → count */
    pairCountsBySupplier: new Map(),
    /** @type {Map<string, Map<string, number>>} supplierId → category → orderable count */
    categoryCountsBySupplierOrderable: new Map(),
    /** @type {Map<string, Map<string, number>>} */
    pairCountsBySupplierOrderable: new Map(),
    suppliers: new Map(),
    unassignedOrderableCount: 0,
  }
}

function emptySupplierSummary(id, name = '') {
  return {
    id,
    name: name || id,
    orderablePositions: 0,
    totalQty: 0,
    pendingPositions: 0,
    /** Qty of the pending positions only — what the *next* order would contain. */
    pendingQty: 0,
    generatedPositions: 0,
    generatedOrderId: null,
  }
}

function bumpNestedCount(rootMap, outerKey, innerKey, delta = 1) {
  if (!outerKey || !innerKey) return
  let inner = rootMap.get(outerKey)
  if (!inner) {
    inner = new Map()
    rootMap.set(outerKey, inner)
  }
  const next = (inner.get(innerKey) || 0) + delta
  if (next <= 0) inner.delete(innerKey)
  else inner.set(innerKey, next)
  if (inner.size === 0) rootMap.delete(outerKey)
}

function nestedMapsToObject(rootMap) {
  const out = {}
  for (const [outerKey, inner] of rootMap || []) {
    out[outerKey] = Object.fromEntries(inner)
  }
  return out
}

/**
 * Fold one DB/client row into the filter accumulator.
 * @param {object} row
 * @param {ReturnType<typeof createSnapshotFilterAccumulator>} state
 */
export function accumulateSnapshotFilterRow(row, state) {
  const cat = row?.category_name || row?.categoryName || ''
  const sub = row?.subcategory_name || row?.subcategoryName || ''
  const pairKey = cat && sub ? `${cat}\u0000${sub}` : ''
  const qty = qtyOf(row)
  const orderable = qty > 0
  const generatedId = generatedIdOf(row)
  const supplierId = supplierIdOf(row)
  const supplierName = supplierNameOf(row, supplierId)

  if (cat) {
    state.categories.add(cat)
    state.categoryCounts.set(cat, (state.categoryCounts.get(cat) || 0) + 1)
    if (orderable) {
      state.categoryCountsOrderable.set(
        cat,
        (state.categoryCountsOrderable.get(cat) || 0) + 1
      )
    }
  }
  if (pairKey) {
    state.pairs.add(pairKey)
    state.pairCounts.set(pairKey, (state.pairCounts.get(pairKey) || 0) + 1)
    if (orderable) {
      state.pairCountsOrderable.set(
        pairKey,
        (state.pairCountsOrderable.get(pairKey) || 0) + 1
      )
    }
  }

  if (!supplierId) {
    if (orderable) state.unassignedOrderableCount += 1
    return
  }

  if (cat) bumpNestedCount(state.categoryCountsBySupplier, supplierId, cat, 1)
  if (pairKey) bumpNestedCount(state.pairCountsBySupplier, supplierId, pairKey, 1)
  if (orderable) {
    if (cat) bumpNestedCount(state.categoryCountsBySupplierOrderable, supplierId, cat, 1)
    if (pairKey) bumpNestedCount(state.pairCountsBySupplierOrderable, supplierId, pairKey, 1)
  }

  let summary = state.suppliers.get(supplierId)
  if (!summary) {
    summary = emptySupplierSummary(supplierId, supplierName)
    state.suppliers.set(supplierId, summary)
  } else if (supplierName && summary.name === summary.id) {
    summary.name = supplierName
  } else if (supplierName && !summary.name) {
    summary.name = supplierName
  }

  if (!orderable) return

  summary.orderablePositions += 1
  summary.totalQty += qty
  if (generatedId) {
    summary.generatedPositions += 1
    if (!summary.generatedOrderId) summary.generatedOrderId = generatedId
  } else {
    summary.pendingPositions += 1
    summary.pendingQty += qty
  }
}

/** @param {object} summary */
export function getSupplierPlanningStatus(summary) {
  if (isSupplierOrderCreated(summary)) return 'created'
  if ((summary?.orderablePositions || 0) > 0 || (summary?.pendingPositions || 0) > 0) {
    return 'draft'
  }
  return 'empty'
}

function recomputeSupplierAggregates(suppliers, unassignedOrderableCount = 0) {
  let generatedSupplierCount = 0
  let pendingSupplierCount = 0
  let inconsistentSupplierCount = 0

  const nextSuppliers = (suppliers || []).map((summary) => {
    const planningStatus = getSupplierPlanningStatus(summary)
    if (planningStatus === 'created') generatedSupplierCount += 1
    if (planningStatus === 'draft') pendingSupplierCount += 1
    if (isSupplierInconsistent(summary)) inconsistentSupplierCount += 1
    return { ...summary, planningStatus }
  })

  return {
    suppliers: nextSuppliers,
    generatedSupplierCount,
    pendingSupplierCount,
    inconsistentSupplierCount,
    unassignedOrderableCount,
  }
}

/**
 * Finalize accumulator into filter options + global progress counters.
 * @param {ReturnType<typeof createSnapshotFilterAccumulator>} state
 */
export function finalizeSnapshotFilterOptions(state) {
  const categoryCounts = { ...(Object.fromEntries(state.categoryCounts || [])) }
  const pairCounts = { ...(Object.fromEntries(state.pairCounts || [])) }
  const categoryCountsOrderable = {
    ...(Object.fromEntries(state.categoryCountsOrderable || [])),
  }
  const pairCountsOrderable = {
    ...(Object.fromEntries(state.pairCountsOrderable || [])),
  }
  const categoryCountsBySupplier = nestedMapsToObject(state.categoryCountsBySupplier)
  const pairCountsBySupplier = nestedMapsToObject(state.pairCountsBySupplier)
  const categoryCountsBySupplierOrderable = nestedMapsToObject(
    state.categoryCountsBySupplierOrderable
  )
  const pairCountsBySupplierOrderable = nestedMapsToObject(
    state.pairCountsBySupplierOrderable
  )
  const categorySubcategories = [...state.pairs]
    .map((key) => {
      const [categoryName, subcategoryName] = key.split('\u0000')
      return {
        categoryName,
        subcategoryName,
        itemCount: pairCounts[key] || 0,
      }
    })
    .sort((a, b) => {
      const catCmp = a.categoryName.localeCompare(b.categoryName, 'ru')
      if (catCmp !== 0) return catCmp
      return a.subcategoryName.localeCompare(b.subcategoryName, 'ru')
    })

  const aggregates = recomputeSupplierAggregates(
    [...state.suppliers.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    state.unassignedOrderableCount
  )

  return {
    categories: [...state.categories].sort((a, b) => a.localeCompare(b, 'ru')),
    categorySubcategories,
    categoryCounts,
    pairCounts,
    categoryCountsOrderable,
    pairCountsOrderable,
    categoryCountsBySupplier,
    pairCountsBySupplier,
    categoryCountsBySupplierOrderable,
    pairCountsBySupplierOrderable,
    ...aggregates,
  }
}

/* -------------------------------------------------------------------------- */
/* Compact planner header (snapshot line + action chips next to the page tabs)  */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Idempotency: one attempt key per submission                                  */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* In-table category tree (lazy expand) — supplier-scoped counts (PR1)         */
/* -------------------------------------------------------------------------- */

export { positiveQty }
