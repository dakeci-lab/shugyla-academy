/* Shugyla Academy — базовый service worker (MVP PWA) */

const BASE = '/shugyla-academy/'
const CACHE_NAME = 'shugyla-academy-shell-v2'
const CANONICAL_PLATFORM_PATH = `${BASE.replace(/\/$/, '')}/platform`

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

function normalizeNotificationDestination(rawUrl) {
  const origin = self.location.origin
  const fallback = `${origin}${CANONICAL_PLATFORM_PATH}`

  if (!rawUrl || typeof rawUrl !== 'string') return fallback

  const trimmed = rawUrl.trim()
  if (/^(javascript|data):/i.test(trimmed)) return fallback

  try {
    const url = new URL(trimmed, origin)
    if (url.origin !== origin) return fallback

    const basePath = BASE.replace(/\/$/, '')
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    const suffix = `${url.search}${url.hash}`

    const legacyPatterns = [
      `${basePath}/platform/time-tracker`,
      '/platform/time-tracker',
    ]

    if (legacyPatterns.some((legacy) => pathname === legacy || pathname.startsWith(`${legacy}/`))) {
      return `${origin}${CANONICAL_PLATFORM_PATH}${suffix}`
    }

    if (pathname === `${basePath}/platform` || pathname === '/platform') {
      return `${origin}${CANONICAL_PLATFORM_PATH}${suffix}`
    }

    if (!pathname.startsWith(basePath)) return fallback
    return url.href
  } catch {
    return fallback
  }
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

function resolveSafeNotificationUrl(rawUrl) {
  return normalizeNotificationDestination(rawUrl)
}

function parsePushPayload(event) {
  const fallback = {
    title: 'Shugyla Platform',
    body: 'У вас новое уведомление',
    icon: `${BASE}icons/icon-192.png`,
    badge: `${BASE}icons/icon-192.png`,
    tag: 'shugyla-notification',
    data: { url: `${CANONICAL_PLATFORM_PATH}` },
    actions: [],
    requireInteraction: false,
  }

  if (!event.data) return fallback

  try {
    const payload = event.data.json()
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {}
    return {
      title: typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : fallback.title,
      body: typeof payload.body === 'string' && payload.body.trim() ? payload.body.trim() : fallback.body,
      icon: typeof payload.icon === 'string' ? payload.icon : fallback.icon,
      badge: typeof payload.badge === 'string' ? payload.badge : fallback.badge,
      tag: typeof payload.tag === 'string' && payload.tag.trim() ? payload.tag.trim() : fallback.tag,
      data: {
        url: normalizeNotificationDestination(data.url || payload.url),
        notification_id: data.notification_id ?? null,
        type: data.type ?? null,
      },
      actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : [],
      requireInteraction: payload.requireInteraction === true,
    }
  } catch {
    return fallback
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const payload = parsePushPayload(event)
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        tag: payload.tag,
        data: payload.data,
        actions: payload.actions,
        renotify: Boolean(payload.tag),
        requireInteraction: payload.requireInteraction,
      })
    })()
  )
})

async function focusOrOpenClient(targetUrl) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of clients) {
    if (!client.url.includes(BASE.replace(/\/$/, ''))) continue
    await client.focus()
    if ('navigate' in client) {
      try {
        await client.navigate(targetUrl)
        return
      } catch {
        return
      }
    }
    return
  }
  await self.clients.openWindow(targetUrl)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  let targetUrl = normalizeNotificationDestination(data.url)

  if (event.action && typeof event.action === 'string') {
    targetUrl = normalizeNotificationDestination(event.action)
  }

  event.waitUntil(focusOrOpenClient(targetUrl))
})

self.addEventListener('notificationclose', () => {
  // Intentionally no-op on this step
})
