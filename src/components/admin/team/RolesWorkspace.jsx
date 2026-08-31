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
import PermissionMatrixPanel from './PermissionMatrixPanel'
import RolePickerRow from './RolePickerRow'
import UnsavedChangesBar from './UnsavedChangesBar'
import { DelayedLoadingSkeleton } from '../../loading/LoadingSkeleton'
import {
  getPermissionIdsForRole,
  idsEqual,
  isProtectedAdminRole,
  resolveInitialRoleId,
} from './teamManagementUtils'

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
  const { user, refreshSession } = useSession()
  const { success: toastSuccess, error: toastError } = useToast()
  const canManage = canAny(user, [
    PERMISSION_CODES.ROLES_EDIT,
    PERMISSION_CODES.ROLES_ASSIGN_PERMISSIONS,
  ])

  const [selectedPermissionIds, setSelectedPermissionIds] = useState([])
  const [savedPermissionIds, setSavedPermissionIds] = useState([])
  const [activeModuleId, setActiveModuleId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pendingRoleId, setPendingRoleId] = useState(null)
  const [confirmState, setConfirmState] = useState(null)

  const editor = useRoleEditor({
    roles,
    permissions,
    onSaved: async (result) => {
      const snapshot = await onReload?.()
      const nextId = result?.roleId
      if (nextId) {
        const params = new URLSearchParams(searchParams)
        params.set('role', nextId)
        setSearchParams(params, { replace: false })
      }
      return snapshot
    },
  })

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
    if (activeModuleId || !matrixGroups.length) return
    setActiveModuleId(matrixGroups[0].module)
  }, [matrixGroups, activeModuleId])

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
    (roleId, { replace = false } = {}) => {
      const params = new URLSearchParams(searchParams)
      if (roleId) params.set('role', roleId)
      else params.delete('role')
      setSearchParams(params, { replace })
    },
    [searchParams, setSearchParams],
  )

  const requestRoleChange = useCallback(
    (nextRoleId) => {
      if (!nextRoleId || nextRoleId === selectedRoleId) return
      if (isDirty) {
        setPendingRoleId(nextRoleId)
        setConfirmState({ type: 'switch-role' })
        return
      }
      applyRoleSelection(nextRoleId)
    },
    [selectedRoleId, isDirty, applyRoleSelection],
  )

  function togglePermission(permissionId) {
    if (!canManage) return
    setSelectedPermissionIds((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId],
    )
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

  return (
    <div className="team-roles-workspace">
      {loading && !selectedRole ? (
        <DelayedLoadingSkeleton variant="cards" count={3} />
      ) : (
        <>
          <RolePickerRow
            roles={roles}
            selectedRoleId={selectedRoleId}
            selectedRole={selectedRole}
            onSelect={requestRoleChange}
            onCreate={editor.openCreate}
            onEdit={editor.openEdit}
            onDuplicate={editor.openDuplicate}
            onDeactivate={requestDeactivate}
            onRestore={editor.handleActivate}
          />

          {selectedRole ? (
            <section className="team-roles-detail" aria-label="Разрешения выбранной роли">
              <PermissionMatrixPanel
                groups={matrixGroups}
                activeModuleId={activeModuleId}
                onModuleChange={setActiveModuleId}
                selectedIds={selectedPermissionIds}
                onTogglePermission={togglePermission}
                disabled={!canManage}
              />

              <UnsavedChangesBar
                visible={isDirty}
                saving={saving}
                onCancel={handleCancel}
                onSave={handleSave}
              />
            </section>
          ) : (
            <div className="team-mgmt__empty">
              <p>Роль не выбрана</p>
            </div>
          )}
        </>
      )}

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
