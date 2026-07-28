import { useEffect, useRef } from 'react'
import AdminModal from '../../admin/AdminModal'
import useMediaQuery from '../../../hooks/useMediaQuery'
import {
  getMonthPeriodKeys,
  getPreviousMonthPeriodKeys,
  toAqtobeDateKey,
} from '../../../services/umagSettlementsService'
import '../../procurement/PurchaseFilterPopover.css'

const MOBILE_QUERY = '(max-width: 900px)'

export const SETTLEMENTS_PERIOD_PRESET = {
  TODAY: 'today',
  CURRENT_MONTH: 'current_month',
  PREVIOUS_MONTH: 'previous_month',
  CUSTOM: 'custom',
}

export function getSettlementsPeriodDefaults() {
  const current = getMonthPeriodKeys()
  return {
    periodPreset: SETTLEMENTS_PERIOD_PRESET.CURRENT_MONTH,
    dateFrom: current.dateFrom,
    dateTo: current.dateTo,
  }
}

export function resolveSettlementsPeriodPreset(dateFrom, dateTo) {
  const today = toAqtobeDateKey()
  const current = getMonthPeriodKeys()
  const previous = getPreviousMonthPeriodKeys()
  if (dateFrom === today && dateTo === today) return SETTLEMENTS_PERIOD_PRESET.TODAY
  if (dateFrom === current.dateFrom && dateTo === current.dateTo) {
    return SETTLEMENTS_PERIOD_PRESET.CURRENT_MONTH
  }
  if (dateFrom === previous.dateFrom && dateTo === previous.dateTo) {
    return SETTLEMENTS_PERIOD_PRESET.PREVIOUS_MONTH
  }
  return SETTLEMENTS_PERIOD_PRESET.CUSTOM
}

export function getSettlementsPeriodDates(presetId) {
  if (presetId === SETTLEMENTS_PERIOD_PRESET.TODAY) {
    const today = toAqtobeDateKey()
    return { dateFrom: today, dateTo: today }
  }
  if (presetId === SETTLEMENTS_PERIOD_PRESET.PREVIOUS_MONTH) {
    return getPreviousMonthPeriodKeys()
  }
  return getMonthPeriodKeys()
}

const PRESETS = [
  { id: SETTLEMENTS_PERIOD_PRESET.TODAY, label: 'Сегодня' },
  { id: SETTLEMENTS_PERIOD_PRESET.CURRENT_MONTH, label: 'Текущий месяц' },
  { id: SETTLEMENTS_PERIOD_PRESET.PREVIOUS_MONTH, label: 'Прошлый месяц' },
]

function SettlementsFilterFields({ draft, onChange }) {
  function selectPreset(presetId) {
    const dates = getSettlementsPeriodDates(presetId)
    onChange?.({
      ...draft,
      periodPreset: presetId,
      dateFrom: dates.dateFrom,
      dateTo: dates.dateTo,
    })
  }

  function updateDate(field, value) {
    onChange?.({
      ...draft,
      periodPreset: SETTLEMENTS_PERIOD_PRESET.CUSTOM,
      [field]: value,
    })
  }

  return (
    <div className="purchase-filter-popover__section">
      <span className="purchase-filter-popover__label">Период</span>
      <div className="purchase-filter-popover__presets">
        {PRESETS.map((preset) => (
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
          onChange={(e) => updateDate('dateFrom', e.target.value)}
          aria-label="Дата с"
        />
        <span className="purchase-filter-popover__dates-sep">—</span>
        <input
          type="date"
          className="admin-form__input purchase-filter-popover__date"
          value={draft.dateTo}
          onChange={(e) => updateDate('dateTo', e.target.value)}
          aria-label="Дата по"
        />
      </div>
    </div>
  )
}

/** Period filter for Взаиморасчёты — desktop popover / mobile AdminModal. */
export default function SettlementsFilterPopover({
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

  if (!open) return null

  function handleReset() {
    onChange?.(getSettlementsPeriodDefaults())
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
      <AdminModal title="Фильтр" onClose={onClose} returnFocusRef={anchorRef} footer={actions}>
        <SettlementsFilterFields draft={draft} onChange={onChange} />
      </AdminModal>
    )
  }

  return (
    <div
      ref={popoverRef}
      className="purchase-filter-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby="settlements-filter-popover-title"
    >
      <h2 id="settlements-filter-popover-title" className="purchase-filter-popover__sr-title">
        Фильтр
      </h2>
      <SettlementsFilterFields draft={draft} onChange={onChange} />
      <div className="purchase-filter-popover__actions">{actions}</div>
    </div>
  )
}
