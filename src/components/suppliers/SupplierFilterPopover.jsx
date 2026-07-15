import { useEffect, useRef } from 'react'
import AdminModal from '../admin/AdminModal'
import useMediaQuery from '../../hooks/useMediaQuery'
import {
  SUPPLIER_LIST_DEFAULT_STATUS,
  SUPPLIER_LIST_STATUS_FILTER_OPTIONS,
  formatSupplierFilterCount,
} from '../../utils/supplierData'
import './SupplierFilterPopover.css'

const MOBILE_QUERY = '(max-width: 900px)'

function SupplierFilterFields({ draftStatus, onChange, resultCount }) {
  return (
    <>
      <div className="supplier-filter-popover__section">
        <span className="supplier-filter-popover__label">Статус</span>
        <div className="supplier-filter-popover__options" role="radiogroup" aria-label="Статус поставщика">
          {SUPPLIER_LIST_STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={draftStatus === option.id}
              className={`supplier-filter-popover__option${
                draftStatus === option.id ? ' supplier-filter-popover__option--active' : ''
              }`}
              onClick={() => onChange?.(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="supplier-filter-popover__count">
        {formatSupplierFilterCount(draftStatus, resultCount)}
      </p>
    </>
  )
}

export default function SupplierFilterPopover({
  open,
  draftStatus,
  onChange,
  resultCount,
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
    onChange?.(SUPPLIER_LIST_DEFAULT_STATUS)
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
      <AdminModal
        title="Фильтр поставщиков"
        onClose={onClose}
        returnFocusRef={anchorRef}
        footer={actions}
      >
        <SupplierFilterFields
          draftStatus={draftStatus}
          onChange={onChange}
          resultCount={resultCount}
        />
      </AdminModal>
    )
  }

  return (
    <div
      ref={popoverRef}
      className="supplier-filter-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby="supplier-filter-popover-title"
    >
      <h2 id="supplier-filter-popover-title" className="supplier-filter-popover__sr-title">
        Фильтр поставщиков
      </h2>
      <SupplierFilterFields
        draftStatus={draftStatus}
        onChange={onChange}
        resultCount={resultCount}
      />
      <div className="supplier-filter-popover__actions">{actions}</div>
    </div>
  )
}
