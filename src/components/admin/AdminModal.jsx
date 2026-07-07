import './AdminModal.css'

/** Модальное окно для форм админ-панели */
export default function AdminModal({ title, children, onClose, footer, wide = false, xwide = false }) {
  const sizeClass = xwide ? 'admin-modal--xwide' : wide ? 'admin-modal--wide' : ''
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className={`admin-modal ${sizeClass}`} onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal__header">
          <h2 className="admin-modal__title">{title}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="admin-modal__body">{children}</div>
        {footer && <div className="admin-modal__footer">{footer}</div>}
      </div>
    </div>
  )
}
