import { getAppBasePath, getAppUrl } from '../router/basename'

/** Регистрация service worker — production и local Web Push dev */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  const hasVapidKey = Boolean(import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY)
  if (!import.meta.env.PROD && !hasVapidKey) return

  window.addEventListener('load', () => {
    const swUrl = getAppUrl('sw.js')
    const scope = getAppBasePath()

    navigator.serviceWorker
      .register(swUrl, { scope })
      .catch((err) => {
        console.warn('Service worker registration failed:', err)
      })
  })
}
