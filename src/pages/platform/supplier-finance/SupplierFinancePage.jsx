import { useSession } from '../../../context/SessionContext'
import { canViewSupplierPayments, canViewUmagSettlements } from '../../../config/permissions'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import SupplierFinancePanel from '../../../components/suppliers/finance/SupplierFinancePanel'
import '../../../components/admin/admin-shared.css'
import './SupplierFinancePage.css'

/**
 * Расчёты (UMAG) — /platform/supplier-finance
 *
 * Этап 2.7: unified successor to the old /platform/settlements and
 * /platform/supplier-payments pages (the latter now just redirects here).
 * Access is the union of both former pages' view permissions, never
 * broader than what a user could already reach separately.
 */
export default function SupplierFinancePage() {
  const { user } = useSession()

  if (!canViewSupplierPayments(user) && !canViewUmagSettlements(user)) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Расчёты»" />
  }

  return (
    <div className="supplier-finance-page">
      <SupplierFinancePanel />
    </div>
  )
}
