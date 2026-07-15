import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const PlatformPageTitleContext = createContext(null)

/** Переопределение заголовка страницы для layout (опционально) */
export function PlatformPageTitleProvider({ children }) {
  const [override, setOverride] = useState(null)

  const value = useMemo(
    () => ({
      override,
      setPageTitle: setOverride,
      clearPageTitle: () => setOverride(null),
    }),
    [override]
  )

  return (
    <PlatformPageTitleContext.Provider value={value}>
      {children}
    </PlatformPageTitleContext.Provider>
  )
}

export function usePlatformPageTitleContext() {
  return useContext(PlatformPageTitleContext)
}

/**
 * Задать заголовок текущей страницы в layout.
 * Используйте для динамических экранов; для статических маршрутов достаточно platformNav.
 */
export function usePlatformPageTitle(title, description = '') {
  const context = usePlatformPageTitleContext()

  useEffect(() => {
    if (!context || !title) return undefined
    context.setPageTitle({ title, description })
    return () => context.clearPageTitle()
  }, [context, title, description])
}
