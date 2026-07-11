import { useCallback, useState } from 'react'
import { useAcademyData } from '../context/AcademyDataContext'

/**
 * Хук для перерисовки разделов после изменений данных.
 * Вызывайте refresh() после add/update операций.
 */
export function useAdminRefresh() {
  const { version: dataVersion, reload, notifyChange } = useAcademyData()
  const [version, setVersion] = useState(0)

  const refresh = useCallback(async () => {
    await reload()
    setVersion((v) => v + 1)
  }, [reload])

  const bump = useCallback(() => {
    notifyChange()
    setVersion((v) => v + 1)
  }, [notifyChange])

  return { version: version + dataVersion, refresh, notifyChange: bump }
}
