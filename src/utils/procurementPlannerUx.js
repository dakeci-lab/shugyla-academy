/**
 * Pure UX helpers for the procurement planner (summaries, workflow, guards).
 */

import { computeAttemptPayloadFingerprint } from './procurementAttemptFingerprint.js'
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

const DOCUMENT_FORMS = ['документ', 'документа', 'документов']
const POSITION_FORMS = ['позиция', 'позиции', 'позиций']

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

function cloneNestedCountObject(value) {
  const out = {}
  for (const [outerKey, inner] of Object.entries(value || {})) {
    out[outerKey] = { ...(inner || {}) }
  }
  return out
}

function bumpPlainCount(mapObj, key, delta = 1) {
  if (!key) return
  const next = Math.max(0, (mapObj[key] || 0) + delta)
  if (next <= 0) delete mapObj[key]
  else mapObj[key] = next
}

function bumpNestedPlainCount(rootObj, outerKey, innerKey, delta = 1) {
  if (!outerKey || !innerKey) return
  if (!rootObj[outerKey]) rootObj[outerKey] = {}
  const next = Math.max(0, (rootObj[outerKey][innerKey] || 0) + delta)
  if (next <= 0) delete rootObj[outerKey][innerKey]
  else rootObj[outerKey][innerKey] = next
  if (Object.keys(rootObj[outerKey]).length === 0) delete rootObj[outerKey]
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

export const SUPPLIER_PLANNING_STATUS_LABELS = {
  created: 'создан',
  draft: 'черновик',
  empty: 'нет позиций',
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

/** Normalize an item/row into a contribution used by summary deltas. */
export function getItemSummaryContribution(item) {
  const supplierId = supplierIdOf(item)
  const qty = qtyOf(item)
  const generatedId = generatedIdOf(item)
  const categoryName = item?.category_name || item?.categoryName || ''
  const subcategoryName = item?.subcategory_name || item?.subcategoryName || ''
  return {
    supplierId,
    supplierName: supplierNameOf(item, supplierId || ''),
    qty,
    orderable: qty > 0,
    generatedId: generatedId || null,
    categoryName,
    subcategoryName,
  }
}

function cloneFilterOptions(filterOptions) {
  return {
    categories: [...(filterOptions?.categories || [])],
    categorySubcategories: [...(filterOptions?.categorySubcategories || [])],
    categoryCounts: { ...(filterOptions?.categoryCounts || {}) },
    pairCounts: { ...(filterOptions?.pairCounts || {}) },
    categoryCountsOrderable: { ...(filterOptions?.categoryCountsOrderable || {}) },
    pairCountsOrderable: { ...(filterOptions?.pairCountsOrderable || {}) },
    categoryCountsBySupplier: cloneNestedCountObject(
      filterOptions?.categoryCountsBySupplier
    ),
    pairCountsBySupplier: cloneNestedCountObject(filterOptions?.pairCountsBySupplier),
    categoryCountsBySupplierOrderable: cloneNestedCountObject(
      filterOptions?.categoryCountsBySupplierOrderable
    ),
    pairCountsBySupplierOrderable: cloneNestedCountObject(
      filterOptions?.pairCountsBySupplierOrderable
    ),
    suppliers: (filterOptions?.suppliers || []).map((s) => ({ ...s })),
    generatedSupplierCount: filterOptions?.generatedSupplierCount || 0,
    pendingSupplierCount: filterOptions?.pendingSupplierCount || 0,
    inconsistentSupplierCount: filterOptions?.inconsistentSupplierCount || 0,
    unassignedOrderableCount: filterOptions?.unassignedOrderableCount || 0,
  }
}

function applyOrderableCategoryDelta(options, contribution, sign) {
  if (!contribution?.orderable) return
  const delta = sign >= 0 ? 1 : -1
  const cat = contribution.categoryName || ''
  const sub = contribution.subcategoryName || ''
  const pairKey = cat && sub ? `${cat}\u0000${sub}` : ''
  if (cat) bumpPlainCount(options.categoryCountsOrderable, cat, delta)
  if (pairKey) bumpPlainCount(options.pairCountsOrderable, pairKey, delta)
  if (contribution.supplierId) {
    if (cat) {
      bumpNestedPlainCount(
        options.categoryCountsBySupplierOrderable,
        contribution.supplierId,
        cat,
        delta
      )
    }
    if (pairKey) {
      bumpNestedPlainCount(
        options.pairCountsBySupplierOrderable,
        contribution.supplierId,
        pairKey,
        delta
      )
    }
  }
}

function applyContribution(options, contribution, sign) {
  const delta = sign >= 0 ? 1 : -1
  applyOrderableCategoryDelta(options, contribution, sign)

  if (!contribution?.supplierId) {
    if (contribution?.orderable) {
      options.unassignedOrderableCount = Math.max(
        0,
        (options.unassignedOrderableCount || 0) + delta
      )
    }
    return
  }

  let summary = options.suppliers.find((s) => s.id === contribution.supplierId)
  if (!summary) {
    if (sign < 0) return
    summary = emptySupplierSummary(contribution.supplierId, contribution.supplierName)
    options.suppliers.push(summary)
  } else if (contribution.supplierName && (!summary.name || summary.name === summary.id)) {
    summary.name = contribution.supplierName
  }

  if (!contribution.orderable) return

  summary.orderablePositions = Math.max(0, (summary.orderablePositions || 0) + delta)
  summary.totalQty = Math.max(0, finiteNumber(summary.totalQty, 0) + delta * contribution.qty)

  if (contribution.generatedId) {
    summary.generatedPositions = Math.max(0, (summary.generatedPositions || 0) + delta)
    if (sign > 0) {
      if (!summary.generatedOrderId) summary.generatedOrderId = contribution.generatedId
    } else if (summary.generatedPositions === 0) {
      summary.generatedOrderId = null
    }
  } else {
    summary.pendingPositions = Math.max(0, (summary.pendingPositions || 0) + delta)
    summary.pendingQty = Math.max(
      0,
      finiteNumber(summary.pendingQty, 0) + delta * contribution.qty
    )
  }
}

/**
 * Apply old→new item delta to filter options without a full snapshot scan.
 * @param {object} filterOptions
 * @param {object} oldItem
 * @param {object} newItem
 */
export function applyItemDeltaToFilterOptions(filterOptions, oldItem, newItem) {
  const next = cloneFilterOptions(filterOptions)
  applyContribution(next, getItemSummaryContribution(oldItem), -1)
  applyContribution(next, getItemSummaryContribution(newItem), +1)

  const aggregates = recomputeSupplierAggregates(
    next.suppliers.sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    next.unassignedOrderableCount
  )

  return {
    categories: next.categories,
    categorySubcategories: next.categorySubcategories,
    categoryCounts: next.categoryCounts,
    pairCounts: next.pairCounts,
    categoryCountsOrderable: next.categoryCountsOrderable,
    pairCountsOrderable: next.pairCountsOrderable,
    categoryCountsBySupplier: next.categoryCountsBySupplier,
    pairCountsBySupplier: next.pairCountsBySupplier,
    categoryCountsBySupplierOrderable: next.categoryCountsBySupplierOrderable,
    pairCountsBySupplierOrderable: next.pairCountsBySupplierOrderable,
    ...aggregates,
  }
}

const APP_TZ_WEEKDAY_SHORT_TO_ID = Object.freeze({
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
})

/** Weekday id (sun..sat) for a date in Asia/Almaty (or injected timeZone). */
export function getAppTimezoneWeekdayId(date = new Date(), timeZone = 'Asia/Almaty') {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date)
  return APP_TZ_WEEKDAY_SHORT_TO_ID[short] || null
}

/** Normalize supplier name for legacy id↔name matching. */
export function normalizeSupplierMatchName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Unique active suppliers whose order day is today (orderWeekdays).
 * Empty orderWeekdays → excluded; no fallback to deliveryWeekdays.
 * @param {Array<object>} suppliers
 * @param {{ now?: Date, weekdayId?: string|null, timeZone?: string }} [options]
 */
export function listTodaysOrderSuppliers(
  suppliers,
  { now = new Date(), weekdayId = null, timeZone = 'Asia/Almaty' } = {}
) {
  const dayId = weekdayId || getAppTimezoneWeekdayId(now, timeZone)
  if (!dayId) return []

  const seen = new Set()
  const result = []
  for (const supplier of suppliers || []) {
    if (!supplier?.id || seen.has(supplier.id)) continue
    if (supplier.status !== 'active') continue
    if (
      !Array.isArray(supplier.orderWeekdays) ||
      !supplier.orderWeekdays.includes(dayId)
    ) {
      continue
    }
    seen.add(supplier.id)
    result.push(supplier)
  }
  return result
}

function buildSnapshotSupplierLookups(snapshotSuppliers) {
  const byId = new Map()
  const byName = new Map()
  for (const summary of snapshotSuppliers || []) {
    if (summary?.id) byId.set(summary.id, summary)
    const name = normalizeSupplierMatchName(summary?.name)
    if (name && !byName.has(name)) byName.set(name, summary)
  }
  return { byId, byName }
}

function findSnapshotSummaryForSupplier(supplier, lookups) {
  if (!supplier) return null
  if (supplier.id && lookups.byId.has(supplier.id)) {
    return lookups.byId.get(supplier.id)
  }
  const name = normalizeSupplierMatchName(supplier.name)
  if (name && lookups.byName.has(name)) return lookups.byName.get(name)
  return null
}

function mergeSupplierSelectRow(base, summary) {
  const id = base?.id || summary?.id
  const name = base?.name || summary?.name || id || ''
  const merged = {
    ...(summary || emptySupplierSummary(id, name)),
    id,
    name,
    status: base?.status || 'active',
  }
  if (base && Object.prototype.hasOwnProperty.call(base, 'linkedToUmag')) {
    merged.linkedToUmag = base.linkedToUmag
  }
  if (base && Object.prototype.hasOwnProperty.call(base, 'isUmagActive')) {
    merged.isUmagActive = base.isUmagActive
  }
  return merged
}

function sortSupplierSelectRows(rows) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

/**
 * Build supplier rows for the planner selector.
 * - today: active suppliers with order day = today (even without snapshot rows);
 *   `scheduledSuppliers` is the result of `listTodaysOrderSuppliers`
 * - all: active catalog enriched with snapshot + leftover snapshot-only legacy rows
 */
export function buildPlannerSupplierSelectOptions({
  scope = 'today',
  scheduledSuppliers = [],
  catalogSuppliers = [],
  snapshotSuppliers = [],
} = {}) {
  const lookups = buildSnapshotSupplierLookups(snapshotSuppliers)

  if (scope === 'today') {
    return sortSupplierSelectRows(
      (scheduledSuppliers || [])
        .filter((supplier) => supplier?.id)
        .map((supplier) =>
          mergeSupplierSelectRow(supplier, findSnapshotSummaryForSupplier(supplier, lookups))
        )
    )
  }

  const rows = []
  const seenIds = new Set()
  const seenNames = new Set()
  const consumedSummaryIds = new Set()

  for (const supplier of catalogSuppliers || []) {
    if (!supplier?.id || supplier.isMerged) continue
    if (supplier.status !== 'active') continue
    if (seenIds.has(supplier.id)) continue
    const summary = findSnapshotSummaryForSupplier(supplier, lookups)
    if (summary?.id) consumedSummaryIds.add(summary.id)
    const row = mergeSupplierSelectRow(supplier, summary)
    seenIds.add(row.id)
    const nameKey = normalizeSupplierMatchName(row.name)
    if (nameKey) seenNames.add(nameKey)
    rows.push(row)
  }

  for (const summary of snapshotSuppliers || []) {
    if (!summary?.id || consumedSummaryIds.has(summary.id) || seenIds.has(summary.id)) continue
    const nameKey = normalizeSupplierMatchName(summary.name)
    if (nameKey && seenNames.has(nameKey)) continue
    seenIds.add(summary.id)
    if (nameKey) seenNames.add(nameKey)
    rows.push(mergeSupplierSelectRow({ id: summary.id, name: summary.name, status: 'active' }, summary))
  }

  return sortSupplierSelectRows(rows)
}

/**
 * Whether a selected supplier id belongs to today's order-day list.
 * @param {string} supplierId
 * @param {Array<object>} scheduledSuppliers result of `listTodaysOrderSuppliers`
 * @param {Array<object>} [snapshotSuppliers]
 */
export function isSupplierInTodaysOrderList(
  supplierId,
  scheduledSuppliers = [],
  snapshotSuppliers = []
) {
  if (!supplierId) return false
  if ((scheduledSuppliers || []).some((supplier) => supplier?.id === supplierId)) return true

  const summary = (snapshotSuppliers || []).find((row) => row?.id === supplierId)
  if (!summary) return false
  const nameKey = normalizeSupplierMatchName(summary.name)
  if (!nameKey) return false
  return (scheduledSuppliers || []).some(
    (supplier) => normalizeSupplierMatchName(supplier?.name) === nameKey
  )
}

function formatQtyLabel(value) {
  const qty = finiteNumber(value, 0)
  return Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100)
}

