import { useEffect, useMemo, useState } from 'react'
import {
  ADMIN_PROTECTED_PERMISSIONS,
  getPermissionActionLabel,
  groupPermissionsForMatrix,
  parsePermissionAction,
  getRbacMatrixModules,
  getPermissionModuleLabel,
} from '../../../config/permissionCatalog'
import { getRolePermissionIds, reloadRbac, upsertRole } from '../../../services/rbacService'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import { formatRoleDisplayLabel } from '../../../utils/roleDisplay'
import { useRoleEditor } from './useRoleEditor'
import '../RolesAccessSection.css'
import '../admin-shared.css'

function idsEqual(a, b) {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((id) => setB.has(id))
}

export default function RoleAccessMatrixTab({
  roles,
  permissions,
  loading,
  error,
  isMigrationError,
  onReload,
}) {
  const { refreshSession } = useSession()
  const { success: toastSuccess, error: toastError } = useToast()
  const editor = useRoleEditor({ roles, permissions, onSaved: onReload })

  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [activeModule, setActiveModule] = useState(() => getRbacMatrixModules()[0])
  const [selectedPermissionIds, setSelectedPermissionIds] = useState([])
  const [savedPermissionIds, setSavedPermissionIds] = useState([])
  const [loadingPermissions, setLoadingPermissions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingRoleId, setPendingRoleId] = useState(null)

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  )

  const matrixGroups = useMemo(
    () => groupPermissionsForMatrix(permissions),
    [permissions]
  )

  const activeGroup = useMemo(
    () => matrixGroups.find((group) => group.module === activeModule) || null,
    [matrixGroups, activeModule]
  )

  const isDirty = !idsEqual(selectedPermissionIds, savedPermissionIds)

  useEffect(() => {
    if (!selectedRoleId && roles.length > 0) {
      setSelectedRoleId(roles[0].id)
    }
  }, [roles, selectedRoleId])

  useEffect(() => {
    if (!selectedRoleId) return
    let cancelled = false
    setLoadingPermissions(true)
    getRolePermissionIds(selectedRoleId)
      .then((ids) => {
        if (cancelled) return
        setSelectedPermissionIds(ids)
        setSavedPermissionIds(ids)
      })
      .finally(() => {
        if (!cancelled) setLoadingPermissions(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRoleId])

  function requestRoleChange(nextRoleId) {
    if (!nextRoleId || nextRoleId === selectedRoleId) return
    if (isDirty) {
      setPendingRoleId(nextRoleId)
      return
    }
    setSelectedRoleId(nextRoleId)
  }

  function confirmRoleChange() {
    if (pendingRoleId) {
      setSelectedRoleId(pendingRoleId)
      setPendingRoleId(null)
    }
  }

  function cancelRoleChange() {
    setPendingRoleId(null)
  }

  function togglePermission(permissionId) {
    setSelectedPermissionIds((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    )
  }

  function toggleModule(moduleIds, checked) {
    setSelectedPermissionIds((prev) => {
      const without = prev.filter((id) => !moduleIds.includes(id))
      return checked ? [...without, ...moduleIds] : without
    })
  }

  function selectAll() {
    setSelectedPermissionIds(permissions.map((p) => p.id))
  }

  function clearAll() {
    setSelectedPermissionIds([])
  }

  function validateAdmin() {
    if (selectedRole?.code !== 'admin' && selectedRole?.code !== 'administrator') return true
    const selectedCodes = permissions
      .filter((p) => selectedPermissionIds.includes(p.id))
      .map((p) => p.code)
    return ADMIN_PROTECTED_PERMISSIONS.every((code) => selectedCodes.includes(code))
  }

  async function handleSave() {
    if (!selectedRole) return
    if (!validateAdmin()) {
      toastError('У роли администратора должны остаться права управления ролями и настройками')
      return
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
    } catch (err) {
      toastError(err.message || 'Не удалось сохранить разрешения')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setSelectedPermissionIds([...savedPermissionIds])
  }

  if (loading) {
    return <p className="roles-access__hint">Загрузка…</p>
  }

  if (error) {
    return (
      <div className="roles-access__empty">
        <p className={isMigrationError ? 'roles-access__hint' : 'admin-form__error'}>{error}</p>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onReload}>
          Повторить загрузку
        </button>
      </div>
    )
  }

  const moduleIds = activeGroup?.items.map((item) => item.id) || []
  const moduleCheckedCount = moduleIds.filter((id) => selectedPermissionIds.includes(id)).length
  const moduleAllChecked = moduleIds.length > 0 && moduleCheckedCount === moduleIds.length
  const moduleIndeterminate = moduleCheckedCount > 0 && !moduleAllChecked

  return (
    <div className="roles-page__panel roles-page__matrix">
      <div className="roles-matrix__toolbar">
        <div className="roles-matrix__role-select">
          <label className="admin-form__label">
            Роль
            <select
              className="admin-form__select"
              value={selectedRoleId}
              onChange={(e) => requestRoleChange(e.target.value)}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {formatRoleDisplayLabel(role, roles)}
                  {!role.isActive ? ' (неактивна)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Can anyOf={[PERMISSION_CODES.ROLES_CREATE, PERMISSION_CODES.ROLES_EDIT]}>
          <button type="button" className="btn btn--primary" onClick={editor.openCreate}>
            Создать роль
          </button>
        </Can>
      </div>

      {selectedRole && (
        <div className="roles-matrix__role-meta">
          <div>
            <h3 className="roles-matrix__role-title">
              {formatRoleDisplayLabel(selectedRole, roles)}
            </h3>
            {selectedRole.description && (
              <p className="roles-matrix__role-desc">{selectedRole.description}</p>
            )}
          </div>
          <span
            className={`roles-access__status${selectedRole.isActive ? ' roles-access__status--active' : ''}`}
          >
            {selectedRole.isActive ? 'Активна' : 'Неактивна'}
          </span>
        </div>
      )}

      {pendingRoleId && (
        <div className="roles-matrix__unsaved-banner" role="status">
          <span>Есть несохранённые изменения.</span>
          <div className="roles-matrix__unsaved-actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={cancelRoleChange}>
              Остаться
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={confirmRoleChange}>
              Переключить без сохранения
            </button>
          </div>
        </div>
      )}

      <div className="roles-matrix__module-tabs" role="tablist">
        {matrixGroups.map((group) => {
          const ids = group.items.map((item) => item.id)
          const count = ids.filter((id) => selectedPermissionIds.includes(id)).length
          return (
            <button
              key={group.module}
              type="button"
              role="tab"
              aria-selected={activeModule === group.module}
              className={`roles-matrix__module-tab${activeModule === group.module ? ' roles-matrix__module-tab--active' : ''}`}
              onClick={() => setActiveModule(group.module)}
            >
              {group.label}
              {count > 0 ? ` (${count})` : ''}
            </button>
          )
        })}
      </div>

      <div className="roles-matrix__actions-row">
        <label className="roles-access__module-toggle">
          <input
            type="checkbox"
            checked={moduleAllChecked}
            ref={(node) => {
              if (node) node.indeterminate = moduleIndeterminate
            }}
            onChange={(e) => toggleModule(moduleIds, e.target.checked)}
            disabled={loadingPermissions || !activeGroup}
          />
          <span>Весь модуль «{getPermissionModuleLabel(activeModule)}»</span>
        </label>
        <div className="roles-matrix__bulk-actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={selectAll}>
            Выбрать все
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={clearAll}>
            Снять все
          </button>
        </div>
      </div>

      <div className="roles-matrix__content">
        {loadingPermissions ? (
          <p className="roles-access__hint">Загрузка разрешений роли…</p>
        ) : !activeGroup ? (
          <p className="roles-access__hint">Нет разрешений для этого модуля.</p>
        ) : (
          <div className="roles-matrix__table-wrap">
            <table className="admin-table roles-matrix__table">
              <thead>
                <tr>
                  <th>Функция</th>
                  <th>Доступ</th>
                </tr>
              </thead>
              <tbody>
                {activeGroup.items.map((permission) => {
                  const action = permission.action || parsePermissionAction(permission.code)
                  return (
                    <tr key={permission.id}>
                      <td>
                        <div className="roles-matrix__perm-name">{permission.name}</div>
                        <div className="roles-matrix__perm-action">
                          {getPermissionActionLabel(action)}
                        </div>
                      </td>
                      <td className="roles-matrix__check-cell">
                        <input
                          type="checkbox"
                          checked={selectedPermissionIds.includes(permission.id)}
                          onChange={() => togglePermission(permission.id)}
                          aria-label={permission.name}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="roles-matrix__footer">
        {isDirty && <span className="roles-matrix__dirty-hint">Есть несохранённые изменения</span>}
        <div className="roles-matrix__footer-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleCancel}
            disabled={!isDirty || saving}
          >
            Отмена
          </button>
          <Can anyOf={[PERMISSION_CODES.ROLES_EDIT, PERMISSION_CODES.ROLES_ASSIGN_PERMISSIONS]}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSave}
              disabled={!isDirty || saving || !selectedRole}
            >
              {saving ? 'Сохранение…' : 'Сохранить изменения'}
            </button>
          </Can>
        </div>
      </div>

      {editor.editorModal}
    </div>
  )
}
