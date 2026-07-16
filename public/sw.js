/* Shugyla Academy — service worker (PWA shell + push) */

const BASE = '/shugyla-academy/'
const CACHE_NAME = 'shugyla-academy-shell-v5'
const SHELL_CACHE_PREFIX = 'shugyla-academy-shell-'
const CANONICAL_PLATFORM_PATH = `${BASE.replace(/\/$/, '')}/platform`

const SHELL_URLS = [
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

function isHashedAsset(pathname) {
  return pathname.includes('/assets/')
}

function isHtmlResponse(response) {
  const type = response.headers.get('content-type') || ''
  return type.includes('text/html')
}

function isJavaScriptResponse(response) {
  const type = response.headers.get('content-type') || ''
  return type.includes('javascript') || type.includes('ecmascript')
}

function isCssResponse(response) {
  const type = response.headers.get('content-type') || ''
  return type.includes('text/css')
}

function shouldCacheResponse(request, response, url) {
  if (!response || !response.ok) return false
  if (response.type && response.type !== 'basic' && response.type !== 'cors') return false

  if (request.mode === 'navigate') {
    return isHtmlResponse(response)
  }

  if (isHashedAsset(url.pathname)) {
    return isJavaScriptResponse(response) || isCssResponse(response)
  }

  return true
}

async function cacheResponse(request, response) {
  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, response)
}

async function handleNavigate(request) {
  try {
    const response = await fetch(request)
    if (shouldCacheResponse(request, response, new URL(request.url))) {
      await cacheResponse(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) return cached

    const offline = await caches.match(`${BASE}offline.html`)
    if (offline) return offline

    const shellIndex = await caches.match(`${BASE}index.html`)
    if (shellIndex) return shellIndex

    throw error
  }
}

async function handleStaticAsset(request, url) {
  // Hashed Vite assets must always come from network to avoid stale chunk mismatch.
  if (isHashedAsset(url.pathname)) {
    return fetch(request)
  }

  try {
    const response = await fetch(request)
    if (shouldCacheResponse(request, response, url)) {
      await cacheResponse(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) return cached
    throw error
  }
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

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
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
    event.respondWith(handleNavigate(request))
    return
  }

  event.respondWith(handleStaticAsset(request, url))
})

function resolveSafeNotificationUrl(rawUrl) {
  return normalizeNotificationDestination(rawUrl)
}

function resolveAssetUrl(relativePath) {
  const normalized = String(relativePath || '').trim()
  if (!normalized) return `${self.location.origin}${BASE}icons/icon-192.png`
  if (/^https?:\/\//i.test(normalized)) return normalized
  const path = normalized.startsWith('/') ? normalized : `${BASE}${normalized.replace(/^\/+/, '')}`
  return new URL(path, self.location.origin).href
}

function normalizePushPayload(event) {
  const fallback = {
    title: 'Shugyla Platform',
    body: 'У вас новое уведомление',
    icon: resolveAssetUrl(`${BASE}icons/icon-192.png`),
    badge: resolveAssetUrl(`${BASE}icons/icon-192.png`),
    tag: 'shugyla-notification',
    data: {
      url: normalizeNotificationDestination(`${CANONICAL_PLATFORM_PATH}`),
      notification_id: null,
      type: null,
    },
    actions: [],
    requireInteraction: false,
    renotify: false,
  }

  if (!event?.data) return fallback

  let raw = null
  try {
    raw = event.data.json()
  } catch {
    try {
      const text = event.data.text()
      if (text) {
        raw = JSON.parse(text)
      }
    } catch {
      const text = typeof event.data.text === 'function' ? event.data.text() : ''
      if (typeof text === 'string' && text.trim()) {
        return {
          ...fallback,
          body: text.trim(),
        }
      }
      return fallback
    }
  }

  const payload = raw?.notification && typeof raw.notification === 'object' ? raw.notification : raw
  const nestedData =
    payload?.data && typeof payload.data === 'object'
      ? payload.data
      : raw?.data && typeof raw.data === 'object'
        ? raw.data
        : {}

  const title =
    typeof payload?.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : typeof raw?.title === 'string' && raw.title.trim()
        ? raw.title.trim()
        : fallback.title

  const body =
    typeof payload?.body === 'string' && payload.body.trim()
      ? payload.body.trim()
      : typeof raw?.body === 'string' && raw.body.trim()
        ? raw.body.trim()
        : fallback.body

  const tag =
    typeof payload?.tag === 'string' && payload.tag.trim()
      ? payload.tag.trim()
      : typeof raw?.tag === 'string' && raw.tag.trim()
        ? raw.tag.trim()
        : fallback.tag

  const rawUrl = nestedData.url || payload?.url || raw?.url || fallback.data.url

  return {
    title,
    body,
    icon: resolveAssetUrl(payload?.icon || raw?.icon || fallback.icon),
    badge: resolveAssetUrl(payload?.badge || raw?.badge || fallback.badge),
    tag,
    data: {
      url: normalizeNotificationDestination(rawUrl),
      notification_id: nestedData.notification_id ?? payload?.notification_id ?? null,
      type: nestedData.type ?? payload?.type ?? null,
      broadcast_id: nestedData.broadcast_id ?? null,
      request_id: nestedData.request_id ?? null,
    },
    actions: Array.isArray(payload?.actions) ? payload.actions.slice(0, 2) : [],
    requireInteraction: payload?.requireInteraction === true,
    renotify: payload?.renotify === true || Boolean(tag),
  }
}

async function notifyOpenClients(payload) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of clients) {
    if (!client.url.includes(BASE.replace(/\/$/, ''))) continue
    client.postMessage({
      type: 'PUSH_NOTIFICATION_SHOWN',
      notification_id: payload.data?.notification_id ?? null,
      tag: payload.tag ?? null,
    })
  }
}

async function handlePushEvent(event) {
  const payload = normalizePushPayload(event)

  try {
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      data: payload.data,
      actions: payload.actions,
      renotify: payload.renotify,
      requireInteraction: payload.requireInteraction,
    })
    await notifyOpenClients(payload)
  } catch (error) {
    console.error('push_show_notification_failed', {
      message: error?.message ?? 'unknown',
      tag: payload.tag ?? null,
      type: payload.data?.type ?? null,
    })

    await self.registration.showNotification('Shugyla Platform', {
      body: payload.body || 'У вас новое уведомление',
      icon: resolveAssetUrl(`${BASE}icons/icon-192.png`),
      badge: resolveAssetUrl(`${BASE}icons/icon-192.png`),
      tag: payload.tag || 'shugyla-notification-fallback',
      data: payload.data,
      renotify: false,
    })
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(handlePushEvent(event))
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
