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
 *
 * options.showBack — круглая кнопка Back в мобильном header вместо burger.
 * options.backFallback — куда идти, если history назад недоступна.
 */
export function usePlatformPageTitle(title, description = '', options = {}) {
  const context = usePlatformPageTitleContext()
  const showBack = options?.showBack === true
  const backFallback = options?.backFallback || ''

  useEffect(() => {
    if (!context || !title) return undefined
    context.setPageTitle({ title, description, showBack, backFallback })
    return () => context.clearPageTitle()
  }, [context, title, description, showBack, backFallback])
}
