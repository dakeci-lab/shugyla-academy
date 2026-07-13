/** Единый маршрут входа в Shugyla Platform */
export const LOGIN_PATH = '/login'

/** Публичные маршруты — не блокировать загрузкой academy data */
export const PUBLIC_AUTH_PATHS = [
  LOGIN_PATH,
  '/vacancies',
  '/forgot-password',
  '/reset-password',
]

export function isPublicAppPath(pathname = '') {
  if (!pathname) return false
  if (PUBLIC_AUTH_PATHS.includes(pathname)) return true
  if (pathname.startsWith('/vacancies/')) return true
  if (pathname.startsWith('/apply/')) return true
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
