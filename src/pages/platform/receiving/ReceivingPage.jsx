import { useMemo } from 'react'
import { useSession } from '../../../context/SessionContext'
import { canViewReceivingDocuments } from '../../../config/permissions'
import { getReceivingDocumentsSync } from '../../../services/receivingDataService'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import ReceivingStatsCards from '../../../components/receiving/ReceivingStatsCards'
import ReceivingTable from '../../../components/receiving/ReceivingTable'
import '../../../components/admin/admin-shared.css'
import '../procurement/ProcurementPage.css'

/** Страница «Приёмка» — /platform/receiving */
export default function ReceivingPage() {
  const { user } = useSession()
  const { version } = useAdminRefresh()
  const canView = canViewReceivingDocuments(user)

  void version

  const documents = useMemo(() => getReceivingDocumentsSync(), [version])

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Приёмка»" />
  }

  return (
    <div className="procurement-page">
      <ReceivingStatsCards documents={documents} />

      <section className="procurement-page__section">
        <h2 className="procurement-page__section-title">Список приёмок</h2>
        <ReceivingTable documents={documents} />
      </section>
    </div>
  )
}
