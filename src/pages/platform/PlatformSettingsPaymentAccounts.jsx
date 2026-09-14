import PaymentAccountsPanel from '../../components/admin/paymentAccounts/PaymentAccountsPanel'
import '../../components/admin/admin-shared.css'
import './PlatformSettings.css'

/** Настройки — справочник «Счета оплаты» поставщикам */
export default function PlatformSettingsPaymentAccounts() {
  return (
    <div className="platform-settings">
      <PaymentAccountsPanel />
    </div>
  )
}
