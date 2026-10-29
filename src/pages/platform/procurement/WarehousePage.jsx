import { useEffect } from 'react'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { canViewPurchases } from '../../../config/permissions'
import { isCloudMode } from '../../../lib/dataMode'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import ProcurementWarehouseView from '../../../components/procurement/ProcurementWarehouseView'
import '../../../components/admin/admin-shared.css'
import './ProcurementPage.css'

/** Склад — /platform/warehouse (раньше вкладка внутри «Закуп»). */
export default function WarehousePage() {
  const { user } = useSession()
  const { ensureModules } = usePlatformData()

  useEffect(() => {
    if (!isCloudMode()) return
    void ensureModules(['suppliers', 'procurement'])
  }, [ensureModules])

  if (!canViewPurchases(user)) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Склад»" />
  }

  return (
    <div className="procurement-page">
      <ProcurementWarehouseView />
    </div>
  )
}
