/**
 * Planner ABC display + query helpers. Classification itself lives in the
 * umag-procurement helper and is applied at snapshot insert.
 */

export const ABC_CLASSES = Object.freeze(['A', 'B', 'C'])

export const ABC_AXES = Object.freeze([
  { key: 'qty', filterKey: 'abcQty', column: 'abc_qty', itemKey: 'abcQty', label: 'Количество' },
  { key: 'revenue', filterKey: 'abcRevenue', column: 'abc_revenue', itemKey: 'abcRevenue', label: 'Выручка' },
  { key: 'profit', filterKey: 'abcProfit', column: 'abc_profit', itemKey: 'abcProfit', label: 'Прибыль' },
])

export const ABC_SORT_FIELDS = Object.freeze(['abc_qty', 'abc_revenue', 'abc_profit'])

export const ABC_NULL_DISPLAY = '—'

export function normalizeAbcClass(value) {
  const cls = String(value || '').trim().toUpperCase()
  return cls === 'A' || cls === 'B' || cls === 'C' ? cls : null
}

export function normalizeAbcClassList(value) {
  const list = Array.isArray(value) ? value : value == null || value === '' ? [] : [value]
  const out = []
  for (const item of list) {
    const cls = normalizeAbcClass(item)
    if (cls && !out.includes(cls)) out.push(cls)
  }
  return out
}

export function formatAbcClass(value) {
  return normalizeAbcClass(value) || ABC_NULL_DISPLAY
}

export function abcBadgeLabel(axisLabel, value) {
  const cls = normalizeAbcClass(value)
  return cls ? `${axisLabel}: ${cls}` : `${axisLabel}: нет класса`
}

export function toggleAbcClassFilter(current, cls) {
  const next = normalizeAbcClassList(current)
  const value = normalizeAbcClass(cls)
  if (!value) return next
  const index = next.indexOf(value)
  if (index >= 0) next.splice(index, 1)
  else next.push(value)
  return next
}

export function resolveAbcSort(sortField, sortDir) {
  const field = ABC_SORT_FIELDS.includes(sortField) ? sortField : ''
  const dir = sortDir === 'desc' ? 'desc' : 'asc'
  return { field, dir }
}

export function nextAbcSortState(current, field) {
  const resolved = resolveAbcSort(field, 'asc')
  if (!resolved.field) return { field: '', dir: 'asc' }
  if (current?.field !== resolved.field) return { field: resolved.field, dir: 'asc' }
  if (current.dir === 'asc') return { field: resolved.field, dir: 'desc' }
  return { field: '', dir: 'asc' }
}

export function abcSortAriaLabel(axisLabel, current, field) {
  if (current?.field !== field) return `Сортировка по ABC ${axisLabel}`
  if (current.dir === 'asc') return `ABC ${axisLabel}: по возрастанию`
  return `ABC ${axisLabel}: по убыванию`
}

function itemClass(item, itemKey) {
  return normalizeAbcClass(item?.[itemKey])
}

/** OR inside an axis, AND across axes. Empty group = no restriction. */
export function snapshotItemMatchesAbcFilters(item, filters = {}) {
  for (const axis of ABC_AXES) {
    const selected = normalizeAbcClassList(filters[axis.filterKey])
    if (!selected.length) continue
    if (!selected.includes(itemClass(item, axis.itemKey))) return false
  }
  return true
}

function compareText(a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function compareSnapshotItems(a, b, sortField, sortDir) {
  const sort = resolveAbcSort(sortField, sortDir)
  if (sort.field) {
    const axis = ABC_AXES.find((item) => item.column === sort.field)
    const av = axis ? itemClass(a, axis.itemKey) : null
    const bv = axis ? itemClass(b, axis.itemKey) : null
    if (av == null && bv == null) {
      return compareText(String(a?.barcode || ''), String(b?.barcode || ''))
    }
    if (av == null) return 1
    if (bv == null) return -1
    const classCmp = compareText(av, bv)
    if (classCmp !== 0) return sort.dir === 'asc' ? classCmp : -classCmp
    return compareText(String(a?.barcode || ''), String(b?.barcode || ''))
  }

  const cat = compareText(String(a?.categoryName || ''), String(b?.categoryName || ''))
  if (cat !== 0) return cat
  const sub = compareText(String(a?.subcategoryName || ''), String(b?.subcategoryName || ''))
  if (sub !== 0) return sub
  return compareText(String(a?.productName || ''), String(b?.productName || ''))
}

export function paginateSnapshotItems(items, { page = 1, pageSize = 25, filters = {}, sortField = '', sortDir = 'asc' } = {}) {
  const matched = (Array.isArray(items) ? items : []).filter((item) =>
    snapshotItemMatchesAbcFilters(item, filters)
  )
  const sorted = matched.slice().sort((a, b) => compareSnapshotItems(a, b, sortField, sortDir))
  const size = Math.max(1, Number(pageSize) || 25)
  const currentPage = Math.max(1, Number(page) || 1)
  const from = (currentPage - 1) * size
  return {
    items: sorted.slice(from, from + size),
    totalCount: sorted.length,
    page: currentPage,
    pageSize: size,
  }
}

/**
 * Whitelisted PostgREST ABC plan. Callers must not interpolate user strings
 * into filter syntax — only these columns and A/B/C values.
 */
export function describeSnapshotItemsAbcQuery({
  abcQty = [],
  abcRevenue = [],
  abcProfit = [],
  sortField = '',
  sortDir = 'asc',
} = {}) {
  const filtersByKey = { abcQty, abcRevenue, abcProfit }
  const inFilters = []
  for (const axis of ABC_AXES) {
    const selected = normalizeAbcClassList(filtersByKey[axis.filterKey])
    if (selected.length) inFilters.push({ column: axis.column, values: selected })
  }
  const sort = resolveAbcSort(sortField, sortDir)
  const orders = sort.field
    ? [
        { field: sort.field, ascending: sort.dir === 'asc', nullsFirst: false },
        { field: 'barcode', ascending: true },
      ]
    : [
        { field: 'category_name', ascending: true },
        { field: 'subcategory_name', ascending: true },
        { field: 'product_name', ascending: true },
      ]
  return { inFilters, orders, sort }
}

/** Inclusive PostgREST range for exact count + page slices (UI default is 25). */
export function snapshotItemsPageRange(page = 1, pageSize = 25) {
  const size = Math.max(1, Number(pageSize) || 25)
  const current = Math.max(1, Number(page) || 1)
  const from = (current - 1) * size
  return { from, to: from + size - 1, page: current, pageSize: size }
}

export const ABC_UNAVAILABLE_NOTICE =
  'ABC недоступен для этого снимка — выполните синхронизацию UMAG.'

function itemHasAbcClass(item) {
  return Boolean(
    normalizeAbcClass(item?.abcQty) ||
      normalizeAbcClass(item?.abcRevenue) ||
      normalizeAbcClass(item?.abcProfit)
  )
}

/** Snapshot-level: loaded rows exist and none have abc_qty / abc_revenue / abc_profit. */
export function snapshotItemsLackAbcFacts(items) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return false
  return !list.some((item) => itemHasAbcClass(item))
}
