import { useSession } from '../../../context/SessionContext'
import { canViewSupplierPayments, canViewUmagSettlements } from '../../../config/permissions'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import SupplierFinancePanel from '../../../components/suppliers/finance/SupplierFinancePanel'
import '../../../components/admin/admin-shared.css'
import './SupplierFinancePage.css'

/**
 * Расчёты (UMAG) — /platform/supplier-finance
 *
 * Этап 2.7: hidden unified successor to /platform/settlements and
 * /platform/supplier-payments — not yet linked from platformNav.js.
 * Access is the union of both existing pages' view permissions, never
 * broader than what a user can already reach separately.
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
