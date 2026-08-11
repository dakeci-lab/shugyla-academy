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

  const addToast = useCallback(({ id, type, message, duration = 3500, action = null }) => {
    setToasts((prev) => [...prev, { id, type, message, duration, action }])
  }, [])

  useEffect(() => {
    setToastListener(addToast)
    return () => clearToastListener()
  }, [addToast])

  const showToast = useCallback(
    ({ type = TOAST_TYPES.SUCCESS, message, duration, action = null }) => {
      const id = crypto.randomUUID()
      addToast({ id, type, message, duration, action })
      return id
    },
    [addToast]
  )

  const normalizeToastOptions = useCallback((durationOrOptions) => {
    if (typeof durationOrOptions === 'number') return { duration: durationOrOptions }
    if (durationOrOptions && typeof durationOrOptions === 'object') return durationOrOptions
    return {}
  }, [])

  const value = useMemo(
    () => ({
      showToast,
      success: (message, durationOrOptions) =>
        showToast({
          type: TOAST_TYPES.SUCCESS,
          message,
          ...normalizeToastOptions(durationOrOptions),
        }),
      warning: (message, durationOrOptions) =>
        showToast({
          type: TOAST_TYPES.WARNING,
          message,
          ...normalizeToastOptions(durationOrOptions),
        }),
      error: (message, durationOrOptions) =>
        showToast({
          type: TOAST_TYPES.ERROR,
          message,
          ...normalizeToastOptions(durationOrOptions),
        }),
    }),
    [normalizeToastOptions, showToast]
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
