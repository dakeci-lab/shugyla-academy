import { useSession } from '../../../context/SessionContext'
import { canViewUmagSettlements } from '../../../config/permissions'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import UmagSettlementsPanel from '../../../components/suppliers/settlements/UmagSettlementsPanel'
import '../../../components/admin/admin-shared.css'
import './SettlementsPage.css'

/**
 * Взаиморасчёты (UMAG) — /platform/settlements
 *
 * Отдельный раздел группы «Закупки». Структура страницы готова к будущим
 * вкладкам (акты сверки, расхождения, документы) без смены route/меню.
 */
export default function SettlementsPage() {
  const { user } = useSession()

  if (!canViewUmagSettlements(user)) {
    return <PlatformAccessDenied title="Нет доступа к взаиморасчётам" />
  }

  return (
    <div className="settlements-page">
      <UmagSettlementsPanel />
    </div>
  )
}
