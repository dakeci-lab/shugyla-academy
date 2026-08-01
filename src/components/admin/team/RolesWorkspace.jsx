import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ADMIN_PROTECTED_PERMISSIONS,
  groupPermissionsForMatrix,
} from '../../../config/permissionCatalog'
import { canAny, PERMISSION_CODES } from '../../../config/permissions'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import { reloadRbac, upsertRole } from '../../../services/rbacService'
import { useRoleEditor } from '../roles/useRoleEditor'
import ConfirmRoleActionModal from './ConfirmRoleActionModal'
import PermissionModuleCard from './PermissionModuleCard'
import PermissionSearchToolbar from './PermissionSearchToolbar'
import RoleHeader from './RoleHeader'
import RolesSidebar from './RolesSidebar'
import UnsavedChangesBar from './UnsavedChangesBar'
import {
  filterRoles,
  getPermissionIdsForRole,
  idsEqual,
  isProtectedAdminRole,
  resolveInitialRoleId,
} from './teamManagementUtils'

function useIsMobileRolesLayout() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 860px)').matches : false,
  )

  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)')
    const onChange = () => setIsMobile(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return isMobile
}

export default function RolesWorkspace({
  roles,
  permissions,
  rolePermissions,
  loading,
  error,
  isMigrationError,
  onReload,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const isMobile = useIsMobileRolesLayout()
  const { user, refreshSession } = useSession()
  const { success: toastSuccess, error: toastError } = useToast()
  const canManage = canAny(user, [
    PERMISSION_CODES.ROLES_EDIT,
    PERMISSION_CODES.ROLES_ASSIGN_PERMISSIONS,
  ])

  const [roleQuery, setRoleQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [permQuery, setPermQuery] = useState('')
  const [onlyEnabled, setOnlyEnabled] = useState(false)
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [selectedPermissionIds, setSelectedPermissionIds] = useState([])
  const [savedPermissionIds, setSavedPermissionIds] = useState([])
  const [expandedModules, setExpandedModules] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [pendingRoleId, setPendingRoleId] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const mobileShowDetail = searchParams.get('view') === 'detail'

  const editor = useRoleEditor({
    roles,
    permissions,
    onSaved: async (result) => {
      const snapshot = await onReload?.()
      const nextId = result?.roleId
        if (nextId) {
          const params = new URLSearchParams(searchParams)
          params.set('role', nextId)
          if (window.matchMedia('(max-width: 860px)').matches) {
            params.set('view', 'detail')
          }
          setSearchParams(params, { replace: false })
        }
      return snapshot
    },
  })

  const filteredRoles = useMemo(
    () => filterRoles(roles, { query: roleQuery, filter: roleFilter }),
    [roles, roleQuery, roleFilter],
  )

  const urlRoleId = searchParams.get('role') || ''
  const selectedRoleId = useMemo(
    () => resolveInitialRoleId(roles, urlRoleId),
    [roles, urlRoleId],
  )
  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) || null,
    [roles, selectedRoleId],
  )

  const matrixGroups = useMemo(
    () => groupPermissionsForMatrix(permissions),
    [permissions],
  )

  const isDirty = !idsEqual(selectedPermissionIds, savedPermissionIds)

  useEffect(() => {
    if (!roles.length) return
    const resolved = resolveInitialRoleId(roles, urlRoleId)
    if (resolved && resolved !== urlRoleId) {
      const params = new URLSearchParams(searchParams)
      params.set('role', resolved)
      setSearchParams(params, { replace: true })
    }
  }, [roles, urlRoleId, searchParams, setSearchParams])

  useEffect(() => {
    if (!selectedRoleId) {
      setSelectedPermissionIds([])
      setSavedPermissionIds([])
      return
    }
    const ids = getPermissionIdsForRole(selectedRoleId, rolePermissions)
    setSelectedPermissionIds(ids)
    setSavedPermissionIds(ids)
  }, [selectedRoleId, rolePermissions])

  useEffect(() => {
    if (!matrixGroups.length) return
    setExpandedModules((prev) => {
      if (prev.size > 0) return prev
      const next = new Set(matrixGroups.slice(0, 3).map((group) => group.module))
      return next
    })
  }, [matrixGroups])

  useEffect(() => {
    if (!isDirty) return undefined
    function onBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const applyRoleSelection = useCallback(
    (roleId, { replace = false, showDetail = true } = {}) => {
      const params = new URLSearchParams(searchParams)
      if (roleId) params.set('role', roleId)
      else params.delete('role')
      if (showDetail && isMobile) params.set('view', 'detail')
      else if (!isMobile) params.delete('view')
      setSearchParams(params, { replace })
    },
    [searchParams, setSearchParams, isMobile],
  )

  const requestRoleChange = useCallback(
    (nextRoleId) => {
      if (!nextRoleId || nextRoleId === selectedRoleId) {
        if (isMobile) applyRoleSelection(nextRoleId, { showDetail: true })
        return
      }
      if (isDirty) {
        setPendingRoleId(nextRoleId)
        setConfirmState({ type: 'switch-role' })
        return
      }
      applyRoleSelection(nextRoleId)
    },
    [selectedRoleId, isDirty, isMobile, applyRoleSelection],
  )

  const visibleGroups = useMemo(() => {
    const query = permQuery.trim().toLowerCase()
    const savedSet = new Set(savedPermissionIds)
    return matrixGroups
      .map((group) => {
        const items = group.items.filter((permission) => {
          const checked = selectedPermissionIds.includes(permission.id)
          const changed = checked !== savedSet.has(permission.id)
          if (onlyEnabled && !checked) return false
          if (onlyChanged && !changed) return false
          if (!query) return true
          const haystack = [
            permission.name,
            permission.description,
            permission.code,
            group.label,
            group.module,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return haystack.includes(query)
        })
        return { ...group, items }
      })
      .filter((group) => group.items.length > 0)
  }, [
    matrixGroups,
    permQuery,
    onlyEnabled,
    onlyChanged,
    selectedPermissionIds,
    savedPermissionIds,
  ])

  const visiblePermissionCount = useMemo(
    () => visibleGroups.reduce((sum, group) => sum + group.items.length, 0),
    [visibleGroups],
  )

  useEffect(() => {
    if (!permQuery.trim() && !onlyEnabled && !onlyChanged) return
    setExpandedModules((prev) => {
      const next = new Set(prev)
      visibleGroups.forEach((group) => next.add(group.module))
      return next
    })
  }, [permQuery, onlyEnabled, onlyChanged, visibleGroups])

  function togglePermission(permissionId) {
    if (!canManage) return
    setSelectedPermissionIds((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId],
    )
  }

  function toggleModule(moduleIds, checked) {
    if (!canManage) return
    setSelectedPermissionIds((prev) => {
      const without = prev.filter((id) => !moduleIds.includes(id))
      return checked ? [...without, ...moduleIds] : without
    })
  }

  function toggleExpanded(moduleId) {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(moduleId)) next.delete(moduleId)
      else next.add(moduleId)
      return next
    })
  }

  function validateAdmin(nextIds) {
    if (!isProtectedAdminRole(selectedRole)) return true
    const selectedCodes = permissions
      .filter((permission) => nextIds.includes(permission.id))
      .map((permission) => permission.code)
    return ADMIN_PROTECTED_PERMISSIONS.every((code) => selectedCodes.includes(code))
  }

  async function handleSave() {
    if (!selectedRole || !canManage) return false
    if (!validateAdmin(selectedPermissionIds)) {
      toastError('У роли администратора должны остаться права управления ролями и настройками')
      return false
    }
    setSaving(true)
    try {
      await upsertRole(selectedRole.id, {
        name: selectedRole.name,
        description: selectedRole.description || '',
        isActive: selectedRole.isActive,
        permissionIds: selectedPermissionIds,
      })
      await reloadRbac()
      refreshSession()
      setSavedPermissionIds([...selectedPermissionIds])
      await onReload?.()
      toastSuccess('Разрешения сохранены')
      return true
    } catch (err) {
      toastError(err.message || 'Не удалось сохранить разрешения')
      return false
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setSelectedPermissionIds([...savedPermissionIds])
  }

  async function confirmSwitchRole(mode) {
    const nextId = pendingRoleId
    if (mode === 'save') {
      const ok = await handleSave()
      if (!ok) return
    }
    setConfirmState(null)
    setPendingRoleId(null)
    if (nextId) applyRoleSelection(nextId)
  }

  function requestDeactivate(role) {
    if (!role || isProtectedAdminRole(role)) return
    setConfirmState({
      type: 'deactivate',
      role,
      message:
        Number(role.employeeCount) > 0
          ? `Роль «${role.name}» назначена ${role.employeeCount} сотрудникам. Деактивировать роль?`
          : `Деактивировать роль «${role.name}»?`,
    })
  }

  async function confirmDeactivate() {
    const role = confirmState?.role
    if (!role) return
    setSaving(true)
    try {
      await editor.handleDeactivate(role)
      setConfirmState(null)
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <div className="team-mgmt__empty">
        <p className={isMigrationError ? 'team-mgmt__hint' : 'admin-form__error'}>{error}</p>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onReload}>
          Повторить
        </button>
      </div>
    )
  }

  const showSidebar = !isMobile || !mobileShowDetail
  const showDetail = !isMobile || mobileShowDetail

  return (
    <div className={`team-roles-workspace${isDirty ? ' team-roles-workspace--dirty' : ''}`}>
      {showSidebar ? (
        <RolesSidebar
          roles={roles}
          filteredRoles={filteredRoles}
          selectedRoleId={selectedRoleId}
          query={roleQuery}
          filter={roleFilter}
          loading={loading}
          onQueryChange={setRoleQuery}
          onFilterChange={setRoleFilter}
          onSelect={requestRoleChange}
          onCreate={editor.openCreate}
          onEdit={editor.openEdit}
          onDuplicate={editor.openDuplicate}
          onDeactivate={requestDeactivate}
          onRestore={editor.handleActivate}
        />
      ) : null}

      {showDetail ? (
        <section className="team-roles-detail" aria-label="Разрешения выбранной роли">
          {loading && !selectedRole ? (
            <div className="team-mgmt__skeleton-stack" aria-hidden="true">
              <div className="team-mgmt__skeleton team-mgmt__skeleton--header" />
              <div className="team-mgmt__skeleton team-mgmt__skeleton--card" />
              <div className="team-mgmt__skeleton team-mgmt__skeleton--card" />
            </div>
          ) : (
            <>
              <RoleHeader
                role={selectedRole}
                roles={roles}
                enabledCount={selectedPermissionIds.length}
                totalCount={permissions.length}
                onBack={
                  isMobile
                    ? () => {
                        const params = new URLSearchParams(searchParams)
                        params.delete('view')
                        setSearchParams(params, { replace: false })
                      }
                    : null
                }
                onEdit={editor.openEdit}
                onDuplicate={editor.openDuplicate}
                onDeactivate={requestDeactivate}
                onRestore={editor.handleActivate}
              />

              {selectedRole ? (
                <>
                  <PermissionSearchToolbar
                    query={permQuery}
                    onlyEnabled={onlyEnabled}
                    onlyChanged={onlyChanged}
                    onQueryChange={setPermQuery}
                    onOnlyEnabledChange={setOnlyEnabled}
                    onOnlyChangedChange={setOnlyChanged}
                    onSelectAll={() => {
                      if (canManage) setSelectedPermissionIds(permissions.map((item) => item.id))
                    }}
                    onClearAll={() => {
                      if (canManage) setSelectedPermissionIds([])
                    }}
                    resultCount={visiblePermissionCount}
                    canManage={canManage}
                    disabled={!selectedRole}
                  />

                  <div className="team-roles-detail__modules">
                    {visibleGroups.length === 0 ? (
                      <div className="team-mgmt__empty">
                        <p>
                          {permissions.length === 0
                            ? 'Разрешения не загрузились'
                            : 'По запросу ничего не найдено'}
                        </p>
                      </div>
                    ) : (
                      visibleGroups.map((group) => (
                        <PermissionModuleCard
                          key={group.module}
                          group={group}
                          selectedIds={selectedPermissionIds}
                          savedIds={savedPermissionIds}
                          expanded={expandedModules.has(group.module)}
                          onToggleExpanded={toggleExpanded}
                          onTogglePermission={togglePermission}
                          onToggleModule={toggleModule}
                          disabled={!canManage}
                        />
                      ))
                    )}
                  </div>

                  <UnsavedChangesBar
                    visible={isDirty}
                    saving={saving}
                    onCancel={handleCancel}
                    onSave={handleSave}
                  />
                </>
              ) : (
                <div className="team-mgmt__empty">
                  <p>Роль не выбрана</p>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {editor.editorModal}

      <ConfirmRoleActionModal
        open={confirmState?.type === 'switch-role'}
        title="Несохранённые изменения"
        message="У текущей роли есть несохранённые изменения разрешений. Что сделать перед переключением?"
        confirmLabel="Сохранить и продолжить"
        secondaryLabel="Продолжить без сохранения"
        cancelLabel="Отменить"
        busy={saving}
        onConfirm={() => confirmSwitchRole('save')}
        onSecondary={() => confirmSwitchRole('discard')}
        onClose={() => {
          setConfirmState(null)
          setPendingRoleId(null)
        }}
      />

      <ConfirmRoleActionModal
        open={confirmState?.type === 'deactivate'}
        title="Деактивировать роль"
        message={confirmState?.message || ''}
        confirmLabel="Деактивировать"
        danger
        busy={saving}
        onConfirm={confirmDeactivate}
        onClose={() => setConfirmState(null)}
      />
    </div>
  )
}
