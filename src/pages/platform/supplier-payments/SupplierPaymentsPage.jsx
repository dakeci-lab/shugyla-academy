import { useSession } from '../../../context/SessionContext'
import { canViewSupplierPayments } from '../../../config/permissions'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import SupplierPaymentsPanel from '../../../components/suppliers/payments/SupplierPaymentsPanel'
import '../../../components/admin/admin-shared.css'
import './SupplierPaymentsPage.css'

/**
 * Оплаты поставщикам — /platform/supplier-payments
 *
 * Контроль сроков оплаты по umag_supplies.debt и условиям отсрочки.
 * Не проводит платежи и не пересчитывает UMAG debt.
 */
export default function SupplierPaymentsPage() {
  const { user } = useSession()

  if (!canViewSupplierPayments(user)) {
    return <PlatformAccessDenied title="Нет доступа к оплатам поставщикам" />
  }

  return (
    <div className="supplier-payments-page">
      <SupplierPaymentsPanel />
    </div>
  )
}
