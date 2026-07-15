import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  setToastListener,
  clearToastListener,
  TOAST_TYPES,
} from '../services/notificationService'
import ToastContainer from '../components/platform/ToastContainer'

const ToastContext = createContext({
  showToast: () => null,
  success: () => null,
  warning: () => null,
  error: () => null,
})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback(({ id, type, message, duration = 3500 }) => {
    setToasts((prev) => [...prev, { id, type, message, duration }])
  }, [])

  useEffect(() => {
    setToastListener(addToast)
    return () => clearToastListener()
  }, [addToast])

  const showToast = useCallback(
    ({ type = TOAST_TYPES.SUCCESS, message, duration }) => {
      const id = crypto.randomUUID()
      addToast({ id, type, message, duration })
      return id
    },
    [addToast]
  )

  const value = useMemo(
    () => ({
      showToast,
      success: (message, duration) =>
        showToast({ type: TOAST_TYPES.SUCCESS, message, duration }),
      warning: (message, duration) =>
        showToast({ type: TOAST_TYPES.WARNING, message, duration }),
      error: (message, duration) =>
        showToast({ type: TOAST_TYPES.ERROR, message, duration }),
    }),
    [showToast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
