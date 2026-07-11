import { createContext, useCallback, useContext, useEffect, useRef } from 'react'

const PullToRefreshContext = createContext({
  registerHandler: () => () => {},
  performRefresh: async () => {},
})

export function PullToRefreshProvider({ children, onGlobalRefresh }) {
  const handlerRef = useRef(null)

  const registerHandler = useCallback((handler) => {
    handlerRef.current = handler
    return () => {
      if (handlerRef.current === handler) {
        handlerRef.current = null
      }
    }
  }, [])

  const performRefresh = useCallback(async () => {
    await onGlobalRefresh?.()
    if (handlerRef.current) {
      await handlerRef.current()
    }
  }, [onGlobalRefresh])

  return (
    <PullToRefreshContext.Provider value={{ registerHandler, performRefresh }}>
      {children}
    </PullToRefreshContext.Provider>
  )
}

/** Регистрация локального обновления текущей страницы (поверх глобального reload). */
export function usePlatformPageRefresh(refreshFn) {
  const { registerHandler } = useContext(PullToRefreshContext)
  const refreshRef = useRef(refreshFn)
  refreshRef.current = refreshFn

  useEffect(() => {
    return registerHandler(async () => {
      await refreshRef.current?.()
    })
  }, [registerHandler])
}

export function usePullToRefresh() {
  return useContext(PullToRefreshContext)
}
