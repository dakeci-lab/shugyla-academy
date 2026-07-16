import NotificationSettingsPanel from '../../components/admin/NotificationSettingsPanel'
import '../../components/admin/admin-shared.css'
import './PlatformSettings.css'

/** Настройки автоматических уведомлений платформы */
export default function PlatformSettingsNotifications() {
  return (
    <div className="platform-settings">
      <NotificationSettingsPanel />
    </div>
  )
}
