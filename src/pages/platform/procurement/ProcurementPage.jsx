import { useEffect, useState } from 'react'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { canViewPurchases } from '../../../config/permissions'
import { isCloudMode } from '../../../lib/dataMode'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import ProcurementPlannerView from '../../../components/procurement/ProcurementPlannerView'
import '../../../components/admin/admin-shared.css'
import './ProcurementPage.css'

/**
 * Закуп: планирование — /platform/procurement. Склад — отдельная страница /platform/warehouse.
 * Созданные заказы живут в отдельном разделе «Заказы» (/platform/orders).
 */
export default function ProcurementPage() {
  const { user } = useSession()
  const { ensureModules } = usePlatformData()
  /**
   * Portal target for the planner header strip, kept in state (not a ref) so the
   * planner re-renders once the node exists.
   */
  const [tabsAsideEl, setTabsAsideEl] = useState(null)

  useEffect(() => {
    if (!isCloudMode()) return
    void ensureModules(['suppliers', 'procurement'])
  }, [ensureModules])

  if (!canViewPurchases(user)) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Закуп»" />
  }

  return (
    <div className="procurement-page">
      <div className="procurement-page__tabs-row">
        {/*
          Slot to the right of the tabs. The planner portals its compact UMAG snapshot
          line and its action chips in here, so the top row carries the status instead
          of a separate block above the table.
        */}
        <div className="procurement-page__tabs-aside" ref={setTabsAsideEl} />
      </div>

      <ProcurementPlannerView headerSlot={tabsAsideEl} />
    </div>
  )
}
