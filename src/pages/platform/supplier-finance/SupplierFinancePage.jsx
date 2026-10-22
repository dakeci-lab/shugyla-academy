import { useSession } from '../../../context/SessionContext'
import { canViewUmagSettlements } from '../../../config/permissions'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import SupplierFinancePanel from '../../../components/suppliers/finance/SupplierFinancePanel'
import '../../../components/admin/admin-shared.css'
import './SupplierFinancePage.css'

/**
 * Расчёты (UMAG) — /platform/supplier-finance
 *
 * Список поставщиков с балансом; в карточке поставщика — история операций, где
 * оплачиваются накладные и отмечаются полученные возвраты. Старые адреса
 * /platform/settlements и /platform/supplier-payments редиректят сюда.
 */
export default function SupplierFinancePage() {
  const { user } = useSession()

  if (!canViewUmagSettlements(user)) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Расчёты»" />
  }

  return (
    <div className="supplier-finance-page">
      <SupplierFinancePanel />
    </div>
  )
}
