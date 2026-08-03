/** Единый маршрут входа в Shugyla Platform */
export const LOGIN_PATH = '/login'

/** Публичные маршруты — не блокировать загрузкой academy data */
export const PUBLIC_AUTH_PATHS = [
  LOGIN_PATH,
  '/vacancies',
  '/apply',
  '/forgot-password',
  '/reset-password',
]

export function isPublicAppPath(pathname = '') {
  if (!pathname) return false
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (PUBLIC_AUTH_PATHS.includes(normalized)) return true
  if (normalized.startsWith('/vacancies/')) return true
  if (normalized.startsWith('/apply/')) return true
  return false
}

/** URL страницы входа с опциональным redirect после авторизации */
export function getLoginUrl(redirectPath) {
  if (
    redirectPath &&
    redirectPath.startsWith('/') &&
    !redirectPath.startsWith('//') &&
    !redirectPath.startsWith(LOGIN_PATH)
  ) {
    return `${LOGIN_PATH}?redirect=${encodeURIComponent(redirectPath)}`
  }
  return LOGIN_PATH
}
