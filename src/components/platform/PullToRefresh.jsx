import { useCallback, useEffect, useRef, useState } from 'react'
import { usePullToRefresh } from '../../context/PullToRefreshContext'
import PageRefreshIndicator from './PageRefreshIndicator'
import './PullToRefresh.css'

const THRESHOLD = 72
const MAX_PULL = 120
const RESISTANCE = 0.5
const REFRESHING_HEIGHT = 80
const DONE_HOLD_MS = 650
const HIDE_DURATION_MS = 320
const MOBILE_QUERY = '(max-width: 900px)'

function getScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}

/**
 * Pull-to-refresh для мобильной PWA.
 * Важно: оборачивать только content area — Header должен оставаться снаружи.
 */
export default function PullToRefresh({ children, disabled = false, className = '' }) {
  const { performRefresh } = usePullToRefresh()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [done, setDone] = useState(false)
  const [hiding, setHiding] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [animating, setAnimating] = useState(false)

  const startYRef = useRef(0)
  const pullingRef = useRef(false)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)
  const disabledRef = useRef(disabled)

  disabledRef.current = disabled
  refreshingRef.current = refreshing

  const setPullDistance = useCallback((value) => {
    pullRef.current = value
    setPull(value)
  }, [])

  const triggerRefresh = useCallback(async () => {
    if (refreshingRef.current) return

    setDragging(false)
    setRefreshing(true)
    setHiding(false)
    setAnimating(true)
    setPullDistance(REFRESHING_HEIGHT)

    let succeeded = false
    try {
      await performRefresh()
      succeeded = true
    } catch (error) {
      console.error('[PullToRefresh] refresh failed:', error)
    }

    // Success: the ring turns into a green check for a moment («Обновлено»), then everything slides up.
    if (succeeded) {
      setDone(true)
      await new Promise((resolve) => window.setTimeout(resolve, DONE_HOLD_MS))
    }
    setRefreshing(false)
    setDone(false)
    setHiding(true)
    setPullDistance(0)
    window.setTimeout(() => {
      setHiding(false)
      setAnimating(false)
    }, HIDE_DURATION_MS)
  }, [performRefresh, setPullDistance])

  useEffect(() => {
    if (disabled) return undefined

    function canStartPull() {
      return (
        isMobileViewport()
        && !disabledRef.current
        && !refreshingRef.current
        && getScrollTop() <= 0
      )
    }

    function onTouchStart(event) {
      if (!canStartPull()) return
      startYRef.current = event.touches[0].clientY
      pullingRef.current = false
    }

    function onTouchMove(event) {
      if (refreshingRef.current || disabledRef.current || !isMobileViewport()) return

      const touchY = event.touches[0].clientY
      const delta = touchY - startYRef.current

      if (!pullingRef.current) {
        if (delta <= 0 || getScrollTop() > 0) return
        pullingRef.current = true
        setDragging(true)
      }

      if (!pullingRef.current) return

      event.preventDefault()
      document.documentElement.classList.add('platform-pull-active')
      const nextPull = Math.min(MAX_PULL, delta * RESISTANCE)
      setPullDistance(nextPull)
    }

    function onTouchEnd() {
      document.documentElement.classList.remove('platform-pull-active')

      if (!pullingRef.current) return
      pullingRef.current = false
      setDragging(false)

      if (pullRef.current >= THRESHOLD) {
        triggerRefresh()
        return
      }

      setAnimating(true)
      setPullDistance(0)
      window.setTimeout(() => setAnimating(false), HIDE_DURATION_MS)
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)

    return () => {
      document.documentElement.classList.remove('platform-pull-active')
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [disabled, setPullDistance, triggerRefresh])

  const offset = refreshing ? REFRESHING_HEIGHT : pull
  const showIndicator = offset > 0 || refreshing || hiding
  const pullProgress = Math.min(1, pull / THRESHOLD)

  return (
    <div className={`pull-to-refresh ${className}`.trim()}>
      <PageRefreshIndicator
        visible={showIndicator}
        refreshing={refreshing && !done}
        done={done}
        dragging={dragging}
        hiding={hiding}
        height={refreshing ? REFRESHING_HEIGHT : offset}
        pullProgress={pullProgress}
      />

      <div
        className={`pull-to-refresh__body${animating ? ' pull-to-refresh__body--animating' : ''}`}
        style={{ transform: offset > 0 ? `translateY(${offset}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  )
}
