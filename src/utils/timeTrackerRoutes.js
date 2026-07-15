/** Канонический маршрут нового тайм-трекера (главная платформы). */
export const TIME_TRACKER_CANONICAL_ROUTE = '/platform'

const LEGACY_TIME_TRACKER_ROUTE = '/platform/time-tracker'

const LEGACY_PATTERNS = [
  /^\/platform\/time-tracker\/?$/,
  /^\/shugyla-academy\/platform\/time-tracker\/?$/,
]

/**
 * Нормализует action_url / push destination к каноническому маршруту тайм-трекера.
 * @param {string | null | undefined} urlOrPath
 * @returns {string | null}
 */
export function normalizeTimeTrackerActionUrl(urlOrPath) {
  if (typeof urlOrPath !== 'string') return null

  const trimmed = urlOrPath.trim()
  if (!trimmed) return null

  let pathname = trimmed
  let suffix = ''

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      pathname = url.pathname
      suffix = `${url.search}${url.hash}`
    } catch {
      return null
    }
  } else {
    const hashIndex = trimmed.indexOf('#')
    const queryIndex = trimmed.indexOf('?')
    const splitIndex =
      hashIndex >= 0 && queryIndex >= 0
        ? Math.min(hashIndex, queryIndex)
        : hashIndex >= 0
          ? hashIndex
          : queryIndex
    if (splitIndex >= 0) {
      pathname = trimmed.slice(0, splitIndex)
      suffix = trimmed.slice(splitIndex)
    }
  }

  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  const isLegacy = LEGACY_PATTERNS.some((pattern) => pattern.test(normalizedPath))
  if (isLegacy) {
    return `${TIME_TRACKER_CANONICAL_ROUTE}${suffix}`
  }

  if (normalizedPath === TIME_TRACKER_CANONICAL_ROUTE) {
    return `${TIME_TRACKER_CANONICAL_ROUTE}${suffix}`
  }

  return trimmed.startsWith('/') ? `${trimmed.split(/[?#]/)[0]}${suffix}` : null
}

export function isLegacyTimeTrackerPath(pathname) {
  if (typeof pathname !== 'string') return false
  const normalized = pathname.replace(/\/+$/, '') || '/'
  return normalized === LEGACY_TIME_TRACKER_ROUTE || normalized.endsWith(LEGACY_TIME_TRACKER_ROUTE)
}
