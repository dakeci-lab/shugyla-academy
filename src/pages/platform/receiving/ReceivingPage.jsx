import { useMemo } from 'react'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { canViewReceivingDocuments } from '../../../config/permissions'
import { getReceivingDocumentsSync, isReceivingDataReady } from '../../../services/receivingDataService'
import { isCloudMode } from '../../../lib/dataMode'
import useStableWhenReady from '../../../hooks/useStableWhenReady'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import SimpleReceivingWeekView from '../../../components/procurement/SimpleReceivingWeekView'
import AnalyticsReceivingList from '../../../components/receiving/AnalyticsReceivingList'
import '../../../components/admin/admin-shared.css'
import './ReceivingPage.css'

/** Страница «Приёмка» — /platform/receiving */
export default function ReceivingPage() {
  const { user } = useSession()
  const { version: dataVersion } = usePlatformData()
  const { version } = useAdminRefresh()
  const canView = canViewReceivingDocuments(user)

  void version
  void dataVersion

  const receivingReady = !isCloudMode() || isReceivingDataReady()
  const stableDocuments = useStableWhenReady(getReceivingDocumentsSync(), receivingReady)
  const analyticsCount = useMemo(
    () =>
      (stableDocuments || []).filter(
        (doc) => (doc.workflowMode || doc.workflow_mode) !== 'simple'
      ).length,
    [stableDocuments, version, dataVersion]
  )

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Приёмка»" />
  }

  return (
    <div className="receiving-page">
      <SimpleReceivingWeekView />

      <section className="receiving-page__analytics">
        <h2 className="receiving-page__section-title">
          Аналитическая приёмка
          {analyticsCount > 0 ? (
            <span className="receiving-page__section-count">{analyticsCount}</span>
          ) : null}
        </h2>
        <AnalyticsReceivingList documents={stableDocuments} />
      </section>
    </div>
  )
}
