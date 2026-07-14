/** Регистрация service worker — production и local Web Push dev */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  const hasVapidKey = Boolean(import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY)
  if (!import.meta.env.PROD && !hasVapidKey) return

  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`

    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL })
      .catch((err) => {
        console.warn('Service worker registration failed:', err)
      })
  })
}
