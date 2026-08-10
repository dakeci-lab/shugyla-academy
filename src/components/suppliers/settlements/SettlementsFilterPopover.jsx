import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AdminModal from '../../admin/AdminModal'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { ChevronLeftIcon, ChevronRightIcon } from '../../icons/PlatformIcons'
import {
  SETTLEMENTS_PERIOD_PRESET,
  SETTLEMENTS_PERIOD_PRESET_OPTIONS,
  formatSettlementsPeriodNavigatorLabel,
  getSettlementsPeriodDates,
  getSettlementsPeriodDefaults,
  resolveSettlementsPeriodPreset,
  shiftSettlementsPeriod,
} from '../../../utils/settlementsPeriod'
import './SettlementsFilterPopover.css'

const MOBILE_QUERY = '(max-width: 900px)'
const POPOVER_WIDTH = 360
const VIEWPORT_PAD = 16
const SIDE_OFFSET = 8

export {
  SETTLEMENTS_PERIOD_PRESET,
  getSettlementsPeriodDefaults,
  resolveSettlementsPeriodPreset,
  getSettlementsPeriodDates,
}

function SettlementsFilterFields({ draft, onChange }) {
  const navigatorLabel = formatSettlementsPeriodNavigatorLabel(
    draft.periodPreset,
    draft.dateFrom,
    draft.dateTo
  )

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
    const next = {
      ...draft,
      [field]: value,
    }
    next.periodPreset = resolveSettlementsPeriodPreset(next.dateFrom, next.dateTo)
    onChange?.(next)
  }

  function shift(direction) {
    const shifted = shiftSettlementsPeriod(
      draft.periodPreset,
      draft.dateFrom,
      draft.dateTo,
      direction
    )
    onChange?.({
      ...draft,
      dateFrom: shifted.dateFrom,
      dateTo: shifted.dateTo,
      // Keep the selected period type while navigating (UMAG-style), including CUSTOM.
      periodPreset: draft.periodPreset,
    })
  }

  return (
    <div className="settlements-filter-popover__section">
      <span className="settlements-filter-popover__label">Период</span>
      <div className="settlements-filter-popover__presets" role="group" aria-label="Быстрый период">
        {SETTLEMENTS_PERIOD_PRESET_OPTIONS.map((preset) => {
          const active = draft.periodPreset === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              className={`settlements-filter-popover__preset${
                active ? ' settlements-filter-popover__preset--active' : ''
              }`}
              onClick={() => selectPreset(preset.id)}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      <div className="settlements-filter-popover__navigator" aria-label="Навигация по периоду">
        <button
          type="button"
          className="settlements-filter-popover__nav-btn"
          aria-label="Предыдущий период"
          onClick={() => shift(-1)}
        >
          <ChevronLeftIcon size={18} />
        </button>
        <div className="settlements-filter-popover__nav-label" aria-live="polite">
          {navigatorLabel}
        </div>
        <button
          type="button"
          className="settlements-filter-popover__nav-btn"
          aria-label="Следующий период"
          onClick={() => shift(1)}
        >
          <ChevronRightIcon size={18} />
        </button>
      </div>

      <span className="settlements-filter-popover__label">Произвольный период</span>
      <div className="settlements-filter-popover__dates">
        <label className="settlements-filter-popover__date-field">
          <span>С</span>
          <span className="settlements-filter-popover__date-wrap">
            <input
              type="date"
              className="settlements-filter-popover__date"
              value={draft.dateFrom}
              onChange={(e) => updateDate('dateFrom', e.target.value)}
            />
          </span>
        </label>
        <label className="settlements-filter-popover__date-field">
          <span>По</span>
          <span className="settlements-filter-popover__date-wrap">
            <input
              type="date"
              className="settlements-filter-popover__date"
              value={draft.dateTo}
              onChange={(e) => updateDate('dateTo', e.target.value)}
            />
          </span>
        </label>
      </div>
    </div>
  )
}

function computePopoverStyle(anchorEl, popoverEl) {
  if (!anchorEl) return { top: VIEWPORT_PAD, left: VIEWPORT_PAD, width: POPOVER_WIDTH }

  const rect = anchorEl.getBoundingClientRect()
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_PAD * 2)
  const height = popoverEl?.offsetHeight || 320

  let left = rect.right - width
  left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - width - VIEWPORT_PAD))

  let top = rect.bottom + SIDE_OFFSET
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD
  const spaceAbove = rect.top - VIEWPORT_PAD
  if (spaceBelow < height && spaceAbove > spaceBelow) {
    top = Math.max(VIEWPORT_PAD, rect.top - height - SIDE_OFFSET)
  } else {
    top = Math.min(top, window.innerHeight - Math.min(height, spaceBelow) - VIEWPORT_PAD)
    top = Math.max(VIEWPORT_PAD, top)
  }

  return { top, left, width }
}

/** Period filter for Взаиморасчёты — desktop portal popover / mobile AdminModal. */
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
  const [style, setStyle] = useState(null)

  useLayoutEffect(() => {
    if (!open || isMobile) return undefined

    function updatePosition() {
      setStyle(computePopoverStyle(anchorRef?.current, popoverRef.current))
    }

    updatePosition()
    const raf = window.requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, isMobile, anchorRef, draft])

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

  return createPortal(
    <div
      ref={popoverRef}
      className="settlements-filter-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby="settlements-filter-popover-title"
      style={
        style
          ? {
              top: `${style.top}px`,
              left: `${style.left}px`,
              width: `${style.width}px`,
            }
          : undefined
      }
    >
      <h2 id="settlements-filter-popover-title" className="settlements-filter-popover__sr-title">
        Фильтр
      </h2>
      <SettlementsFilterFields draft={draft} onChange={onChange} />
      <div className="settlements-filter-popover__actions">{actions}</div>
    </div>,
    document.body
  )
}
