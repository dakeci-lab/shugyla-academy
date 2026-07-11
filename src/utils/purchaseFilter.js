import {
  buildWeekDates,
  getMondayOfWeek,
  toDateKey,
} from './shiftData'

export const PURCHASE_PERIOD_PRESET = {
  ALL: 'all',
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
  CUSTOM: 'custom',
}

export const EMPTY_PURCHASE_FILTERS = {
  periodPreset: PURCHASE_PERIOD_PRESET.ALL,
  dateFrom: '',
  dateTo: '',
  supplierId: '',
}

/** Фильтр по умолчанию при открытии страницы «Закуп» — только сегодня */
export function createDefaultPurchaseFilters() {
  const dates = getPurchasePeriodDraftDates(PURCHASE_PERIOD_PRESET.TODAY)
  return {
    periodPreset: PURCHASE_PERIOD_PRESET.TODAY,
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    supplierId: '',
  }
}

export const PURCHASE_PAGE_SIZE = 25

function getWeekRange(date = new Date()) {
  const mondayKey = toDateKey(getMondayOfWeek(date))
  const dates = buildWeekDates(mondayKey)
  return {
    dateFrom: toDateKey(dates[0]),
    dateTo: toDateKey(dates[6]),
  }
}

function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return {
    dateFrom: toDateKey(start),
    dateTo: toDateKey(end),
  }
}

export function resolvePurchasePeriodRange(filters) {
  if (!filters) return null

  const { periodPreset, dateFrom, dateTo } = filters

  if (periodPreset === PURCHASE_PERIOD_PRESET.TODAY) {
    const today = toDateKey(new Date())
    return { dateFrom: today, dateTo: today }
  }

  if (periodPreset === PURCHASE_PERIOD_PRESET.WEEK) {
    return getWeekRange(new Date())
  }

  if (periodPreset === PURCHASE_PERIOD_PRESET.MONTH) {
    return getMonthRange(new Date())
  }

  if (periodPreset === PURCHASE_PERIOD_PRESET.CUSTOM) {
    if (dateFrom && dateTo) return { dateFrom, dateTo }
    if (dateFrom) return { dateFrom, dateTo: dateFrom }
    if (dateTo) return { dateFrom: dateTo, dateTo }
  }

  if (dateFrom || dateTo) {
    return {
      dateFrom: dateFrom || dateTo,
      dateTo: dateTo || dateFrom,
    }
  }

  return null
}

export function getPurchasePeriodDraftDates(preset) {
  if (preset === PURCHASE_PERIOD_PRESET.TODAY) {
    const today = toDateKey(new Date())
    return { dateFrom: today, dateTo: today }
  }
  if (preset === PURCHASE_PERIOD_PRESET.WEEK) {
    return getWeekRange(new Date())
  }
  if (preset === PURCHASE_PERIOD_PRESET.MONTH) {
    return getMonthRange(new Date())
  }
  return { dateFrom: '', dateTo: '' }
}

export function hasActivePurchaseFilters(filters) {
  if (!filters) return false
  if (filters.supplierId) return true
  if (filters.periodPreset !== PURCHASE_PERIOD_PRESET.TODAY) return true

  const today = getPurchasePeriodDraftDates(PURCHASE_PERIOD_PRESET.TODAY)
  if (filters.dateFrom !== today.dateFrom || filters.dateTo !== today.dateTo) {
    return true
  }

  return false
}

export function filterPurchaseOrders(orders, filters) {
  let result = orders || []

  const range = resolvePurchasePeriodRange(filters)
  if (range) {
    result = result.filter((order) => {
      const dateKey = order.expectedDeliveryDate
      if (!dateKey) return false
      return dateKey >= range.dateFrom && dateKey <= range.dateTo
    })
  }

  if (filters?.supplierId) {
    result = result.filter((order) => order.supplierId === filters.supplierId)
  }

  return result
}

export function calcPurchaseTotals(orders) {
  const list = orders || []
  const totalAmount = list.reduce(
    (sum, order) => sum + (Number(order.totalAmount) || 0),
    0
  )
  return {
    count: list.length,
    totalAmount,
  }
}

export function paginateItems(items, page, pageSize = PURCHASE_PAGE_SIZE) {
  const safePage = Math.max(1, page)
  const start = (safePage - 1) * pageSize
  return items.slice(start, start + pageSize)
}

export function getPaginationMeta(totalCount, page, pageSize = PURCHASE_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const from = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = totalCount === 0 ? 0 : Math.min(safePage * pageSize, totalCount)
  return { totalPages, safePage, from, to }
}
