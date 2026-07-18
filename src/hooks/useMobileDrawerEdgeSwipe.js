import { useEffect, useRef, useState } from 'react'

const MOBILE_QUERY = '(max-width: 900px)'
/** Жест открытия только от левого края */
const EDGE_ZONE_PX = 28
/** Порог, после которого выбираем ось жеста */
const AXIS_LOCK_PX = 10
/** Доля ширины drawer для snap open/close */
const SNAP_RATIO = 0.32
/** Скорость (px/ms), достаточная для snap по инерции */
const VELOCITY_SNAP = 0.45
const SETTLE_MS = 260

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}

function getTouch(event) {
  return event.touches?.[0] || event.changedTouches?.[0] || null
}

/**
 * Edge-swipe для мобильного navigation drawer (как Android / UMAG).
 * Desktop не затрагивается. Follow-finger через inline transform во время drag.
 */
export default function useMobileDrawerEdgeSwipe({
  enabled = true,
  isOpen,
  onOpenChange,
  layoutRef,
  sidebarRef,
  overlayRef,
}) {
  const [isDragging, setIsDragging] = useState(false)

  const isOpenRef = useRef(isOpen)
  const onOpenChangeRef = useRef(onOpenChange)
  const enabledRef = useRef(enabled)
  const draggingRef = useRef(false)
  const sessionRef = useRef(null)
  const settleTimerRef = useRef(0)

  isOpenRef.current = isOpen
  onOpenChangeRef.current = onOpenChange
  enabledRef.current = enabled

  useEffect(() => {
    if (!enabled) return undefined

    function getDrawerWidth() {
      const sidebar = sidebarRef.current
      if (sidebar?.offsetWidth) return sidebar.offsetWidth
      return Math.min(360, Math.round(window.innerWidth * 0.86))
    }

    function clearInlineStyles() {
      const sidebar = sidebarRef.current
      const overlay = overlayRef.current
      if (sidebar) {
        sidebar.style.transform = ''
        sidebar.style.transition = ''
        sidebar.style.boxShadow = ''
      }
      if (overlay) {
        overlay.style.opacity = ''
        overlay.style.pointerEvents = ''
        overlay.style.transition = ''
      }
    }

    function setDraggingClass(active) {
      draggingRef.current = active
      setIsDragging(active)
      layoutRef.current?.classList.toggle('platform-layout--drawer-dragging', active)
    }

    function applyDragVisual(offsetPx, width) {
      const sidebar = sidebarRef.current
      const overlay = overlayRef.current
      if (!sidebar) return

      const clamped = Math.max(0, Math.min(width, offsetPx))
      const progress = width > 0 ? clamped / width : 0

      sidebar.style.transition = 'none'
      sidebar.style.transform = `translateX(${clamped - width}px)`
      sidebar.style.boxShadow =
        progress > 0.02 ? '8px 0 32px rgba(20, 40, 28, 0.15)' : 'none'

      if (overlay) {
        overlay.style.transition = 'none'
        overlay.style.pointerEvents = progress > 0.02 ? 'auto' : 'none'
        overlay.style.opacity = progress > 0.02 ? String(0.15 + progress * 0.4) : '0'
      }
    }

    function settle(shouldOpen) {
      const sidebar = sidebarRef.current
      const overlay = overlayRef.current
      const width = getDrawerWidth()

      setDraggingClass(false)

      if (sidebar) {
        sidebar.style.transition = ''
        sidebar.style.transform = shouldOpen
          ? 'translateX(0)'
          : `translateX(-${width}px)`
        sidebar.style.boxShadow = shouldOpen
          ? '8px 0 32px rgba(20, 40, 28, 0.15)'
          : 'none'
      }
      if (overlay) {
        overlay.style.transition = ''
        overlay.style.opacity = shouldOpen ? '1' : '0'
        overlay.style.pointerEvents = shouldOpen ? 'auto' : 'none'
      }

      onOpenChangeRef.current?.(shouldOpen)

      window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = window.setTimeout(() => {
        // Class-based open/closed styles take over after the snap animation.
        if (draggingRef.current) return
        clearInlineStyles()
      }, SETTLE_MS)
    }

    function endSession(cancelled = false) {
      const session = sessionRef.current
      sessionRef.current = null
      if (!session) return
      if (session.mode !== 'drawer') return

      if (cancelled) {
        settle(isOpenRef.current)
        return
      }

      const width = session.width || getDrawerWidth()
      const offset = session.offset ?? (session.fromOpen ? width : 0)
      const velocity = session.velocity || 0

      const shouldOpen =
        velocity > VELOCITY_SNAP
          ? true
          : velocity < -VELOCITY_SNAP
            ? false
            : offset >= width * SNAP_RATIO

      settle(shouldOpen)
    }

    function onTouchStart(event) {
      if (!enabledRef.current || !isMobileViewport()) return
      if (event.touches.length !== 1) return
      if (sessionRef.current) return

      const touch = getTouch(event)
      if (!touch) return

      const open = isOpenRef.current
      if (!open && touch.clientX > EDGE_ZONE_PX) return

      window.clearTimeout(settleTimerRef.current)
      sessionRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        fromOpen: open,
        mode: 'undecided',
        width: getDrawerWidth(),
        offset: open ? getDrawerWidth() : 0,
        lastX: touch.clientX,
        lastTime: Date.now(),
        startTime: Date.now(),
      }
    }

    function onTouchMove(event) {
      const session = sessionRef.current
      if (!session || session.mode === 'ignore') return
      if (!enabledRef.current || !isMobileViewport()) return

      const touch = getTouch(event)
      if (!touch) return

      const dx = touch.clientX - session.startX
      const dy = touch.clientY - session.startY

      if (session.mode === 'undecided') {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return

        // Вертикальный scroll / pull-to-refresh — не перехватываем
        if (Math.abs(dy) >= Math.abs(dx)) {
          session.mode = 'ignore'
          return
        }

        if (!session.fromOpen && dx <= 0) {
          session.mode = 'ignore'
          return
        }

        if (session.fromOpen && dx >= 0) {
          session.mode = 'ignore'
          return
        }

        session.mode = 'drawer'
        session.width = getDrawerWidth()
        session.velocity = 0
        setDraggingClass(true)
      }

      if (session.mode !== 'drawer') return

      // Блокируем системный back-gesture и вертикальный scroll на время drag
      if (event.cancelable) event.preventDefault()

      const width = session.width || getDrawerWidth()
      const offset = session.fromOpen
        ? Math.max(0, Math.min(width, width + dx))
        : Math.max(0, Math.min(width, dx))

      const now = Date.now()
      const dt = Math.max(1, now - (session.lastTime || now))
      session.velocity = (offset - (session.offset ?? offset)) / dt
      session.offset = offset
      session.lastX = touch.clientX
      session.lastTime = now
      applyDragVisual(offset, width)
    }

    function onTouchEnd() {
      endSession(false)
    }

    function onTouchCancel() {
      endSession(true)
    }

    const moveOpts = { passive: false, capture: true }
    const startOpts = { passive: true, capture: true }

    document.addEventListener('touchstart', onTouchStart, startOpts)
    document.addEventListener('touchmove', onTouchMove, moveOpts)
    document.addEventListener('touchend', onTouchEnd, startOpts)
    document.addEventListener('touchcancel', onTouchCancel, startOpts)

    return () => {
      document.removeEventListener('touchstart', onTouchStart, startOpts)
      document.removeEventListener('touchmove', onTouchMove, moveOpts)
      document.removeEventListener('touchend', onTouchEnd, startOpts)
      document.removeEventListener('touchcancel', onTouchCancel, startOpts)
      window.clearTimeout(settleTimerRef.current)
      setDraggingClass(false)
      clearInlineStyles()
      sessionRef.current = null
    }
  }, [enabled, layoutRef, sidebarRef, overlayRef])

  // Когда open-состояние меняется без drag (бургер / Escape / route) — сбросить inline
  useEffect(() => {
    if (draggingRef.current) return
    const sidebar = sidebarRef.current
    const overlay = overlayRef.current
    if (sidebar) {
      sidebar.style.transform = ''
      sidebar.style.transition = ''
      sidebar.style.boxShadow = ''
    }
    if (overlay) {
      overlay.style.opacity = ''
      overlay.style.pointerEvents = ''
      overlay.style.transition = ''
    }
  }, [isOpen, sidebarRef, overlayRef])

  return { isDragging }
}
