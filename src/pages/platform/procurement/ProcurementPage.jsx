import { useEffect, useState } from 'react'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { canViewPurchases } from '../../../config/permissions'
import { isCloudMode } from '../../../lib/dataMode'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import ProcurementPlannerView from '../../../components/procurement/ProcurementPlannerView'
import ProcurementNormsView from '../../../components/procurement/ProcurementNormsView'
import ProcurementAbcAnalysisView from '../../../components/procurement/ProcurementAbcAnalysisView'
import ProcurementWarehouseView from '../../../components/procurement/ProcurementWarehouseView'
import '../../../components/admin/admin-shared.css'
import './ProcurementPage.css'

/**
 * Закуп: планирование (по умолчанию), нормы, ABC, склад — /platform/procurement.
 * Созданные заказы живут в отдельном разделе «Заказы» (/platform/orders).
 */
export default function ProcurementPage() {
  const { user } = useSession()
  const { ensureModules } = usePlatformData()
  const [mainTab, setMainTab] = useState('planning')
  /**
   * Portal target for the planner header strip, kept in state (not a ref) so the
   * planner re-renders once the node exists.
   */
  const [tabsAsideEl, setTabsAsideEl] = useState(null)

  useEffect(() => {
    if (!isCloudMode()) return
    void ensureModules(['suppliers', 'procurement', 'receiving'])
  }, [ensureModules])

  if (!canViewPurchases(user)) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Закуп»" />
  }

  return (
    <div className="procurement-page">
      <div className="procurement-page__tabs-row">
        <div className="procurement-page__tabs" role="tablist" aria-label="Разделы закупа">
          <button
            type="button"
            role="tab"
            className={
              mainTab === 'planning'
                ? 'procurement-page__tab is-active'
                : 'procurement-page__tab'
            }
            aria-selected={mainTab === 'planning'}
            onClick={() => setMainTab('planning')}
          >
            Планирование
          </button>
          <button
            type="button"
            role="tab"
            className={
              mainTab === 'norms' ? 'procurement-page__tab is-active' : 'procurement-page__tab'
            }
            aria-selected={mainTab === 'norms'}
            onClick={() => setMainTab('norms')}
          >
            Нормы
          </button>
          <button
            type="button"
            role="tab"
            className={
              mainTab === 'abc' ? 'procurement-page__tab is-active' : 'procurement-page__tab'
            }
            aria-selected={mainTab === 'abc'}
            onClick={() => setMainTab('abc')}
          >
            ABC
          </button>
          <button
            type="button"
            role="tab"
            className={
              mainTab === 'warehouse' ? 'procurement-page__tab is-active' : 'procurement-page__tab'
            }
            aria-selected={mainTab === 'warehouse'}
            onClick={() => setMainTab('warehouse')}
          >
            Склад
          </button>
        </div>
        {/*
          Slot to the right of the tabs. The planner portals its compact UMAG snapshot
          line and its action chips in here, so the top row carries the status instead
          of a separate block above the table. Stays empty (and hidden) on other tabs.
        */}
        <div className="procurement-page__tabs-aside" ref={setTabsAsideEl} />
      </div>

      {mainTab === 'planning' ? (
        <ProcurementPlannerView headerSlot={tabsAsideEl} />
      ) : mainTab === 'norms' ? (
        <ProcurementNormsView />
      ) : mainTab === 'abc' ? (
        <ProcurementAbcAnalysisView />
      ) : (
        <ProcurementWarehouseView />
      )}
    </div>
  )
}
