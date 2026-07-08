/* Shugyla Academy — базовый service worker (MVP PWA) */

const BASE = '/shugyla-academy/'
const CACHE_NAME = 'shugyla-academy-shell-v1'

const SHELL_URLS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}offline.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  `${BASE}icons/apple-touch-icon.png`,
]

function isSupabaseOrExternal(url) {
  if (url.origin !== self.location.origin) return true
  return url.hostname.includes('supabase.co')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (isSupabaseOrExternal(url)) return

  const basePath = BASE.replace(/\/$/, '')
  if (!url.pathname.startsWith(basePath)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          if (cached) return cached
          const offline = await caches.match(`${BASE}offline.html`)
          if (offline) return offline
          return caches.match(`${BASE}index.html`)
        })
    )
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.pathname.includes('/assets/')) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})