/**
 * Positions of the selected supplier that are ready to go into the *next* order,
 * i.e. rows carrying a positive qty.
 *
 * Deliberately based on `orderablePositions` rather than `pendingPositions`:
 * a supplier that already received an order may be ordered again, and on the legacy
 * backend contract (qty is kept on the row and only tagged with a generated order id)
 * `pendingPositions` collapses to 0 right after the first order and would block
 * every repeat.
 */
export function getNextOrderPositions(summary) {
  return Math.max(0, Math.round(finiteNumber(summary?.orderablePositions, 0)))
}

/**
 * Positions that are drafted but not yet in any order — what the workflow line calls
 * «Черновик».
 *
 * For a supplier without an order this is simply every positive-qty row. Once an order
 * exists, only the rows that are not tagged with an order id are a new draft, so the
 * strip does not claim a draft for quantities that have already been sent.
 */
export function getDraftPositions(summary) {
  if (!isSupplierOrderCreated(summary)) return getNextOrderPositions(summary)
  return Math.max(0, Math.round(finiteNumber(summary?.pendingPositions, 0)))
}

/**
 * Qty behind getDraftPositions, or null when it cannot be known.
 *
 * `pendingQty` is a newer field on the supplier summary; a summary restored from an
 * older cached bundle simply does not carry it. In that case the strip drops the qty
 * from the label rather than printing a number it cannot back up.
 */
