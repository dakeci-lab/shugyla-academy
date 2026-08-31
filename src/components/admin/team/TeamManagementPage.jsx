import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useRolesAccessData } from '../roles/useRolesAccessData'
import PositionGroupsWorkspace from './PositionGroupsWorkspace'
import PositionsWorkspace from './PositionsWorkspace'
import RolesWorkspace from './RolesWorkspace'
import StructureConfirmModal from './StructureConfirmModal'
import StructureEmptyState from './StructureEmptyState'
import TeamManagementTabs from './TeamManagementTabs'
import { TEAM_TABS } from './teamManagementUtils'
import { usePositionStructureWorkspace } from './usePositionStructureWorkspace'
import './TeamManagementPage.css'

function resolveTab(rawTab, canViewPositions) {
  const requested = TEAM_TABS.some((tab) => tab.id === rawTab) ? rawTab : null
  const allowed = ['roles']
  if (canViewPositions) {
    allowed.push('groups', 'positions')
  }
  if (requested && allowed.includes(requested)) {
    return { activeTab: requested, allowed }
  }
  return { activeTab: allowed[0], allowed }
}

export default function TeamManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') || searchParams.get('teamTab') || 'roles'
  const rolesData = useRolesAccessData(true)
  const structure = usePositionStructureWorkspace(true)
  const [dirtyReorder, setDirtyReorder] = useState(false)
  const [pendingTab, setPendingTab] = useState(null)

  const resolved = useMemo(
    () => resolveTab(rawTab, structure.canView),
    [rawTab, structure.canView],
  )

  const applyTab = useCallback(
    (nextTab, { replace = true } = {}) => {
      const params = new URLSearchParams(searchParams)
      params.set('tab', nextTab)
      params.delete('teamTab')
      setSearchParams(params, { replace })
    },
    [searchParams, setSearchParams],
  )

  useEffect(() => {
    if (!resolved.activeTab) return
    if (rawTab !== resolved.activeTab || searchParams.get('teamTab')) {
      applyTab(resolved.activeTab, { replace: true })
    }
  }, [rawTab, resolved.activeTab, searchParams, applyTab])

  function handleTabChange(nextTab) {
    if (nextTab === resolved.activeTab) return
    if (!resolved.allowed.includes(nextTab)) return
    if (dirtyReorder) {
      setPendingTab(nextTab)
      return
    }
    applyTab(nextTab, { replace: false })
  }

  const tabs = TEAM_TABS.map((tab) => ({
    ...tab,
    disabled: !resolved.allowed.includes(tab.id),
  }))

  return (
    <div className="team-mgmt">
      <div className="team-mgmt__tabs-row">
        <TeamManagementTabs
          tabs={tabs}
          activeTab={resolved.activeTab}
          onChange={handleTabChange}
        />
      </div>

      <div
        className="team-mgmt__panel"
        role="tabpanel"
        id={`team-panel-${resolved.activeTab}`}
        aria-labelledby={`team-tab-${resolved.activeTab}`}
      >
        {resolved.activeTab === 'roles' ? (
          <RolesWorkspace
            roles={rolesData.roles}
            permissions={rolesData.permissions}
            rolePermissions={rolesData.rolePermissions}
            loading={rolesData.loading}
            error={rolesData.error}
            isMigrationError={rolesData.isMigrationError}
            onReload={rolesData.reload}
          />
        ) : null}

        {resolved.activeTab === 'groups' ? (
          structure.canView ? (
            <PositionGroupsWorkspace
              groups={structure.groups}
              positions={structure.positions}
              loading={structure.loading}
              error={structure.error}
              canManage={structure.canManage}
              onReload={structure.reload}
              onDirtyChange={setDirtyReorder}
            />
          ) : (
            <StructureEmptyState
              title="Недостаточно прав"
              description="Для просмотра групп должностей нужно право просмотра организационной структуры"
            />
          )
        ) : null}

        {resolved.activeTab === 'positions' ? (
          structure.canView ? (
            <PositionsWorkspace
              groups={structure.groups}
              positions={structure.positions}
              loading={structure.loading}
              error={structure.error}
              canManage={structure.canManage}
              onReload={structure.reload}
              onDirtyChange={setDirtyReorder}
              onGoToGroups={() => handleTabChange('groups')}
            />
          ) : (
            <StructureEmptyState
              title="Недостаточно прав"
              description="Для просмотра должностей нужно право просмотра организационной структуры"
            />
          )
        ) : null}
      </div>

      <StructureConfirmModal
        open={Boolean(pendingTab)}
        title="Несохранённый порядок"
        message="Есть несохранённые изменения порядка. Переключить вкладку без сохранения?"
        confirmLabel="Продолжить без сохранения"
        cancelLabel="Остаться"
        onConfirm={() => {
          const next = pendingTab
          setPendingTab(null)
          setDirtyReorder(false)
          if (next) applyTab(next, { replace: false })
        }}
        onClose={() => setPendingTab(null)}
      />
    </div>
  )
}
