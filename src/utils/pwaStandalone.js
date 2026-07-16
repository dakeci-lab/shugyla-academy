export const PWA_STANDALONE_CLASS = 'pwa-standalone'

export const PWA_STANDALONE_VIEWPORT =
  'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'

/** Installed PWA / iOS home screen / Android standalone launcher. */
export function isPwaStandalone() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  try {
    return (
      window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
      window.matchMedia?.('(display-mode: fullscreen)')?.matches === true ||
      window.navigator?.standalone === true
    )
  } catch (error) {
    console.warn('Failed to detect PWA standalone mode', error)
    return false
  }
}

export function applyPwaStandaloneViewport() {
  if (!isPwaStandalone()) return
  try {
    const viewport = document.querySelector('meta[name="viewport"]')
    if (viewport) {
      viewport.setAttribute('content', PWA_STANDALONE_VIEWPORT)
    }
  } catch (error) {
    console.warn('Failed to apply PWA viewport', error)
  }
}

export function markPwaStandaloneRoot() {
  if (!isPwaStandalone()) return
  try {
    document.documentElement.classList.add(PWA_STANDALONE_CLASS)
  } catch (error) {
    console.warn('Failed to mark PWA standalone root', error)
  }
}

export function setupPwaStandaloneDocument() {
  if (!isPwaStandalone()) return () => {}

  try {
    markPwaStandaloneRoot()
    applyPwaStandaloneViewport()
  } catch (error) {
    console.warn('PWA standalone document setup failed', error)
    return () => {}
  }

  const onOrientationChange = () => {
    applyPwaStandaloneViewport()
  }

  window.addEventListener('orientationchange', onOrientationChange)

  return () => {
    window.removeEventListener('orientationchange', onOrientationChange)
    document.documentElement.classList.remove(PWA_STANDALONE_CLASS)
  }
}
