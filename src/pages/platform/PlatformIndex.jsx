import { Navigate } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { getFirstAllowedPlatformPath } from '../../platform/platformBootstrap'
import PlatformNoAccess from './PlatformNoAccess'

/**
 * Точка входа /platform. Отдельной главной страницы нет: «Главная» — это бывшие
 * «Продажи». Каждая роль попадает в первый доступный ей раздел (администратор —
 * «Главная», закупщик — «Закуп», приёмщик — «Заказы»). Если разделов нет вообще
 * (кассир, продавец, администратор зала) — страница с объяснением.
 */
export default function PlatformIndex() {
  const { user } = useSession()
  const target = getFirstAllowedPlatformPath(user)
  if (target && target !== '/platform') {
    return <Navigate to={target} replace />
  }
  return <PlatformNoAccess />
}
