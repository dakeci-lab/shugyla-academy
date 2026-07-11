import { PURCHASE_PERIOD_PRESET } from './purchaseFilter'
import { getSupplierByIdSync } from './supplierData'

const PERIOD_SUMMARY_LABELS = {
  [PURCHASE_PERIOD_PRESET.TODAY]: 'Сегодня',
  [PURCHASE_PERIOD_PRESET.WEEK]: 'Неделя',
  [PURCHASE_PERIOD_PRESET.MONTH]: 'Месяц',
  [PURCHASE_PERIOD_PRESET.ALL]: 'Все',
  [PURCHASE_PERIOD_PRESET.CUSTOM]: 'Период',
}

/** Краткие подписи активных фильтров для мобильной строки */
export function formatPurchaseFilterSummary(filters) {
  if (!filters) return []

  const chips = []

  if (filters.periodPreset === PURCHASE_PERIOD_PRESET.CUSTOM) {
    if (filters.dateFrom && filters.dateTo && filters.dateFrom !== filters.dateTo) {
      chips.push(`${filters.dateFrom} – ${filters.dateTo}`)
    } else if (filters.dateFrom || filters.dateTo) {
      chips.push(filters.dateFrom || filters.dateTo)
    } else {
      chips.push('Период')
    }
  } else {
    chips.push(PERIOD_SUMMARY_LABELS[filters.periodPreset] || 'Период')
  }

  if (filters.supplierId) {
    const supplier = getSupplierByIdSync(filters.supplierId)
    chips.push(supplier?.name || 'Поставщик')
  }

  return chips
}
