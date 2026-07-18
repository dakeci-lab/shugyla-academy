import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const PlatformPageTitleContext = createContext(null)

/** Переопределение заголовка страницы для layout (опционально) */
export function PlatformPageTitleProvider({ children }) {
  const [override, setOverride] = useState(null)

  const setPageTitle = useCallback((next) => {
    setOverride(next)
  }, [])

  const clearPageTitle = useCallback(() => {
    setOverride(null)
  }, [])

  const value = useMemo(
    () => ({
      override,
      setPageTitle,
      clearPageTitle,
    }),
    [override, setPageTitle, clearPageTitle]
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
 * options.actions — правый слот мобильного header (React node).
 *
 * Важно: эффект зависит только от стабильных setters, не от всего context value.
 * Иначе setPageTitle → новый context → cleanup clear → set снова = бесконечный цикл
 * (ломает навигацию Drawer после страницы «Уведомления»).
 */
export function usePlatformPageTitle(title, description = '', options = {}) {
  const { setPageTitle, clearPageTitle } = usePlatformPageTitleContext() || {}
  const showBack = options?.showBack === true
  const backFallback = options?.backFallback || ''
  const actions = options?.actions ?? null

  useEffect(() => {
    if (!setPageTitle || !title) return undefined
    setPageTitle({ title, description, showBack, backFallback, actions })
    return () => {
      clearPageTitle?.()
    }
  }, [setPageTitle, clearPageTitle, title, description, showBack, backFallback, actions])
}