export function getDraftQty(summary) {
  if (!isSupplierOrderCreated(summary)) return finiteNumber(summary?.totalQty, 0)
  if (summary?.pendingQty == null) return null
  return finiteNumber(summary.pendingQty, 0)
}

/**
 * Compact workflow strip for the selected supplier.
 *
 * Returns `label: null` when there is nothing worth a line of screen — the supplier
 * placeholder in the toolbar already says «Выберите поставщика», so the planner does
 * not repeat it as a separate step.
 *
 * @returns {{ step: string, label: string|null, orderId?: string|null, historyLabel?: string|null }}
 */
export function getSupplierWorkflowStatus({
  supplierId = '',
  summary = null,
} = {}) {
  if (!supplierId) {
    return { step: 'select_supplier', label: null, orderId: null, historyLabel: null }
  }

  const draft = getDraftPositions(summary)
  const orderId = summary?.generatedOrderId || null
  const ordered = isSupplierOrderCreated(summary)
  const orderedPositions = Math.max(0, Math.round(finiteNumber(summary?.generatedPositions, 0)))
  const historyLabel = ordered
    ? `Уже заказано: ${orderedPositions} ${pluralizeRu(orderedPositions, POSITION_FORMS)}`
    : null

  if (draft === 0) {
    return {
      step: ordered ? 'ordered' : 'enter_qty',
      label: ordered ? 'Заказ отправлен · можно заказать ещё' : 'Укажите количество',
      orderId: ordered ? orderId : null,
      historyLabel: null,
    }
  }

  const draftQty = getDraftQty(summary)
  const qtyPart = draftQty == null ? '' : ` · ${formatQtyLabel(draftQty)} шт.`

  return {
    step: 'draft',
    label: `Черновик · ${draft} ${pluralizeRu(draft, POSITION_FORMS)}${qtyPart}`,
    orderId: ordered ? orderId : null,
    historyLabel,
  }
}

