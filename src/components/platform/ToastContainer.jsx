import { useEffect } from 'react'
import { Link } from 'react-router-dom'
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

  const action = toast.action
  const actionNode =
    action?.label && action?.to ? (
      <Link
        to={action.to}
        className="platform-toast__action"
        onClick={() => onDismiss(toast.id)}
      >
        {action.label}
      </Link>
    ) : action?.label && typeof action?.onClick === 'function' ? (
      <button
        type="button"
        className="platform-toast__action"
        onClick={() => {
          action.onClick()
          onDismiss(toast.id)
        }}
      >
        {action.label}
      </button>
    ) : null

  return (
    <div
      className={`platform-toast platform-toast--${toast.type}`}
      role="status"
    >
      <span className="platform-toast__icon" aria-hidden="true">
        {TYPE_ICONS[toast.type] || '•'}
      </span>
      <div className="platform-toast__body">
        <p className="platform-toast__message">{toast.message}</p>
        {actionNode}
      </div>
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
