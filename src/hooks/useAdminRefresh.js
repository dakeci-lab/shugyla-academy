import { useCallback, useState } from 'react'

/**
 * Хук для перерисовки разделов после изменений в localStorage.
 * Вызывайте refresh() после add/update операций.
 */
export function useAdminRefresh() {
  const [version, setVersion] = useState(0)

  const refresh = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  return { version, refresh }
}
