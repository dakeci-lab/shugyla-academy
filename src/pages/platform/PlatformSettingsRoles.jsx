import TeamManagementPage from '../../components/admin/team/TeamManagementPage'
import '../../components/admin/admin-shared.css'
import './PlatformSettings.css'

/** Страница «Управление командой» / роли и доступы */
export default function PlatformSettingsRoles() {
  return (
    <div className="platform-settings platform-settings--team">
      <TeamManagementPage />
    </div>
  )
}
