import { useEffect, useMemo, useState } from 'react'
import { groupPermissionsByCategory } from '../../config/permissionCatalog'
import { canManageRoles } from '../../config/permissions'
import { useSession } from '../../context/SessionContext'
import {
  ensureRbacLoaded,
  getRolePermissionIds,
  reloadRbac,
  saveRolePermissions,
  updateRole,
} from '../../services/rbacService'
import './RolesManagementPanel.css'
import './admin-shared.css'

/** Управление ролями и правами доступа */
export default function RolesManagementPanel() {
  const { user } = useSession()
  const allowed = canManageRoles(user)
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const [selectedPermissionIds, setSelectedPermissionIds] = useState([])
  const [roleDescription, setRoleDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  )

  const permissionGroups = useMemo(
    () => groupPermissionsByCategory(permissions),
    [permissions]
  )

  useEffect(() => {
    if (!allowed) {
      setLoading(false)
      return undefined
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const snapshot = await ensureRbacLoaded()
        if (cancelled) return
        setRoles(snapshot.roles)
        setPermissions(snapshot.permissions)
        const firstRole = snapshot.roles[0]
        if (firstRole) {
          setSelectedRoleId(firstRole.id)
          const ids = await getRolePermissionIds(firstRole.id)
          if (!cancelled) setSelectedPermissionIds(ids)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Не удалось загрузить роли')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [allowed])

  useEffect(() => {
    if (!selectedRoleId || !allowed) return undefined

    let cancelled = false
    async function loadRolePermissions() {
      try {
        const ids = await getRolePermissionIds(selectedRoleId)
        if (!cancelled) {
          setSelectedPermissionIds(ids)
          const role = roles.find((item) => item.id === selectedRoleId)
          setRoleDescription(role?.description || '')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Не удалось загрузить права роли')
      }
    }

    loadRolePermissions()
    return () => {
      cancelled = true
    }
  }, [selectedRoleId, allowed, roles])

  function togglePermission(permissionId) {
    setSelectedPermissionIds((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    )
  }

  function toggleCategory(permissionIds, checked) {
    setSelectedPermissionIds((prev) => {
      const withoutCategory = prev.filter((id) => !permissionIds.includes(id))
      return checked ? [...withoutCategory, ...permissionIds] : withoutCategory
    })
  }

  async function handleSave() {
    if (!selectedRoleId) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      if (roleDescription !== (selectedRole?.description || '')) {
        await updateRole(selectedRoleId, { description: roleDescription })
      }
      const snapshot = await saveRolePermissions(selectedRoleId, selectedPermissionIds)
      setRoles(snapshot.roles)
      setPermissions(snapshot.permissions)
      await reloadRbac()
      setSuccess('Права роли сохранены')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить права')
    } finally {
      setSaving(false)
    }
  }

  if (!allowed) return null

  return (
    <section className="admin-panel-card roles-management">
      <h2 className="admin-panel-card__title">Роли и права доступа</h2>
      <p className="admin-panel-card__desc">
        Настройка RBAC: права применяются через can(permission). Поле role у сотрудника
        сохраняется для совместимости.
      </p>

      {loading ? (
        <p className="roles-management__hint">Загрузка ролей…</p>
      ) : (
        <div className="roles-management__layout">
          <div className="roles-management__roles">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                className={`roles-management__role${selectedRoleId === role.id ? ' roles-management__role--active' : ''}`}
                onClick={() => setSelectedRoleId(role.id)}
              >
                <span className="roles-management__role-name">{role.name}</span>
                <span className="roles-management__role-slug">{role.slug}</span>
                {role.isSystem && (
                  <span className="roles-management__role-badge">Системная</span>
                )}
              </button>
            ))}
          </div>

          {selectedRole && (
            <div className="roles-management__editor">
              <div className="roles-management__editor-head">
                <div>
                  <h3 className="roles-management__editor-title">{selectedRole.name}</h3>
                  <p className="roles-management__editor-slug">{selectedRole.slug}</p>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>

              <label className="admin-form__field">
                <span className="admin-form__label">Описание роли</span>
                <textarea
                  className="admin-form__textarea"
                  rows={2}
                  value={roleDescription}
                  onChange={(event) => setRoleDescription(event.target.value)}
                />
              </label>

              <div className="roles-management__permissions">
                {permissionGroups.map((group) => {
                  const groupIds = group.items.map((item) => item.id)
                  const checkedCount = groupIds.filter((id) => selectedPermissionIds.includes(id)).length
                  const allChecked = checkedCount === groupIds.length
                  const indeterminate = checkedCount > 0 && !allChecked

                  return (
                    <fieldset key={group.category} className="roles-management__group">
                      <legend className="roles-management__group-title">
                        <label className="roles-management__group-toggle">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={(node) => {
                              if (node) node.indeterminate = indeterminate
                            }}
                            onChange={(event) => toggleCategory(groupIds, event.target.checked)}
                          />
                          <span>{group.label}</span>
                        </label>
                      </legend>
                      <div className="roles-management__group-items">
                        {group.items.map((permission) => (
                          <label key={permission.id} className="roles-management__permission">
                            <input
                              type="checkbox"
                              checked={selectedPermissionIds.includes(permission.id)}
                              onChange={() => togglePermission(permission.id)}
                            />
                            <span className="roles-management__permission-name">{permission.name}</span>
                            <span className="roles-management__permission-slug">{permission.slug}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="admin-form__error">{error}</p>}
      {success && <p className="admin-form__success">{success}</p>}
    </section>
  )
}