/**
 * Reason why create is disabled, or null when enabled.
 *
 * Only real blockers belong here: permissions, a snapshot that cannot be written to,
 * an in-flight save/generation, and the absence of a positive qty. An existing order
 * for the same supplier is explicitly NOT a blocker — repeat orders are a supported
 * flow and the server decides whether a second document is created.
 */
export function getCreateOrderDisabledReason({
  canGenerate = false,
  snapshotEditable = false,
  supplierId = '',
  summary = null,
  pendingSaveCount = 0,
  hasSaveError = false,
  generating = false,
} = {}) {
  if (!canGenerate) return 'Недостаточно прав для создания заказа'
  if (!snapshotEditable) return 'Снимок недоступен для формирования заказа'
  if (!supplierId) return 'Сначала выберите поставщика'
  if (generating) return 'Создание заказа выполняется…'
  if (pendingSaveCount > 0) return 'Дождитесь сохранения количества'
  if (hasSaveError) return 'Исправьте ошибку сохранения количества'
  if (getNextOrderPositions(summary) === 0) {
    return 'Укажите количество больше 0 хотя бы для одной позиции'
  }
  return null
}

/** Tooltip / aria for the create control. */
export function getCreateOrderTooltip({
  disabledReason = null,
  supplierName = '',
} = {}) {
  if (disabledReason) return disabledReason
  if (supplierName) return `Создать заказ для ${supplierName}`
  return 'Создать заказ'
}

/**
 * Reason why export is disabled, or null when enabled.
 */
export function getExportDisabledReason({
  snapshotId = '',
  snapshotStatus = '',
  supplierId = '',
  exporting = false,
  pendingSaveCount = 0,
  hasSaveError = false,
  summary = null,
} = {}) {
  if (!snapshotId) return 'Нет снимка для выгрузки'
  if (snapshotStatus === 'syncing') return 'Дождитесь окончания синхронизации'
  if (!supplierId) return 'Сначала выберите поставщика'
  if (pendingSaveCount > 0) return 'Дождитесь сохранения количества'
  if (hasSaveError) return 'Исправьте ошибку сохранения количества'
  if ((summary?.orderablePositions || 0) <= 0) {
    return 'Нет позиций с количеством для выгрузки'
  }
  if (exporting) return 'Выгрузка выполняется…'
  return null
}

export function getExportTooltip({
  disabledReason = null,
  orderCreated = false,
} = {}) {
  if (disabledReason) return disabledReason
  return orderCreated ? 'Скачать заказ: PDF или Excel' : 'Скачать план: PDF или Excel'
}

/**
 * True when the export would contain an already created order rather than a fresh plan.
 * A supplier with an order *and* new positive-qty rows is preparing a repeat order,
 * so the export is a plan again.
 */
export function isSupplierPlanExportOrder(summary) {
  return isSupplierOrderCreated(summary) && (summary?.pendingPositions || 0) === 0
}

export function getExportMenuLabel(orderCreated = false) {
  return orderCreated ? 'Скачать заказ' : 'Скачать план'
}

export const EMPTY_SUPPLIER_EXPORT_MESSAGE = 'Нет позиций заказа для выгрузки'

