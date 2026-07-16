import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { lockModalScroll, unlockModalScroll } from '../../utils/modalScrollLock'
import './AdminModal.css'

/** Модальное окно для форм админ-панели (portal → document.body) */
export default function AdminModal({
  title,
  children,
  onClose,
  footer,
  wide = false,
  xwide = false,
  returnFocusRef,
  autoFocusClose = true,
}) {
  const sizeClass = xwide ? 'admin-modal--xwide' : wide ? 'admin-modal--wide' : ''
  const titleId = useId()
  const closeButtonRef = useRef(null)
  const onCloseRef = useRef(onClose)

  onCloseRef.current = onClose

  useEffect(() => {
    lockModalScroll()

    function handleEscape(event) {
      if (event.key === 'Escape') onCloseRef.current?.()
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      unlockModalScroll()
      returnFocusRef?.current?.focus()
    }
  }, [returnFocusRef])

  useEffect(() => {
    if (!autoFocusClose) return undefined

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [autoFocusClose])

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose} role="presentation">
      <div
        className={`admin-modal ${sizeClass}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="admin-modal__header">
          <h2 className="admin-modal__title" id={titleId}>
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="admin-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="admin-modal__body">{children}</div>
        {footer && <div className="admin-modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
