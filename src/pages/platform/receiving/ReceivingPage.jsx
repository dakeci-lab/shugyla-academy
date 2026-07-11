import { useSession } from '../../../context/SessionContext'
import { canViewReceivingDocuments } from '../../../config/permissions'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import SimpleReceivingWeekView from '../../../components/procurement/SimpleReceivingWeekView'
import '../../../components/admin/admin-shared.css'
import './ReceivingPage.css'

/** Страница «Приёмка» — /platform/receiving */
export default function ReceivingPage() {
  const { user } = useSession()
  const canView = canViewReceivingDocuments(user)

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Приёмка»" />
  }

  return (
    <div className="receiving-page">
      <SimpleReceivingWeekView />
    </div>
  )
}
