/** Единый basename для React Router и абсолютных URL (Vite `base`) */
export function getRouterBasename() {
  const base = import.meta.env.BASE_URL ?? '/'
  if (base === '/' || base === '') return undefined
  return base.replace(/\/$/, '')
}

/** Префикс приложения без завершающего слэша — для redirectTo и внешних ссылок */
export function getAppBasePath() {
  const base = import.meta.env.BASE_URL ?? '/'
  if (base === '/' || base === '') return ''
  return base.replace(/\/$/, '')
}
