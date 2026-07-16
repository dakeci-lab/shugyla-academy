import { isPwaStandalone } from '../utils/pwaStandalone'
import { clearShellCaches } from './pwaShellCache'

export const PWA_SHELL_RECOVERY_KEY = 'shugyla-pwa-shell-recovery'
export const PLATFORM_CHUNK_RELOAD_KEY = 'platform-chunk-reload'

export function isShellLoadError(error) {
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

export function createPlatformErrorId() {
  return `pwa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function logPlatformBootstrapFailure(error, extra = {}) {
  console.error('Platform bootstrap failed', {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
    cause: error?.cause,
    route: typeof window !== 'undefined' ? window.location.pathname : '',
    standalone: isPwaStandalone(),
    serviceWorkerController: Boolean(navigator?.serviceWorker?.controller),
    ...extra,
  })
}

/**
 * Clears only app-shell caches, updates SW, reloads once.
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

  window.location.reload()
  return true
}

export function setupShellLoadRecovery() {
  window.addEventListener('load', () => {
    sessionStorage.removeItem(PLATFORM_CHUNK_RELOAD_KEY)
    sessionStorage.removeItem(PWA_SHELL_RECOVERY_KEY)
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
    if (!isShellLoadError(event?.reason)) return
    if (sessionStorage.getItem(PWA_SHELL_RECOVERY_KEY)) return
    event.preventDefault()
    void recoverPwaShell({ reason: 'unhandled-chunk-error' })
  })
}
