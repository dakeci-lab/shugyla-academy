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
    lower.includes('fetch') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('timeout')
  )
}

/**
 * Преобразует техническую ошибку в понятное сообщение для пользователя.
 * Полный текст ошибки пишется только в консоль разработчика.
 */
export function toUserErrorMessage(error, fallback = 'Не удалось сохранить закупку.') {
  const technical = extractMessage(error)
  if (technical) {
    console.error('[UserError]', technical, error)
  }

  if (!technical) return fallback

  if (isNetworkMessage(technical)) {
    return 'Ошибка подключения к серверу'
  }

  if (technical.toLowerCase().includes('supabase не настроен')) {
    return 'Сервер не настроен'
  }

  if (technical.toLowerCase().includes('не найден')) {
    return 'Запись не найдена'
  }

  if (technical.toLowerCase().includes('поставщик')) {
    return 'Поставщик не найден'
  }

  if (isTechnicalMessage(technical)) {
    if (technical.toLowerCase().includes('duplicate') || technical.toLowerCase().includes('unique')) {
      return 'Не удалось сохранить изменения. Попробуйте повторить позже.'
    }
    return 'Не удалось сохранить данные. Попробуйте повторить позже.'
  }

  return technical.trim() || fallback
}

export function throwUserError(result, context, fallback) {
  if (!result?.error) return result.data

  const userMessage = toUserErrorMessage(result.error, fallback)
  console.error(context ? `[${context}]` : '[Supabase]', result.error)
  throw new Error(userMessage)
}
