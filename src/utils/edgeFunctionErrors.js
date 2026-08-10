/** Minimum temporary password length — keep in sync with admin-create-employee Edge Function. */
export const MIN_EMPLOYEE_TEMP_PASSWORD_LENGTH = 6

const GENERIC_INVOKE_ERROR = 'Edge Function returned a non-2xx status code'

const TECHNICAL_HTTP_PHRASES = [
  'bad request',
  'unauthorized',
  'forbidden',
  'not found',
  'conflict',
  'internal server error',
  'service unavailable',
  'gateway timeout',
  'edge function returned a non-2xx status code',
  'functionshttperror',
  'functionsrelayerror',
  'functionsfetcherror',
  'non-2xx',
]

const TECHNICAL_ERROR_NAMES = [
  'FunctionsHttpError',
  'FunctionsRelayError',
  'FunctionsFetchError',
]

/**
 * Parse JSON body from supabase.functions.invoke() FunctionsHttpError.context.
 * context may be a Response (needs .json()) or a pre-parsed object.
 */
export async function parseFunctionInvokeContext(error) {
  if (!error?.context) return null
  const context = error.context
  if (context && typeof context === 'object' && typeof context.json !== 'function') {
    if (context.json && typeof context.json === 'object') return context.json
    if (context.body && typeof context.body === 'object') return context.body
  }
  if (context && typeof context.json === 'function') {
    try {
      const response = typeof context.clone === 'function' ? context.clone() : context
      return await response.json()
    } catch {
      return null
    }
  }
  return null
}

export function isTechnicalHttpPhrase(message) {
  const lower = String(message || '')
    .toLowerCase()
    .trim()
  if (!lower) return false
  if (TECHNICAL_HTTP_PHRASES.some((phrase) => lower === phrase || lower.includes(phrase))) {
    return true
  }
  // Bare HTTP status labels like "HTTP 400" / "400 Bad Request"
  if (/^https?\s*\d{3}\b/.test(lower)) return true
  if (/^\d{3}\s+(bad request|unauthorized|forbidden|not found|conflict)/.test(lower)) {
    return true
  }
  return false
}

export function isTechnicalEdgeErrorName(name) {
  return TECHNICAL_ERROR_NAMES.includes(String(name || ''))
}

/**
 * True for generic Edge invoke / HTTP transport labels that must not reach the UI.
 * Compatible with exact non-2xx text, Bad Request, and Functions* error names.
 * Does not call resolveEdgeFunctionUserMessage (no recursion).
 */
export function isGenericInvokeErrorMessage(message) {
  const text = String(message || '')
  if (!text) return false
  if (text === GENERIC_INVOKE_ERROR) return true
  if (isTechnicalHttpPhrase(text)) return true
  if (isTechnicalEdgeErrorName(text)) return true
  return false
}

export function looksLikeRussianUserMessage(message) {
  const text = String(message || '').trim()
  if (!text) return false
  if (!/[А-Яа-яЁё]/.test(text)) return false
  if (isTechnicalHttpPhrase(text)) return false
  return true
}

export async function extractFunctionErrorBody(error) {
  const parsed = await parseFunctionInvokeContext(error)
  if (parsed && typeof parsed === 'object') return parsed
  return null
}

/**
 * Prefer structured Edge Function Russian message/code payload; otherwise contextual fallback.
 * Never surfaces English transport phrases like "Bad Request".
 */
export function resolveEdgeFunctionUserMessage({
  error,
  body,
  fallback = 'Не удалось выполнить операцию. Повторите попытку.',
} = {}) {
  const structured =
    (body && typeof body === 'object' && (body.message || body.error || body.msg)) || null
  if (looksLikeRussianUserMessage(structured)) {
    return String(structured).trim()
  }
  if (structured && !isTechnicalHttpPhrase(structured) && /[А-Яа-яЁё]/.test(String(structured))) {
    return String(structured).trim()
  }

  const raw = error?.message || ''
  if (looksLikeRussianUserMessage(raw)) {
    return raw.trim()
  }

  if (
    isGenericInvokeErrorMessage(raw) ||
    isTechnicalHttpPhrase(raw) ||
    isTechnicalEdgeErrorName(error?.name)
  ) {
    return fallback
  }

  if (raw && !isTechnicalHttpPhrase(raw) && /[А-Яа-яЁё]/.test(raw)) {
    return raw.trim()
  }

  return fallback
}
