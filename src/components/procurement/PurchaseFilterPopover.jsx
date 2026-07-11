import { useEffect, useRef } from 'react'
import SearchableSupplierSelect from '../suppliers/SearchableSupplierSelect'
import {
  createDefaultPurchaseFilters,
  getPurchasePeriodDraftDates,
  PURCHASE_PERIOD_PRESET,
} from '../../utils/purchaseFilter'
import './PurchaseFilterPopover.css'

const PERIOD_PRESETS = [
  { id: PURCHASE_PERIOD_PRESET.TODAY, label: 'Сегодня' },
  { id: PURCHASE_PERIOD_PRESET.WEEK, label: 'Неделя' },
  { id: PURCHASE_PERIOD_PRESET.MONTH, label: 'Месяц' },
]

export default function PurchaseFilterPopover({
  open,
  draft,
  onChange,
  onApply,
  onReset,
  onClose,
  anchorRef,
}) {
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      const anchor = anchorRef?.current
      const popover = popoverRef.current
      if (!popover) return
      if (popover.contains(event.target)) return
      if (anchor?.contains(event.target)) return
      onClose?.()
    }

    function handleEscape(event) {
      if (event.key === 'Escape') onClose?.()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  function setDraft(next) {
    onChange?.(next)
  }

  function selectPreset(presetId) {
    const dates = getPurchasePeriodDraftDates(presetId)
    setDraft({
      ...draft,
      periodPreset: presetId,
      dateFrom: dates.dateFrom,
      dateTo: dates.dateTo,
    })
  }

  function updateDateFrom(value) {
    setDraft({
      ...draft,
      periodPreset: PURCHASE_PERIOD_PRESET.CUSTOM,
      dateFrom: value,
    })
  }

  function updateDateTo(value) {
    setDraft({
      ...draft,
      periodPreset: PURCHASE_PERIOD_PRESET.CUSTOM,
      dateTo: value,
    })
  }

  function handleReset() {
    onChange?.(createDefaultPurchaseFilters())
    onReset?.()
  }

  return (
    <div
      ref={popoverRef}
      className="purchase-filter-popover"
      role="dialog"
      aria-label="Фильтр закупов"
    >
      <div className="purchase-filter-popover__section">
        <span className="purchase-filter-popover__label">Период</span>
        <div className="purchase-filter-popover__presets">
          {PERIOD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`purchase-filter-popover__preset${
                draft.periodPreset === preset.id
                  ? ' purchase-filter-popover__preset--active'
                  : ''
              }`}
              onClick={() => selectPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="purchase-filter-popover__dates">
          <input
            type="date"
            className="admin-form__input purchase-filter-popover__date"
            value={draft.dateFrom}
            onChange={(e) => updateDateFrom(e.target.value)}
            aria-label="Дата с"
          />
          <span className="purchase-filter-popover__dates-sep">—</span>
          <input
            type="date"
            className="admin-form__input purchase-filter-popover__date"
            value={draft.dateTo}
            onChange={(e) => updateDateTo(e.target.value)}
            aria-label="Дата по"
          />
        </div>
      </div>

      <div className="purchase-filter-popover__section">
        <span className="purchase-filter-popover__label">Поставщик</span>
        <SearchableSupplierSelect
          value={draft.supplierId}
          onChange={(supplierId) => setDraft({ ...draft, supplierId })}
          placeholder="Все поставщики"
          searchPlaceholder="Поиск поставщика..."
        />
      </div>

      <div className="purchase-filter-popover__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={handleReset}>
          Сбросить
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onApply}>
          Применить
        </button>
      </div>
    </div>
  )
}
