import { useEffect, useRef } from 'react'
import AdminModal from '../admin/AdminModal'
import useMediaQuery from '../../hooks/useMediaQuery'
import { SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED } from '../../utils/supplierData'
import './SupplierFilterPopover.css'

const MOBILE_QUERY = '(max-width: 900px)'

function SupplierFilterFields({ draftShowArchived, onChange }) {
  return (
    <label className="supplier-filter-popover__checkbox-row">
      <input
        type="checkbox"
        checked={draftShowArchived}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span>Показать удалённых поставщиков</span>
    </label>
  )
}

export default function SupplierFilterPopover({
  open,
  draftShowArchived,
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
    onChange?.(SUPPLIER_LIST_DEFAULT_SHOW_ARCHIVED)
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
        <SupplierFilterFields draftShowArchived={draftShowArchived} onChange={onChange} />
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
      <SupplierFilterFields draftShowArchived={draftShowArchived} onChange={onChange} />
      <div className="supplier-filter-popover__actions">{actions}</div>
    </div>
  )
}
