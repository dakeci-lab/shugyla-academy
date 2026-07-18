import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

const PullToRefreshContext = createContext({
  registerHandler: () => () => {},
  performRefresh: async () => {},
  isRefreshing: false,
})

export function PullToRefreshProvider({ children, onGlobalRefresh }) {
  const handlerRef = useRef(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const registerHandler = useCallback((handler) => {
    handlerRef.current = handler
    return () => {
      if (handlerRef.current === handler) {
        handlerRef.current = null
      }
    }
  }, [])

  const performRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await onGlobalRefresh?.()
      if (handlerRef.current) {
        // Quiet refresh: keep stale UI visible while new data loads.
        await handlerRef.current({ quiet: true })
      }
    } finally {
      setIsRefreshing(false)
    }
  }, [onGlobalRefresh])

  const value = useMemo(
    () => ({
      registerHandler,
      performRefresh,
      isRefreshing,
    }),
    [registerHandler, performRefresh, isRefreshing]
  )

  return (
    <PullToRefreshContext.Provider value={value}>
      {children}
    </PullToRefreshContext.Provider>
  )
}

/**
 * Регистрация локального обновления текущей страницы (поверх глобального reload).
 * При pull-to-refresh handler вызывается с `{ quiet: true }` — не очищайте UI.
 */
export function usePlatformPageRefresh(refreshFn) {
  const { registerHandler } = useContext(PullToRefreshContext)
  const refreshRef = useRef(refreshFn)
  refreshRef.current = refreshFn

  useEffect(() => {
    return registerHandler(async (options) => {
      await refreshRef.current?.(options)
    })
  }, [registerHandler])
}

/** Состояние глобального/страничного refresh для компактного индикатора. */
export function useRefreshIndicator() {
  const { isRefreshing } = useContext(PullToRefreshContext)
  return { isRefreshing }
}

export function usePullToRefresh() {
  return useContext(PullToRefreshContext)
}
