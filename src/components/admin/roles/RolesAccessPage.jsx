import { useState } from 'react'
import RolesListTab from './RolesListTab'
import RoleAccessMatrixTab from './RoleAccessMatrixTab'
import { useRolesAccessData } from './useRolesAccessData'
import './RolesAccessPage.css'

const TABS = [
  { id: 'roles', label: 'Роли' },
  { id: 'access', label: 'Настройка доступа' },
]

export default function RolesAccessPage() {
  const [activeTab, setActiveTab] = useState('roles')
  const { roles, permissions, loading, error, isMigrationError, reload } = useRolesAccessData(true)

  return (
    <div className="roles-page">
      <div className="roles-page__tabs" role="tablist" aria-label="Разделы ролей">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`roles-page__tab${activeTab === tab.id ? ' roles-page__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="roles-page__content" role="tabpanel">
        {activeTab === 'roles' ? (
          <RolesListTab
            roles={roles}
            permissions={permissions}
            loading={loading}
            error={error}
            isMigrationError={isMigrationError}
            onReload={reload}
          />
        ) : (
          <RoleAccessMatrixTab
            roles={roles}
            permissions={permissions}
            loading={loading}
            error={error}
            isMigrationError={isMigrationError}
            onReload={reload}
          />
        )}
      </div>
    </div>
  )
}
