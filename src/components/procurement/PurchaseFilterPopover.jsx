import { useEffect, useRef } from 'react'
import AdminModal from '../admin/AdminModal'
import SearchableSupplierSelect from '../suppliers/SearchableSupplierSelect'
import useMediaQuery from '../../hooks/useMediaQuery'
import {
  createDefaultPurchaseFilters,
  getPurchasePeriodDraftDates,
  PURCHASE_PERIOD_PRESET,
} from '../../utils/purchaseFilter'
import './PurchaseFilterPopover.css'

const MOBILE_QUERY = '(max-width: 900px)'

const PERIOD_PRESETS = [
  { id: PURCHASE_PERIOD_PRESET.TODAY, label: 'Сегодня' },
  { id: PURCHASE_PERIOD_PRESET.WEEK, label: 'Неделя' },
  { id: PURCHASE_PERIOD_PRESET.MONTH, label: 'Месяц' },
]

function PurchaseFilterFields({ draft, onChange }) {
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

  return (
    <>
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
    </>
  )
}

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
  const isMobile = useMediaQuery(MOBILE_QUERY)

  useEffect(() => {
    if (!open) return undefined

    function handleEscape(event) {
      if (event.key === 'Escape') onClose?.()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  useEffect(() => {
    if (!open || isMobile) return undefined

    function handlePointerDown(event) {
      const anchor = anchorRef?.current
      const popover = popoverRef.current
      if (!popover) return
      if (popover.contains(event.target)) return
      if (anchor?.contains(event.target)) return
      onClose?.()
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, isMobile, onClose, anchorRef])

  useEffect(() => {
    if (open || !isMobile) return undefined
    anchorRef?.current?.focus()
  }, [open, isMobile, anchorRef])

  if (!open) return null

  function handleReset() {
    onChange?.(createDefaultPurchaseFilters())
    onReset?.()
  }

  const actions = (
    <>
      <button type="button" className="btn btn--ghost btn--sm" onClick={handleReset}>
        Сбросить
      </button>
      <button type="button" className="btn btn--primary btn--sm" onClick={onApply}>
        Применить
      </button>
    </>
  )

  if (isMobile) {
    return (
      <AdminModal title="Фильтр" onClose={onClose} footer={actions}>
        <PurchaseFilterFields draft={draft} onChange={onChange} />
      </AdminModal>
    )
  }

  return (
    <div
      ref={popoverRef}
      className="purchase-filter-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby="purchase-filter-popover-title"
    >
      <h2 id="purchase-filter-popover-title" className="purchase-filter-popover__sr-title">
        Фильтр
      </h2>
      <PurchaseFilterFields draft={draft} onChange={onChange} />
      <div className="purchase-filter-popover__actions">{actions}</div>
    </div>
  )
}