/**
 * Filter snapshot items for supplier-scoped PDF/Excel export.
 *
 * Draft first: whenever the supplier has positive-qty rows that are not yet in an
 * order, those rows *are* the export — that is what the user is about to send, even
 * if an earlier order already exists (repeat order). Only when there is no draft left
 * does the export fall back to the rows of the last generated order.
 *
 * @param {Array<object>} items
 * @param {object|null} summary
 * @returns {Array<object>}
 */
export function filterItemsForSupplierPlanExport(items, summary) {
  const list = Array.isArray(items) ? items : []
  const supplierId = summary?.id || null

  const scoped = list.filter((item) => {
    if (qtyOf(item) <= 0) return false
    if (supplierId && supplierIdOf(item) !== supplierId) return false
    return true
  })

  const draft = scoped.filter((item) => !generatedIdOf(item))
  if (draft.length > 0) return draft

  const orderId = summary?.generatedOrderId || null
  return scoped.filter((item) => {
    const generatedId = generatedIdOf(item)
    if (!generatedId) return false
    return orderId ? generatedId === orderId : true
  })
}

export function getSyncDisabledReason({
  canSync = false,
  syncing = false,
  pendingSaveCount = 0,
  hasSaveError = false,
} = {}) {
  if (!canSync) return 'Недостаточно прав для синхронизации'
  if (syncing) return 'Синхронизация UMAG выполняется'
  if (pendingSaveCount > 0) return 'Дождитесь сохранения количества'
  if (hasSaveError) return 'Исправьте ошибку сохранения количества'
  return null
}

export function getSyncTooltip({ disabledReason = null } = {}) {
  if (disabledReason) return disabledReason
  return 'Обновить остатки и продажи из UMAG'
}

/** Whether a create click may proceed (uses sync counters). */
export function canStartCreateOrder(args) {
  return getCreateOrderDisabledReason(args) == null
}

/** Concurrent save-error tracking: success clears only that SKU. */
export function createFailedSaveIds(initial = []) {
  return new Set(initial)
}

export function applySaveResultToFailedIds(failedIds, itemId, ok) {
  const next = new Set(failedIds || [])
  if (!itemId) return next
  if (ok) next.delete(itemId)
  else next.add(itemId)
  return next
}

export function hasFailedSaves(failedIds) {
  return (failedIds?.size || 0) > 0
}

/** Row lock helpers for one-order-per-supplier semantics. */
export function findSupplierSummary(filterOptions, supplierId) {
  if (!supplierId) return null
  return (filterOptions?.suppliers || []).find((s) => s.id === supplierId) || null
}

export const QUANTITY_REQUIRES_SUPPLIER_HINT = 'Выберите поставщика, чтобы задать количество'

/**
 * Количество можно править только когда в фильтре выбран поставщик и товар
 * принадлежит именно ему.
 *
 * Без выбранного поставщика правка бессмысленна и опасна: заказ формируется
 * по одному поставщику, а сохранение из общего списка уходит в снимок,
 * который потом никто не отправит. Плюс это защита от «залипшего» события
 * blur: пока пользователь менял фильтр, input мог остаться в старом состоянии.
 *
 * Уже созданный заказ (по строке или по поставщику) больше НЕ блокирует правку:
 * повторный заказ тому же поставщику — штатный сценарий. Всё, что относится к
 * прошлым заказам, показывается как история (см. getItemOrderHistory).
 */
export function canEditItemQuantity(item, { selectedSupplierId } = {}) {
  if (!item) return false
  if (!selectedSupplierId) return false
  return supplierIdOf(item) === selectedSupplierId
}

/** Qty stays writable after the first order: generated is a working snapshot, not a lock. */
export function isSnapshotQuantityEditable(status) {
  return status === 'ready' || status === 'partially_generated' || status === 'generated'
}

