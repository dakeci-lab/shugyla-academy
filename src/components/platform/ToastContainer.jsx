import { useEffect } from 'react'
import { TOAST_TYPES } from '../../services/notificationService'
import './ToastContainer.css'

const TYPE_ICONS = {
  [TOAST_TYPES.SUCCESS]: '✅',
  [TOAST_TYPES.WARNING]: '⚠',
  [TOAST_TYPES.ERROR]: '❌',
}

/** Контейнер Toast-уведомлений платформы */
export default function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="platform-toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration ?? 3500)
    return () => window.clearTimeout(timer)
  }, [toast.id, toast.duration, onDismiss])

  return (
    <div
      className={`platform-toast platform-toast--${toast.type}`}
      role="status"
    >
      <span className="platform-toast__icon" aria-hidden="true">
        {TYPE_ICONS[toast.type] || '•'}
      </span>
      <p className="platform-toast__message">{toast.message}</p>
      <button
        type="button"
        className="platform-toast__close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Закрыть уведомление"
      >
        ×
      </button>
    </div>
  )
}
