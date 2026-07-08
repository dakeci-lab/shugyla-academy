import { useCallback, useState } from 'react'
import { useAcademyData } from '../context/AcademyDataContext'

/**
 * Хук для перерисовки разделов после изменений данных.
 * Вызывайте refresh() после add/update операций.
 */
export function useAdminRefresh() {
  const { version: dataVersion, reload } = useAcademyData()
  const [version, setVersion] = useState(0)

  const refresh = useCallback(async () => {
    await reload()
    setVersion((v) => v + 1)
  }, [reload])

  return { version: version + dataVersion, refresh }
}