function firstFinite(...values) {
  for (const value of values) {
    if (value == null) continue
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Already-ordered history for one snapshot row.
 *
 * Prefers the backend aggregates when the row carries them:
 *   ordered_qty_total / orderedQtyTotal          — total qty already ordered for this SKU
 *   ordered_document_count / orderedDocumentCount — how many purchase orders contain it
 *
 * Falls back to what the legacy row can prove on its own: a
 * `generated_purchase_order_id` is a last-order pointer, so it proves one
 * document. It does *not* prove qty — after a successful generate the current
 * `final_order_qty` is the next draft (often 0) and must not be shown as history.
 *
 * @returns {{ qty: number, documents: number, orderId: string|null, source: 'aggregate'|'fallback' }}
 */
export function getItemOrderHistory(item) {
  const orderId = generatedIdOf(item)
  const aggregateQty = firstFinite(item?.ordered_qty_total, item?.orderedQtyTotal)
  const aggregateDocuments = firstFinite(
    item?.ordered_document_count,
    item?.orderedDocumentCount
  )

  if (aggregateQty != null || aggregateDocuments != null) {
    const qty = Math.max(0, aggregateQty ?? 0)
    const documents = Math.max(
      0,
      Math.round(aggregateDocuments ?? (qty > 0 ? 1 : 0))
    )
    return { qty, documents, orderId: orderId || null, source: 'aggregate' }
  }

  if (!orderId) return { qty: 0, documents: 0, orderId: null, source: 'fallback' }
  return { qty: 0, documents: 1, orderId, source: 'fallback' }
}

/** «Заказано · 2 документа», or null when there is no history to show. */
export function formatOrderHistoryLabel(history) {
  const documents = Math.max(0, Math.round(finiteNumber(history?.documents, 0)))
  if (documents <= 0) return null
  return `Заказано · ${documents} ${pluralizeRu(documents, DOCUMENT_FORMS)}`
}

/** Full-sentence title for the history line. */
export function formatOrderHistoryTitle(history) {
  const documents = Math.max(0, Math.round(finiteNumber(history?.documents, 0)))
  if (documents <= 0) return null
  const qty = finiteNumber(history?.qty, 0)
  if (qty > 0) {
    return `Ранее заказано: ${formatQtyLabel(qty)} шт. в ${documents} ${pluralizeRu(documents, DOCUMENT_FORMS)}`
  }
  return formatOrderHistoryLabel(history)
}

/**
 * Id of the next item after `fromId` (in list order) whose `isEditable`
 * predicate returns true, or null when there is none on this page.
 * Pure — used to drive Enter-to-next-quantity-input navigation.
 */
export function getNextEditableItemId(items, fromId, isEditable) {
  const list = Array.isArray(items) ? items : []
  const idx = list.findIndex((it) => it?.id === fromId)
  if (idx === -1) return null
  for (let i = idx + 1; i < list.length; i += 1) {
    if (isEditable(list[i])) return list[i].id
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Compact planner header (snapshot line + action chips next to the page tabs)  */
/* -------------------------------------------------------------------------- */

/**
 * One-line UMAG snapshot summary for the header strip.
 * Pure: the caller formats `syncedAtLabel` (timezone-aware) and passes it in.
 *
 * @returns {{ text: string, warnText: string|null, title: string }}
 */
export function buildSnapshotHeadline({
  hasSnapshot = false,
  status = '',
  syncedAtLabel = '',
  itemCount = 0,
  negativeStockCount = 0,
} = {}) {
  if (!hasSnapshot) {
    return {
      text: 'Нет снимка',
      warnText: null,
      title: 'Снимок UMAG ещё не создан — запустите синхронизацию',
    }
  }
  if (status === 'syncing') {
    return {
      text: 'Синхронизация…',
      warnText: null,
      title: 'Снимок UMAG: синхронизация выполняется',
    }
  }
  if (status === 'failed') {
    return {
      text: 'Ошибка синхронизации',
      warnText: null,
      title: 'Снимок UMAG: последняя синхронизация не удалась',
    }
  }

  const items = Math.max(0, Math.round(finiteNumber(itemCount, 0)))
  const negative = Math.max(0, Math.round(finiteNumber(negativeStockCount, 0)))
  const negativeTitle =
    negative > 0
      ? ` · ${negative} ${pluralizeRu(negative, POSITION_FORMS)} с отрицательным остатком`
      : ''

  return {
    text: `${syncedAtLabel} · ${items} SKU`,
    warnText: negative > 0 ? `${negative} отриц.` : null,
    title: `Снимок UMAG · Обновлён ${syncedAtLabel} · ${items} SKU${negativeTitle}`,
  }
}

/**
 * Compact action chips for the header strip. Only non-zero counters produce a chip —
 * nothing is rendered when the plan is clean.
 *
 * @returns {Array<{ id: string, label: string, count: number, title: string,
 *                   supplierIds?: string[] }>}
 */
export function getPlannerAlertChips({
  unassignedOrderableCount = 0,
  suppliers = [],
} = {}) {
  const chips = []

  const unassigned = Math.max(0, Math.round(finiteNumber(unassignedOrderableCount, 0)))
  if (unassigned > 0) {
    chips.push({
      id: 'unassigned',
      label: 'Без поставщика',
      count: unassigned,
      title: `${unassigned} ${pluralizeRu(unassigned, POSITION_FORMS)} с количеством к заказу без поставщика — показать их`,
    })
  }

  const inconsistent = (suppliers || []).filter((summary) => isSupplierInconsistent(summary))
  if (inconsistent.length > 0) {
    chips.push({
      id: 'inconsistent',
      label: 'Расхождения',
      count: inconsistent.length,
      supplierIds: inconsistent.map((summary) => summary.id).filter(Boolean),
      title: `Заказ создан, но остались позиции вне заказа: ${inconsistent
        .map((summary) => summary.name || summary.id)
        .join(', ')}`,
    })
  }

  return chips
}

/* -------------------------------------------------------------------------- */
/* Idempotency: one attempt key per submission                                  */
/* -------------------------------------------------------------------------- */

const ATTEMPT_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** RFC 4122 v4 UUID, with graceful degradation on old WebViews. */
export function defaultGenerateAttemptKey() {
  const webCrypto = globalThis.crypto
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

export function isValidAttemptKey(value) {
  return typeof value === 'string' && ATTEMPT_KEY_RE.test(value)
}

export const ORDER_ATTEMPT_OUTCOME = Object.freeze({
  /** Server accepted the submission (created or reported an existing order). */
  SUCCESS: 'success',
  /** Server answered with a definitive refusal — a new submission needs a new key. */
  REJECTED: 'rejected',
  /** No definitive answer (network/timeout/unknown) — a retry must reuse the key. */
  RETRYABLE: 'retryable',
})

/**
 * Error codes for which the server may still have created the order, so a retry has
 * to carry the same attempt key for the backend to deduplicate it.
 */
const RETRYABLE_GENERATE_CODES = new Set([
  'UMAG_NETWORK_ERROR',
  'UMAG_TIMEOUT',
  'GENERATE_FAILED',
  'UNKNOWN',
])

/** Map a generate result / thrown error onto an attempt outcome. */
export function classifyGenerateOutcome({ result = null, error = null } = {}) {
  if (error) return ORDER_ATTEMPT_OUTCOME.RETRYABLE
  if (!result) return ORDER_ATTEMPT_OUTCOME.RETRYABLE
  if (result.success === true) return ORDER_ATTEMPT_OUTCOME.SUCCESS
  return RETRYABLE_GENERATE_CODES.has(result.code)
    ? ORDER_ATTEMPT_OUTCOME.RETRYABLE
    : ORDER_ATTEMPT_OUTCOME.REJECTED
}

/**
 * Attempt-key lifecycle for order generation.
 *
 * - `begin(payload)` mints a key + fingerprint from the exact submit payload and
 *   returns the *same* pair while the attempt is unresolved.
 * - `settle(outcome)` clears both on SUCCESS/REJECTED and keeps them on RETRYABLE.
 * - `reset()` drops the pair when the user consciously abandons the submission.
 */
export function createOrderAttemptTracker(generateKey = defaultGenerateAttemptKey) {
  let current = null
  return {
    begin(payload) {
      if (!current) {
        current = {
          key: generateKey(),
          fingerprint: computeAttemptPayloadFingerprint(payload || {}),
        }
      }
      return current
    },
    peek() {
      return current
    },
    settle(outcome) {
      if (outcome !== ORDER_ATTEMPT_OUTCOME.RETRYABLE) current = null
      return current
    },
    reset() {
      current = null
      return null
    },
  }
}

/** Id of the first item whose `isEditable` predicate returns true, or null. */
export function getFirstEditableItemId(items, isEditable) {
  const list = Array.isArray(items) ? items : []
  const found = list.find((it) => isEditable(it))
  return found ? found.id : null
}

/* -------------------------------------------------------------------------- */
/* In-table category tree (lazy expand) — supplier-scoped counts (PR1)         */
/* -------------------------------------------------------------------------- */

/** Snapshot-wide counts label when no supplier is selected. */
export const PLANNER_CATEGORY_COUNTS_SCOPE_LABEL = 'по снимку'

/** Supplier-scoped counts label. */
export const PLANNER_CATEGORY_COUNTS_SUPPLIER_LABEL = 'у поставщика'

/** Default page size for SKU pages loaded inside an expanded tree branch. */
export const PLANNER_TREE_BRANCH_PAGE_SIZE = 50

export function plannerCategoryTreeKey(categoryName = '') {
  return `c:${categoryName || ''}`
}

export function plannerSubcategoryTreeKey(categoryName = '', subcategoryName = '') {
  return `s:${categoryName || ''}\u0000${subcategoryName || ''}`
}

/** Tree when idle; flat SKU list when searching or ABC-sorting. */
export function isPlannerTreeViewMode({ search = '', abcSortField = '' } = {}) {
  return !String(search || '').trim() && !abcSortField
}

/**
 * Honest scope label for tree group counts.
 * @returns {'по снимку'|'у поставщика'}
 */
export function getPlannerCategoryCountsScopeLabel({ platformSupplierId = '' } = {}) {
  return platformSupplierId
    ? PLANNER_CATEGORY_COUNTS_SUPPLIER_LABEL
    : PLANNER_CATEGORY_COUNTS_SCOPE_LABEL
}

/**
 * Chip «Только к заказу N»: snapshot-wide without supplier, else supplier orderablePositions.
 */
export function getOrderableChipCount({
  supplierId = '',
  summary = null,
  snapshotOrderableCount = 0,
} = {}) {
  if (supplierId) {
    return Math.max(0, Math.round(finiteNumber(summary?.orderablePositions, 0)))
  }
  return Math.max(0, Math.round(finiteNumber(snapshotOrderableCount, 0)))
}

/**
 * Pick category/pair count maps for tree nav.
 * Always returns both item counts (N) and orderable counts (M) for the active scope.
 * When orderableOnly — listing uses orderable maps (same predicate as leaf fetch).
 */
export function resolvePlannerCategoryCountMaps(
  filterOptions,
  { platformSupplierId = '', orderableOnly = false } = {}
) {
  const supplierId = String(platformSupplierId || '')
  if (supplierId) {
    const categoryCountsAll =
      filterOptions?.categoryCountsBySupplier?.[supplierId] || {}
    const pairCountsAll = filterOptions?.pairCountsBySupplier?.[supplierId] || {}
    const categoryCountsOrderable =
      filterOptions?.categoryCountsBySupplierOrderable?.[supplierId] || {}
    const pairCountsOrderable =
      filterOptions?.pairCountsBySupplierOrderable?.[supplierId] || {}
    if (orderableOnly) {
      return {
        categoryCounts: categoryCountsOrderable,
        pairCounts: pairCountsOrderable,
        categoryOrderableCounts: categoryCountsOrderable,
        pairOrderableCounts: pairCountsOrderable,
        hideZero: true,
      }
    }
    return {
      categoryCounts: categoryCountsAll,
      pairCounts: pairCountsAll,
      categoryOrderableCounts: categoryCountsOrderable,
      pairOrderableCounts: pairCountsOrderable,
      hideZero: true,
    }
  }

  const categoryCountsAll = filterOptions?.categoryCounts || {}
  const pairCountsAll = filterOptions?.pairCounts || {}
  const categoryCountsOrderable = filterOptions?.categoryCountsOrderable || {}
  const pairCountsOrderable = filterOptions?.pairCountsOrderable || {}
  if (orderableOnly) {
    return {
      categoryCounts: categoryCountsOrderable,
      pairCounts: pairCountsOrderable,
      categoryOrderableCounts: categoryCountsOrderable,
      pairOrderableCounts: pairCountsOrderable,
      hideZero: true,
    }
  }
  return {
    categoryCounts: categoryCountsAll,
    pairCounts: pairCountsAll,
    categoryOrderableCounts: categoryCountsOrderable,
    pairOrderableCounts: pairCountsOrderable,
    hideZero: false,
  }
}

/** Compact meta line for tree group rows: «N поз · M к заказу». */
export function formatPlannerTreeGroupMeta({
  itemCount = 0,
  orderableCount = 0,
} = {}) {
  const n = Math.max(0, Math.round(finiteNumber(itemCount, 0)))
  const m = Math.max(0, Math.round(finiteNumber(orderableCount, 0)))
  return `${n} поз · ${m} к заказу`
}

/**
 * Nav model: categories with itemCount (N) + orderableCount (M) + nested subs.
 * Counts from filterOptions scan aggregates — never page length.
 *
 * @param {object} filterOptions
 * @param {{ platformSupplierId?: string, orderableOnly?: boolean }} [scope]
 */
export function buildPlannerCategoryNavModel(
  filterOptions,
  { platformSupplierId = '', orderableOnly = false } = {}
) {
  const {
    categoryCounts,
    pairCounts,
    categoryOrderableCounts,
    pairOrderableCounts,
    hideZero,
  } = resolvePlannerCategoryCountMaps(filterOptions, {
    platformSupplierId,
    orderableOnly,
  })

  const categoryNames = Object.keys(categoryCounts || {}).sort((a, b) =>
    a.localeCompare(b, 'ru')
  )

  const model = categoryNames.map((categoryName) => {
    const subcategories = Object.keys(pairCounts || {})
      .filter((key) => key.startsWith(`${categoryName}\u0000`))
      .map((key) => {
        const subcategoryName = key.slice(categoryName.length + 1)
        return {
          categoryName,
          subcategoryName,
          itemCount: Math.max(0, Math.round(finiteNumber(pairCounts[key], 0))),
          orderableCount: Math.max(
            0,
            Math.round(finiteNumber(pairOrderableCounts?.[key], 0))
          ),
        }
      })
      .filter((sub) => !hideZero || sub.itemCount > 0)
      .sort((a, b) => a.subcategoryName.localeCompare(b.subcategoryName, 'ru'))

    return {
      categoryName,
      itemCount: Math.max(
        0,
        Math.round(finiteNumber(categoryCounts[categoryName], 0))
      ),
      orderableCount: Math.max(
        0,
        Math.round(finiteNumber(categoryOrderableCounts?.[categoryName], 0))
      ),
      subcategories,
    }
  })

  if (!hideZero) return model
  return model.filter((entry) => entry.itemCount > 0)
}

/**
 * Whether expanding a category should fetch SKUs immediately (0–1 subs)
 * or show collapsed subcategory rows first (>1 subs).
 */
export function plannerCategoryExpandsToSku(subcategoryCount = 0) {
  return Number(subcategoryCount) <= 1
}

/** @deprecated Counts are honest for supplier/orderable; kept for callers that still import it. */
export function plannerCategoryCountsNeedScopeNote({
  platformSupplierId = '',
  orderableOnly = false,
  search = '',
} = {}) {
  void platformSupplierId
  void orderableOnly
  void search
  return false
}

export { positiveQty }
