/** Единый basename для React Router и абсолютных URL (Vite `base`) */

/** Production: `/shugyla-academy/`, localhost dev: `/` */
export function getAppBasePath() {
  let raw = import.meta.env.BASE_URL || '/'
  if (!raw.startsWith('/')) raw = `/${raw}`
  if (raw !== '/' && !raw.endsWith('/')) raw = `${raw}/`
  return raw
}

/** Префикс без завершающего слэша — для legacy concat */
export function getAppBasePathPrefix() {
  const base = getAppBasePath()
  if (base === '/') return ''
  return base.replace(/\/$/, '')
}

export function getRouterBasename() {
  const prefix = getAppBasePathPrefix()
  if (!prefix) return undefined
  return prefix
}

export function getAppBaseUrl(origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost') {
  return new URL(getAppBasePath(), origin)
}

export function getAppUrl(relativePath = '', origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost') {
  const normalized = String(relativePath).replace(/^\/+/, '')
  return new URL(normalized, getAppBaseUrl(origin)).toString()
}

export function isInsideAppBase(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
  origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
) {
  const basePath = getAppBaseUrl(origin).pathname.replace(/\/$/, '') || ''
  const normalized = String(pathname).replace(/\/$/, '') || '/'

  if (!basePath) {
    return normalized === '/' || normalized.startsWith('/')
  }

  return normalized === basePath || normalized.startsWith(`${basePath}/`)
}

/** Преобразует полный pathname в внутренний route React Router */
export function resolveAppInternalPath(pathname = typeof window !== 'undefined' ? window.location.pathname : '/') {
  const prefix = getAppBasePathPrefix()
  if (!prefix) return pathname || '/'
  if (pathname === prefix || pathname === `${prefix}/`) return '/'
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length) || '/'
  return null
}

/** URL для PWA recovery — не уходит на корень GitHub Pages */
export function getRecoveryTargetUrl() {
  if (typeof window === 'undefined') return getAppUrl()
  if (isInsideAppBase(window.location.pathname)) return window.location.href
  return getAppBaseUrl().toString()
}
