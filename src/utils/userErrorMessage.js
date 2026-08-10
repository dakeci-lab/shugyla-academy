import {
  isGenericInvokeErrorMessage,
  isTechnicalEdgeErrorName,
  isTechnicalHttpPhrase,
  looksLikeRussianUserMessage,
} from './edgeFunctionErrors.js'

const TECHNICAL_MARKERS = [
  'constraint',
  'duplicate key',
  'unique constraint',
  'violates',
  'postgres',
  'postgresql',
  'supabase',
  'pgrst',
  'sql',
  'row level security',
  'permission denied for',
  '42p',
  '23505',
  '::',
]

function extractMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return error.message || error.details || error.hint || String(error)
}

function isTechnicalMessage(message) {
  const lower = message.toLowerCase()
  return TECHNICAL_MARKERS.some((marker) => lower.includes(marker))
}

function isNetworkMessage(message) {
  const lower = message.toLowerCase()
  return (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('timeout') ||
    (lower.includes('fetch') && !looksLikeRussianUserMessage(message))
  )
}

/**
 * Преобразует техническую ошибку в понятное сообщение для пользователя.
 * Полный текст ошибки пишется только в консоль разработчика.
 * Английские HTTP/Edge transport фразы (Bad Request, non-2xx, …) не показываются.
 */
export function toUserErrorMessage(error, fallback = 'Не удалось сохранить закупку.') {
  const technical = extractMessage(error)
  const errorName = typeof error === 'object' && error ? error.name : ''

  if (technical) {
    console.error('[UserError]', technical, error)
  }

  if (!technical) return fallback

  const lower = technical.toLowerCase()

  // Known special-case mappings before generic Russian passthrough.
  if (lower.includes('supabase не настроен')) {
    return 'Сервер не настроен'
  }

  if (lower.includes('не найден')) {
    return 'Запись не найдена'
  }

  if (lower.includes('поставщик')) {
    return 'Поставщик не найден'
  }

  if (
    isTechnicalHttpPhrase(technical) ||
    isGenericInvokeErrorMessage(technical) ||
    isTechnicalEdgeErrorName(errorName) ||
    isTechnicalEdgeErrorName(technical)
  ) {
    return fallback
  }

  if (isNetworkMessage(technical)) {
    return 'Ошибка подключения к серверу'
  }

  if (isTechnicalMessage(technical)) {
    if (lower.includes('duplicate') || lower.includes('unique')) {
      return 'Не удалось сохранить изменения. Попробуйте повторить позже.'
    }
    return 'Не удалось сохранить данные. Попробуйте повторить позже.'
  }

  // Preserve understandable Russian business errors after special/technical handling.
  if (looksLikeRussianUserMessage(technical)) {
    return technical.trim()
  }

  // Unknown English/technical leftover — never surface raw HTTP phrases.
  if (/^[A-Za-z0-9][A-Za-z0-9 .,_:/()-]*$/.test(technical.trim())) {
    return fallback
  }

  return technical.trim() || fallback
}

export function throwUserError(result, context, fallback) {
  if (!result?.error) return result.data

  const userMessage = toUserErrorMessage(result.error, fallback)
  console.error(context ? `[${context}]` : '[Supabase]', result.error)
  throw new Error(userMessage)
}
