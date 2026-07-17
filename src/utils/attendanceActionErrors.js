const CHECK_IN_FALLBACK = 'Не удалось отметить приход. Повторите попытку.'
const CHECK_OUT_FALLBACK = 'Не удалось завершить смену. Повторите попытку.'

const NETWORK_MESSAGE =
  'Нет соединения с интернетом. Проверьте подключение и повторите попытку.'
const SESSION_MESSAGE = 'Сессия завершена. Войдите в систему повторно.'
const ACCESS_MESSAGE =
  'Не удалось завершить смену из-за ошибки доступа. Обратитесь к администратору.'
const ACTIVE_SHIFT_MESSAGE =
  'Активная смена не найдена. Обновите страницу или обратитесь к администратору.'

function fallbackForContext(context) {
  return context === 'checkout' ? CHECK_OUT_FALLBACK : CHECK_IN_FALLBACK
}

function normalizeMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error.trim()
  if (typeof error.message === 'string') return error.message.trim()
  return ''
}

export function isNetworkError(error) {
  const code = String(error?.code ?? '').toLowerCase()
  const status = Number(error?.status ?? error?.statusCode ?? 0)
  // HTTP application errors (401/403/422/5xx) are not "no internet"
  if (status >= 400) return false
  if (code && code !== 'network_error' && /^(access_|unauthorized|forbidden|attendance_|clock_|active_|validation_)/.test(code)) {
    return false
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = normalizeMessage(error).toLowerCase()
  return (
    code === 'network_error' ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|econnrefused|enotfound|err_internet_disconnected/.test(
      message
    )
  )
}

function isAccessError(message, code) {
  return (
    code === 'access_denied' ||
    code === 'forbidden' ||
    code === 'inactive_caller' ||
    code === 'forbidden_field' ||
    /permission denied|42501|row-level security|rls/i.test(message)
  )
}

function isSessionError(code, message) {
  return code === 'unauthorized' || /jwt|session|auth session|token/i.test(message)
}

function isActiveShiftError(code, message) {
  return (
    code === 'active_shift_not_found' ||
    code === 'clock_in_required' ||
    /активная смена не найдена/i.test(message) ||
    /сначала отметьте приход/i.test(message)
  )
}

export function logAttendanceActionFailure(action, error, extra = {}) {
  console.error(`Failed to ${action}`, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    status: error?.status,
    originalError: error,
    ...extra,
  })
}

export function mapAttendanceActionUserMessage(error, context = 'checkout', errorBody = null) {
  const body = errorBody && typeof errorBody === 'object' ? errorBody : {}
  const code = body.code ?? body.error?.code ?? error?.code ?? null
  const message = normalizeMessage(body.message ?? error)

  if (isNetworkError(error) || code === 'network_error') return NETWORK_MESSAGE
  if (isSessionError(code, message)) return SESSION_MESSAGE
  if (isAccessError(message, code)) {
    return context === 'checkout' ? ACCESS_MESSAGE : ACCESS_MESSAGE.replace('завершить смену', 'отметить приход')
  }
  if (isActiveShiftError(code, message)) {
    if (/сначала отметьте приход/i.test(message)) return 'Сначала отметьте приход'
    return ACTIVE_SHIFT_MESSAGE
  }

  if (message && /^[А-Яа-яЁё]/.test(message)) {
    return message.replace(/^.*?:\s*/, '')
  }

  return fallbackForContext(context)
}
