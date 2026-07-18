import { useEffect, useRef, useState } from 'react'

const MOBILE_QUERY = '(max-width: 900px)'
/** Жест открытия только от левого края */
const EDGE_ZONE_PX = 32
/** Порог выбора оси */
const AXIS_LOCK_PX = 8
/** Доля ширины drawer для snap open/close */
const SNAP_RATIO = 0.32
/** Скорость (px/ms) для snap по инерции */
const VELOCITY_SNAP = 0.45
const SETTLE_MS = 260
/** Окно перехвата случайного popstate от системного «Назад» */
const HISTORY_GUARD_MS = 1000

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}

function getTouch(event) {
  return event.touches?.[0] || event.changedTouches?.[0] || null
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

/**
 * Edge-swipe для мобильного navigation drawer.
 *
 * Первопричина конфликта с системным «Назад»:
 * браузер начинает history-navigation с левого края ДО preventDefault
 * (мы ждали AXIS_LOCK). Исправление:
 * 1) edge-зона с touch-action: none забирает жест у браузера сразу;
 * 2) preventDefault на первом же движении вправо с края;
 * 3) короткий popstate-guard восстанавливает маршрут через React Router,
 *    если OS всё же успела сделать Back (без сырого history.pushState).
 */
export default function useMobileDrawerEdgeSwipe({
  enabled = true,
  isOpen,
  onOpenChange,
  onRestorePath,
  layoutRef,
  sidebarRef,
  overlayRef,
  edgeRef,
}) {
  const [isDragging, setIsDragging] = useState(false)

  const isOpenRef = useRef(isOpen)
  const onOpenChangeRef = useRef(onOpenChange)
  const onRestorePathRef = useRef(onRestorePath)
  const enabledRef = useRef(enabled)
  const draggingRef = useRef(false)
  const sessionRef = useRef(null)
  const settleTimerRef = useRef(0)
  const historyGuardRef = useRef({
    armed: false,
    lockedPath: null,
    timer: 0,
  })

  isOpenRef.current = isOpen
  onOpenChangeRef.current = onOpenChange
  onRestorePathRef.current = onRestorePath
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

    function disarmHistoryGuard() {
      const guard = historyGuardRef.current
      window.clearTimeout(guard.timer)
      guard.armed = false
      guard.lockedPath = null
    }

    function armHistoryGuard() {
      const guard = historyGuardRef.current
      guard.armed = true
      guard.lockedPath = currentPath()
      window.clearTimeout(guard.timer)
      guard.timer = window.setTimeout(() => {
        disarmHistoryGuard()
      }, HISTORY_GUARD_MS)
    }

    function onPopState() {
      const guard = historyGuardRef.current
      if (!guard.armed || !guard.lockedPath) return

      const restoreTo = guard.lockedPath
      // Системный Back сработал вместе со свайпом — возвращаем маршрут и открываем меню.
      onRestorePathRef.current?.(restoreTo)
      onOpenChangeRef.current?.(true)

      window.clearTimeout(guard.timer)
      guard.timer = window.setTimeout(() => {
        disarmHistoryGuard()
      }, HISTORY_GUARD_MS)
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
        if (draggingRef.current) return
        clearInlineStyles()
      }, SETTLE_MS)

      if (shouldOpen) {
        window.clearTimeout(historyGuardRef.current.timer)
        historyGuardRef.current.timer = window.setTimeout(() => {
          disarmHistoryGuard()
        }, 450)
      } else {
        disarmHistoryGuard()
      }
    }

    function endSession(cancelled = false) {
      const session = sessionRef.current
      sessionRef.current = null
      if (!session) return
      if (session.mode !== 'drawer') {
        if (session.fromEdge) disarmHistoryGuard()
        return
      }

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

    function beginSession(touch, { fromEdge }) {
      if (sessionRef.current) return

      const open = isOpenRef.current
      if (!open && !fromEdge && touch.clientX > EDGE_ZONE_PX) return

      window.clearTimeout(settleTimerRef.current)

      if (!open && fromEdge) {
        armHistoryGuard()
      }

      sessionRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        fromOpen: open,
        fromEdge: Boolean(fromEdge) || (!open && touch.clientX <= EDGE_ZONE_PX),
        mode: 'undecided',
        width: getDrawerWidth(),
        offset: open ? getDrawerWidth() : 0,
        lastX: touch.clientX,
        lastTime: Date.now(),
        startTime: Date.now(),
        velocity: 0,
      }
    }

    function onTouchStart(event) {
      if (!enabledRef.current || !isMobileViewport()) return
      if (event.touches.length !== 1) return

      const touch = getTouch(event)
      if (!touch) return

      const edgeEl = edgeRef?.current
      const fromEdge =
        Boolean(edgeEl && (event.target === edgeEl || edgeEl.contains(event.target))) ||
        (!isOpenRef.current && touch.clientX <= EDGE_ZONE_PX)

      beginSession(touch, { fromEdge })
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
        // С края: preventDefault сразу при движении вправо — до AXIS_LOCK.
        if (session.fromEdge && !session.fromOpen && dx > 0) {
          if (event.cancelable) event.preventDefault()
          if (!historyGuardRef.current.armed) armHistoryGuard()
        }

        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return

        if (Math.abs(dy) > Math.abs(dx)) {
          session.mode = 'ignore'
          if (session.fromEdge) disarmHistoryGuard()
          return
        }

        if (!session.fromOpen && dx <= 0) {
          session.mode = 'ignore'
          if (session.fromEdge) disarmHistoryGuard()
          return
        }

        if (session.fromOpen && dx >= 0) {
          session.mode = 'ignore'
          return
        }

        session.mode = 'drawer'
        session.width = getDrawerWidth()
        session.velocity = 0
        if (session.fromEdge && !session.fromOpen && !historyGuardRef.current.armed) {
          armHistoryGuard()
        }
        setDraggingClass(true)
      }

      if (session.mode !== 'drawer') return

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

    const nonPassiveCapture = { passive: false, capture: true }
    const passiveCapture = { passive: true, capture: true }

    document.addEventListener('touchstart', onTouchStart, passiveCapture)
    document.addEventListener('touchmove', onTouchMove, nonPassiveCapture)
    document.addEventListener('touchend', onTouchEnd, passiveCapture)
    document.addEventListener('touchcancel', onTouchCancel, passiveCapture)
    window.addEventListener('popstate', onPopState)

    const edgeEl = edgeRef?.current
    if (edgeEl) {
      edgeEl.addEventListener('touchstart', onTouchStart, nonPassiveCapture)
      edgeEl.addEventListener('touchmove', onTouchMove, nonPassiveCapture)
      edgeEl.addEventListener('touchend', onTouchEnd, passiveCapture)
      edgeEl.addEventListener('touchcancel', onTouchCancel, passiveCapture)
    }

    return () => {
      document.removeEventListener('touchstart', onTouchStart, passiveCapture)
      document.removeEventListener('touchmove', onTouchMove, nonPassiveCapture)
      document.removeEventListener('touchend', onTouchEnd, passiveCapture)
      document.removeEventListener('touchcancel', onTouchCancel, passiveCapture)
      window.removeEventListener('popstate', onPopState)
      if (edgeEl) {
        edgeEl.removeEventListener('touchstart', onTouchStart, nonPassiveCapture)
        edgeEl.removeEventListener('touchmove', onTouchMove, nonPassiveCapture)
        edgeEl.removeEventListener('touchend', onTouchEnd, passiveCapture)
        edgeEl.removeEventListener('touchcancel', onTouchCancel, passiveCapture)
      }
      window.clearTimeout(settleTimerRef.current)
      disarmHistoryGuard()
      setDraggingClass(false)
      clearInlineStyles()
      sessionRef.current = null
    }
  }, [enabled, layoutRef, sidebarRef, overlayRef, edgeRef])

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
