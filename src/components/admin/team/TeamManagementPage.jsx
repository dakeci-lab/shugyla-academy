import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useRolesAccessData } from '../roles/useRolesAccessData'
import RolesWorkspace from './RolesWorkspace'
import TeamComingSoonPanel from './TeamComingSoonPanel'
import TeamManagementTabs from './TeamManagementTabs'
import { TEAM_TABS } from './teamManagementUtils'
import './TeamManagementPage.css'

export default function TeamManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('teamTab') || 'roles'
  const activeTab = TEAM_TABS.some((tab) => tab.id === rawTab) ? rawTab : 'roles'
  const { roles, permissions, rolePermissions, loading, error, isMigrationError, reload } =
    useRolesAccessData(true)

  const panelId = useMemo(() => `team-panel-${activeTab}`, [activeTab])

  function handleTabChange(nextTab) {
    const params = new URLSearchParams(searchParams)
    params.set('teamTab', nextTab)
    if (nextTab !== 'roles') {
      // Keep role id for when user returns to roles tab.
    }
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="team-mgmt">
      <header className="team-mgmt__header">
        <div>
          <h2 className="team-mgmt__title">Управление командой</h2>
          <p className="team-mgmt__subtitle">
            Настройка ролей, доступов и организационной структуры сотрудников
          </p>
        </div>
        <TeamManagementTabs activeTab={activeTab} onChange={handleTabChange} />
      </header>

      <div
        className="team-mgmt__panel"
        role="tabpanel"
        id={panelId}
        aria-labelledby={`team-tab-${activeTab}`}
      >
        {activeTab === 'roles' ? (
          <RolesWorkspace
            roles={roles}
            permissions={permissions}
            rolePermissions={rolePermissions}
            loading={loading}
            error={error}
            isMigrationError={isMigrationError}
            onReload={reload}
          />
        ) : null}
        {activeTab === 'groups' ? (
          <TeamComingSoonPanel title="Группы должностей" />
        ) : null}
        {activeTab === 'positions' ? <TeamComingSoonPanel title="Должности" /> : null}
      </div>
    </div>
  )
}
