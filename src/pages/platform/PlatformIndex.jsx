import { Navigate } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { getFirstAllowedPlatformPath } from '../../platform/platformBootstrap'
import PlatformNoAccess from './PlatformNoAccess'

/**
 * Точка входа /platform. Отдельной главной страницы нет (раздел «Главная»/«Продажи» удалён).
 * Каждая роль попадает в первый доступный ей раздел (администратор и закупщик —
 * «Закуп», приёмщик — «Заказы»). Если разделов нет вообще
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
