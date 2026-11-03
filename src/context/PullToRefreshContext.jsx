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
  // A page (and parts of it, e.g. the list and the open card) register their own refresh; all of them run together.
  const handlersRef = useRef(new Set())
  const [isRefreshing, setIsRefreshing] = useState(false)

  const registerHandler = useCallback((handler) => {
    handlersRef.current.add(handler)
    return () => {
      handlersRef.current.delete(handler)
    }
  }, [])

  const performRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const handlers = [...handlersRef.current]
      if (handlers.length === 0) {
        // The page registered nothing: refresh only what this route needs (the layout decides), never everything.
        await onGlobalRefresh?.()
      } else {
        // Quiet refresh: keep stale UI visible while new data loads. Only the current page's data is reloaded.
        await Promise.allSettled(handlers.map((handler) => handler({ quiet: true })))
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
 * Регистрация обновления текущей страницы (или её части). Свайп обновляет ТОЛЬКО то, что зарегистрировано
 * на открытой странице; без регистраций — только модули маршрута (см. PlatformLayout).
 * Handler вызывается с `{ quiet: true }` — не очищайте UI. Возвращайте промис: по нему гаснет индикатор.
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
