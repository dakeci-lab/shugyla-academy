/** Императивный API уведомлений — работает вне React-компонентов */

export const TOAST_TYPES = {
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
}

const DEFAULT_DURATION = 3500

let listener = null

export function setToastListener(fn) {
  listener = fn
}

export function clearToastListener() {
  listener = null
}

export function showToast({ type = TOAST_TYPES.SUCCESS, message, duration = DEFAULT_DURATION }) {
  if (!message) return null
  const id = crypto.randomUUID()
  listener?.({ id, type, message, duration })
  return id
}

export function toastSuccess(message, duration) {
  return showToast({ type: TOAST_TYPES.SUCCESS, message, duration })
}

export function toastWarning(message, duration) {
  return showToast({ type: TOAST_TYPES.WARNING, message, duration })
}

export function toastError(message, duration) {
  return showToast({ type: TOAST_TYPES.ERROR, message, duration })
}
