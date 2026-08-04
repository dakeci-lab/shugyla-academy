import NotificationSettingsPanel from '../../components/admin/NotificationSettingsPanel'
import NotificationSubscriptionReadinessPanel from '../../components/admin/NotificationSubscriptionReadinessPanel'
import NotificationTestBroadcastSection from '../../components/admin/NotificationTestBroadcastSection'
import '../../components/admin/admin-shared.css'
import './PlatformSettings.css'
import './PlatformSettingsNotifications.css'

/** Настройки автоматических уведомлений платформы */
export default function PlatformSettingsNotifications() {
  return (
    <div className="platform-settings platform-settings--notifications">
      <NotificationSubscriptionReadinessPanel />
      <NotificationSettingsPanel />
      <NotificationTestBroadcastSection />
    </div>
  )
}
