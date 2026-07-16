export const PWA_STANDALONE_CLASS = 'pwa-standalone'

export const PWA_STANDALONE_VIEWPORT =
  'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'

/** Installed PWA / iOS home screen / Android standalone launcher. */
export function isPwaStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  )
}

export function applyPwaStandaloneViewport() {
  if (!isPwaStandalone()) return
  const viewport = document.querySelector('meta[name="viewport"]')
  if (viewport) {
    viewport.setAttribute('content', PWA_STANDALONE_VIEWPORT)
  }
}

export function markPwaStandaloneRoot() {
  if (!isPwaStandalone()) return
  document.documentElement.classList.add(PWA_STANDALONE_CLASS)
}

export function setupPwaStandaloneDocument() {
  if (!isPwaStandalone()) return () => {}

  markPwaStandaloneRoot()
  applyPwaStandaloneViewport()

  const onOrientationChange = () => {
    applyPwaStandaloneViewport()
  }

  window.addEventListener('orientationchange', onOrientationChange)

  return () => {
    window.removeEventListener('orientationchange', onOrientationChange)
    document.documentElement.classList.remove(PWA_STANDALONE_CLASS)
  }
}
