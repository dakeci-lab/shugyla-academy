export type PushClassification =
  | 'accepted'
  | 'subscription_expired'
  | 'retryable_failure'
  | 'provider_rejected'
  | 'configuration_error'
  | 'internal_error'

export function classifyPushStatusCode(statusCode: number | null | undefined): PushClassification {
  if (statusCode == null || Number.isNaN(statusCode)) {
    return 'internal_error'
  }

  if (statusCode >= 200 && statusCode < 300) {
    return 'accepted'
  }

  if (statusCode === 404 || statusCode === 410) {
    return 'subscription_expired'
  }

  if (statusCode === 429) {
    return 'retryable_failure'
  }

  if (statusCode >= 500 && statusCode <= 599) {
    return 'retryable_failure'
  }

  if (statusCode === 401 || statusCode === 403) {
    return 'configuration_error'
  }

  if (statusCode === 400) {
    return 'provider_rejected'
  }

  return 'internal_error'
}

export function extractPushResponseStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const maybe = error as { response?: { status?: unknown } }
  const status = maybe.response?.status
  if (typeof status === 'number' && Number.isFinite(status)) {
    return status
  }

  return null
}

export function classifyPushError(error: unknown): PushClassification {
  const responseStatus = extractPushResponseStatus(error)
  if (responseStatus != null) {
    return classifyPushStatusCode(responseStatus)
  }

  if (!error || typeof error !== 'object') {
    return 'internal_error'
  }

  const maybe = error as { statusCode?: number; message?: string; name?: string }
  if (typeof maybe.statusCode === 'number') {
    return classifyPushStatusCode(maybe.statusCode)
  }

  const message = `${maybe.message ?? ''} ${maybe.name ?? ''}`.toLowerCase()
  const pushFailedMatch = message.match(/pushing message failed:\s*(\d{3})/)
  if (pushFailedMatch) {
    return classifyPushStatusCode(Number(pushFailedMatch[1]))
  }

  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('fetch failed') ||
    message.includes('not a valid') ||
    message.includes('unsupported') ||
    message.includes('push service') ||
    message.includes('invalid endpoint') ||
    message.includes('aborterror') ||
    message.includes('aborted')
  ) {
    return 'retryable_failure'
  }

  return 'internal_error'
}
