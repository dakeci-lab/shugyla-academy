import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export const MOBILE_BACK_BLOCK_KEY = '__shugylaBlockBrowserBack'

/** Разрешить один следующий browser/history back (кнопка «Назад» в UI). */
let allowNextBrowserBack = false

export function allowMobileBrowserBackOnce() {
  allowNextBrowserBack = true
}

function currentPathname() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function withBlockMarker(state) {
  const base =
    state && typeof state === 'object' && !Array.isArray(state) ? { ...state } : {}
  base[MOBILE_BACK_BLOCK_KEY] = true
  return base
}

/**
 * Глобальная блокировка системного browser Back (edge-swipe / gesture)
 * во всей мобильной Platform PWA.
 *
 * Архитектура: history sentinel + popstate trap.
 * Любой неразрешённый popstate откатывается на текущий маршрут.
 * Кнопка «Назад» в UI: allowMobileBrowserBackOnce() перед navigate(-1).
 */
export default function useBlockMobileBrowserBack({
  enabled = false,
  onBlockedBack,
} = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const enabledRef = useRef(enabled)
  const lockedPathRef = useRef(currentPathname())
  const onBlockedBackRef = useRef(onBlockedBack)
  const restoringRef = useRef(false)

  enabledRef.current = enabled
  onBlockedBackRef.current = onBlockedBack
  lockedPathRef.current = `${location.pathname}${location.search}${location.hash}`

  const allowNextBack = useCallback(() => {
    allowMobileBrowserBackOnce()
  }, [])

  useEffect(() => {
    if (!enabled) return undefined

    function seedSentinel() {
      try {
        const state = window.history.state
        if (state && state[MOBILE_BACK_BLOCK_KEY]) return
        window.history.pushState(withBlockMarker(state), '', currentPathname())
      } catch {
        /* ignore */
      }
    }

    function restoreBlockedNavigation() {
      if (restoringRef.current) return
      restoringRef.current = true
      const stayAt = lockedPathRef.current

      try {
        const now = currentPathname()
        if (now !== stayAt) {
          navigate(stayAt, { replace: true })
        }
      } catch {
        /* ignore */
      }

      window.setTimeout(() => {
        seedSentinel()
        restoringRef.current = false
      }, 0)

      onBlockedBackRef.current?.()
    }

    function onPopState() {
      if (!enabledRef.current) return

      if (allowNextBrowserBack) {
        allowNextBrowserBack = false
        window.setTimeout(() => {
          lockedPathRef.current = currentPathname()
          seedSentinel()
        }, 0)
        return
      }

      restoreBlockedNavigation()
    }

    seedSentinel()
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [enabled, navigate])

  useEffect(() => {
    if (!enabled) return undefined
    if (allowNextBrowserBack || restoringRef.current) return undefined

    const id = window.setTimeout(() => {
      try {
        const state = window.history.state
        if (state && state[MOBILE_BACK_BLOCK_KEY]) return
        window.history.pushState(withBlockMarker(state), '', currentPathname())
      } catch {
        /* ignore */
      }
    }, 0)

    return () => window.clearTimeout(id)
  }, [enabled, location.key])

  return { allowNextBack }
}
