import { getAppBasePath, getAppUrl } from '../router/basename'

let resyncScheduled = false

function schedulePushResync() {
  if (resyncScheduled || typeof window === 'undefined') return
  resyncScheduled = true

  window.setTimeout(() => {
    resyncScheduled = false
    import('../services/webPushSubscriptionService')
      .then(({ ensurePushNotificationsReady }) => ensurePushNotificationsReady())
      .catch(() => {})
  }, 500)
}

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
      .then(() => {
        schedulePushResync()
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err)
      })
  })

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    schedulePushResync()
  })
}
