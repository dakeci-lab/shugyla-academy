import { useCallback, useEffect, useRef, useState } from 'react'
import { usePullToRefresh } from '../../context/PullToRefreshContext'
import './PullToRefresh.css'

const THRESHOLD = 72
const MAX_PULL = 120
const RESISTANCE = 0.5
const REFRESHING_HEIGHT = 52
const MOBILE_QUERY = '(max-width: 900px)'

function getScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}

/** Pull-to-refresh для мобильной PWA — только в верхней части страницы. */
export default function PullToRefresh({ children, disabled = false, className = '' }) {
  const { performRefresh } = usePullToRefresh()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
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

    setRefreshing(true)
    setAnimating(true)
    setPullDistance(REFRESHING_HEIGHT)

    try {
      await performRefresh()
    } catch (error) {
      console.error('[PullToRefresh] refresh failed:', error)
    } finally {
      setRefreshing(false)
      setPullDistance(0)
      window.setTimeout(() => setAnimating(false), 280)
    }
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

      if (pullRef.current >= THRESHOLD) {
        triggerRefresh()
        return
      }

      setAnimating(true)
      setPullDistance(0)
      window.setTimeout(() => setAnimating(false), 280)
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
  const showIndicator = offset > 0 || refreshing

  return (
    <div className={`pull-to-refresh ${className}`.trim()}>
      <div
        className={`pull-to-refresh__indicator${showIndicator ? ' pull-to-refresh__indicator--visible' : ''}`}
        aria-hidden={!showIndicator}
        style={{ height: showIndicator ? offset : 0 }}
      >
        <span
          className={`pull-to-refresh__spinner${refreshing ? ' pull-to-refresh__spinner--spinning' : ''}`}
          style={{ opacity: showIndicator ? Math.min(1, offset / THRESHOLD) : 0 }}
        />
      </div>

      <div
        className={`pull-to-refresh__body${animating ? ' pull-to-refresh__body--animating' : ''}`}
        style={{ transform: offset > 0 ? `translateY(${offset}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  )
}
