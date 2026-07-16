/** Minimum temporary password length — keep in sync with admin-create-employee Edge Function. */
export const MIN_EMPLOYEE_TEMP_PASSWORD_LENGTH = 6

const GENERIC_INVOKE_ERROR = 'Edge Function returned a non-2xx status code'

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

export function isGenericInvokeErrorMessage(message) {
  return message === GENERIC_INVOKE_ERROR
}

export async function extractFunctionErrorBody(error) {
  const parsed = await parseFunctionInvokeContext(error)
  if (parsed && typeof parsed === 'object') return parsed
  return null
}
