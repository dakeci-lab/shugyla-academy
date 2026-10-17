import { useRolesAccessData } from '../roles/useRolesAccessData'
import RolesWorkspace from './RolesWorkspace'
import './TeamManagementPage.css'

export default function TeamManagementPage() {
  const rolesData = useRolesAccessData(true)

  return (
    <div className="team-mgmt">
      <div className="team-mgmt__panel" role="region" aria-label="Роли и доступы">
        <RolesWorkspace
          roles={rolesData.roles}
          permissions={rolesData.permissions}
          rolePermissions={rolesData.rolePermissions}
          loading={rolesData.loading}
          error={rolesData.error}
          isMigrationError={rolesData.isMigrationError}
          onReload={rolesData.reload}
        />
      </div>
    </div>
  )
}
