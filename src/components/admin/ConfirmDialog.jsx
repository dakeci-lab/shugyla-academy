import { useEffect } from 'react'
import AdminModal from './AdminModal'

/** Диалог подтверждения действия */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
  loading = false,
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <AdminModal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn--primary ${confirmVariant === 'danger' ? 'admin-table__danger' : ''}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Обработка…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-dialog__message">{message}</p>
    </AdminModal>
  )
}
