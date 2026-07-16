import { isPwaStandalone } from '../utils/pwaStandalone'
import { getAppUrl, getRecoveryTargetUrl, isInsideAppBase } from '../router/basename'
import { clearShellCaches } from './pwaShellCache'

export const PWA_SHELL_RECOVERY_KEY = 'shugyla-pwa-shell-recovery'
export const PLATFORM_CHUNK_RELOAD_KEY = 'platform-chunk-reload'

export function isPwaShellLoadError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  const name = String(error?.name || '').toLowerCase()

  return (
    name.includes('chunkloaderror') ||
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('loading chunk') ||
    message.includes('chunk load') ||
    message.includes('mime type') ||
    message.includes('text/html') ||
    message.includes('is not a valid javascript mime type')
  )
}

/** @deprecated Use isPwaShellLoadError */
export const isShellLoadError = isPwaShellLoadError

export function createPlatformErrorId() {
  return `pwa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function logPlatformBootstrapFailure(error, extra = {}) {
  console.error('Platform bootstrap failed', {
    errorId: extra.errorId,
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
    cause: error?.cause,
    pathname: typeof window !== 'undefined' ? window.location.pathname : '',
    href: typeof window !== 'undefined' ? window.location.href : '',
    baseUrl: import.meta.env.BASE_URL,
    standalone: isPwaStandalone(),
    serviceWorkerController: Boolean(typeof navigator !== 'undefined' && navigator?.serviceWorker?.controller),
    ...extra,
  })
}

/**
 * Clears only app-shell caches, updates SW, reloads once at the correct app URL.
 * Does not touch Supabase Auth storage.
 */
export async function recoverPwaShell({ reason = 'manual' } = {}) {
  if (sessionStorage.getItem(PWA_SHELL_RECOVERY_KEY)) {
    console.warn('PWA shell recovery already attempted in this session', { reason })
    return false
  }

  sessionStorage.setItem(PWA_SHELL_RECOVERY_KEY, reason)

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      await registration?.update()

      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
    }

    const cleared = await clearShellCaches()
    console.warn('PWA shell caches cleared before reload', { reason, cleared })
  } catch (error) {
    console.warn('PWA shell recovery preparation failed', {
      reason,
      message: error?.message,
    })
  }

  const targetUrl = getRecoveryTargetUrl()
  if (typeof window !== 'undefined' && window.location.href !== targetUrl) {
    window.location.replace(targetUrl)
  } else if (typeof window !== 'undefined') {
    window.location.reload()
  }
  return true
}

export function setupShellLoadRecovery() {
  window.addEventListener('load', () => {
    sessionStorage.removeItem(PLATFORM_CHUNK_RELOAD_KEY)
    sessionStorage.removeItem(PWA_SHELL_RECOVERY_KEY)

    if (!isInsideAppBase()) {
      console.warn('App opened outside GitHub Pages base path, redirecting', {
        pathname: window.location.pathname,
        target: getAppUrl(),
      })
      window.location.replace(getAppUrl())
    }
  })

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    if (sessionStorage.getItem(PWA_SHELL_RECOVERY_KEY)) return
    void recoverPwaShell({ reason: 'vite-preload-error' })
  })

  window.addEventListener('error', (event) => {
    const target = event?.target
    if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
      if (sessionStorage.getItem(PWA_SHELL_RECOVERY_KEY)) return
      void recoverPwaShell({ reason: 'asset-load-error' })
    }
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (!isPwaShellLoadError(event?.reason)) return
    if (sessionStorage.getItem(PWA_SHELL_RECOVERY_KEY)) return
    event.preventDefault()
    void recoverPwaShell({ reason: 'unhandled-chunk-error' })
  })
}
