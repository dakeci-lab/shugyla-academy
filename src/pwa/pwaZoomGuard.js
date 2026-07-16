import { isPwaStandalone } from '../utils/pwaStandalone'

const NON_PASSIVE = { passive: false }

let installed = false
let teardown = null

function preventGesture(event) {
  event.preventDefault()
}

function preventMultiTouchZoom(event) {
  if (event.touches.length > 1) {
    event.preventDefault()
  }
}

/**
 * Optional progressive enhancement: blocks pinch zoom in installed PWA only.
 * Failures must not block app bootstrap.
 */
export function installPwaZoomGuard() {
  if (installed) return teardown || (() => {})

  try {
    if (!isPwaStandalone()) return () => {}

    document.addEventListener('gesturestart', preventGesture, NON_PASSIVE)
    document.addEventListener('gesturechange', preventGesture, NON_PASSIVE)
    document.addEventListener('gestureend', preventGesture, NON_PASSIVE)
    document.addEventListener('touchmove', preventMultiTouchZoom, NON_PASSIVE)

    const cleanup = () => {
      document.removeEventListener('gesturestart', preventGesture, NON_PASSIVE)
      document.removeEventListener('gesturechange', preventGesture, NON_PASSIVE)
      document.removeEventListener('gestureend', preventGesture, NON_PASSIVE)
      document.removeEventListener('touchmove', preventMultiTouchZoom, NON_PASSIVE)
      installed = false
      teardown = null
    }

    window.addEventListener('pagehide', cleanup, { once: true })
    installed = true
    teardown = cleanup
    return cleanup
  } catch (error) {
    console.warn('PWA zoom guard could not be installed', error)
    return () => {}
  }
}

/** @deprecated Use installPwaZoomGuard */
export function setupPwaZoomGuard() {
  return installPwaZoomGuard()
}
