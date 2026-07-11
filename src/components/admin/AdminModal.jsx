import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import './AdminModal.css'

/** Модальное окно для форм админ-панели (portal → document.body) */
export default function AdminModal({ title, children, onClose, footer, wide = false, xwide = false }) {
  const sizeClass = xwide ? 'admin-modal--xwide' : wide ? 'admin-modal--wide' : ''

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose} role="presentation">
      <div
        className={`admin-modal ${sizeClass}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        <div className="admin-modal__header">
          <h2 className="admin-modal__title" id="admin-modal-title">
            {title}
          </h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Закрыть">
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
