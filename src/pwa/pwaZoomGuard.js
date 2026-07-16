import { isPwaStandalone } from '../utils/pwaStandalone'

const NON_PASSIVE = { passive: false }

function preventGesture(event) {
  event.preventDefault()
}

function preventMultiTouchZoom(event) {
  if (event.touches.length > 1) {
    event.preventDefault()
  }
}

/**
 * Blocks pinch/double-finger zoom in installed PWA only.
 * Single-finger pan/scroll is preserved.
 */
export function setupPwaZoomGuard() {
  if (!isPwaStandalone()) return () => {}

  document.addEventListener('gesturestart', preventGesture, NON_PASSIVE)
  document.addEventListener('gesturechange', preventGesture, NON_PASSIVE)
  document.addEventListener('gestureend', preventGesture, NON_PASSIVE)
  document.addEventListener('touchmove', preventMultiTouchZoom, NON_PASSIVE)

  const teardown = () => {
    document.removeEventListener('gesturestart', preventGesture, NON_PASSIVE)
    document.removeEventListener('gesturechange', preventGesture, NON_PASSIVE)
    document.removeEventListener('gestureend', preventGesture, NON_PASSIVE)
    document.removeEventListener('touchmove', preventMultiTouchZoom, NON_PASSIVE)
  }

  window.addEventListener('pagehide', teardown, { once: true })

  return teardown
}
