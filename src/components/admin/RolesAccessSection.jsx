import { useEffect, useMemo, useState } from 'react'
import AdminModal from './AdminModal'
import {
  ADMIN_PROTECTED_PERMISSIONS,
  generateUniqueRoleCode,
  groupPermissionsByModule,
  PERMISSION_CODES,
} from '../../config/permissionCatalog'
import { canManageRoles } from '../../config/permissions'
import { useSession } from '../../context/SessionContext'
import {
  createRole,
  duplicateRole,
  ensureRbacLoaded,
  getRolePermissionIds,
  RBAC_MIGRATION_MESSAGE,
  reloadRbac,
  setRoleActive,
  upsertRole,
} from '../../services/rbacService'
import './RolesAccessSection.css'
import './admin-shared.css'

const EMPTY_FORM = {
  name: '',
  description: '',
  isActive: true,
}

/** Настройки → Роли и доступы */
export default function RolesAccessSection() {
  const { user, refreshSession } = useSession()
  const allowed = canManageRoles(user)
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState('edit')
  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedPermissionIds, setSelectedPermissionIds] = useState([])
  const [saving, setSaving] = useState(false)

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  )

  const permissionGroups = useMemo(
    () => groupPermissionsByModule(permissions),
    [permissions]
  )

  const allPermissionIds = useMemo(() => permissions.map((item) => item.id), [permissions])

  async function loadRoles() {
    setLoading(true)
    setError('')
    try {
      const snapshot = await ensureRbacLoaded(true)
      setRoles(snapshot.roles)
      setPermissions(snapshot.permissions)
    } catch (err) {
      setRoles([])
      setPermissions([])
      setError(err.message || 'Не удалось загрузить роли')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!allowed) {
      setLoading(false)
      return
    }
    loadRoles()
  }, [allowed])

  function openCreate() {
    setEditorMode('create')
    setSelectedRoleId(null)
    setForm(EMPTY_FORM)
    setSelectedPermissionIds([])
    setEditorOpen(true)
    setSuccess('')
    setError('')
  }

  async function openEdit(role) {
    setEditorMode('edit')
    setSelectedRoleId(role.id)
    setForm({
      name: role.name,
      description: role.description || '',
      isActive: role.isActive,
    })
    const ids = await getRolePermissionIds(role.id)
    setSelectedPermissionIds(ids)
    setEditorOpen(true)
    setSuccess('')
    setError('')
  }

  async function openDuplicate(role) {
    setEditorMode('duplicate')
    setSelectedRoleId(role.id)
    setForm({
      name: `${role.name} (копия)`,
      description: role.description || '',
      isActive: true,
    })
    const ids = await getRolePermissionIds(role.id)
    setSelectedPermissionIds(ids)
    setEditorOpen(true)
  }

  function togglePermission(permissionId) {
    setSelectedPermissionIds((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    )
  }

  function toggleModule(modulePermissionIds, checked) {
    setSelectedPermissionIds((prev) => {
      const without = prev.filter((id) => !modulePermissionIds.includes(id))
      return checked ? [...without, ...modulePermissionIds] : without
    })
  }

  function selectAllPermissions() {
    setSelectedPermissionIds(allPermissionIds)
  }

  function clearAllPermissions() {
    setSelectedPermissionIds([])
  }

  function validateAdminPermissions(nextPermissionIds) {
    const editingAdmin =
      selectedRole?.code === 'admin' || selectedRole?.code === 'administrator'
    if (!editingAdmin) return true
    const selectedCodes = permissions
      .filter((p) => nextPermissionIds.includes(p.id))
      .map((p) => p.code)
    return ADMIN_PROTECTED_PERMISSIONS.every((code) => selectedCodes.includes(code))
  }

  async function handleSaveEditor(e) {
    e?.preventDefault?.()
    if (!form.name.trim()) {
      setError('Укажите название роли')
      return
    }
    if (!validateAdminPermissions(selectedPermissionIds)) {
      setError('У роли администратора должны остаться права управления ролями и настройками')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      if (editorMode === 'create' || editorMode === 'duplicate') {
        const existingCodes = roles.map((role) => role.code)
        const code = generateUniqueRoleCode(form.name.trim(), existingCodes)
        if (editorMode === 'duplicate' && selectedRoleId) {
          await duplicateRole(selectedRoleId, { code, name: form.name.trim() })
        } else {
          await createRole({
            code,
            name: form.name.trim(),
            description: form.description.trim(),
            permissionIds: selectedPermissionIds,
          })
        }
      } else if (selectedRoleId) {
        await upsertRole(selectedRoleId, {
          name: form.name.trim(),
          description: form.description.trim(),
          isActive: form.isActive,
          permissionIds: selectedPermissionIds,
        })
      }
      await reloadRbac()
      refreshSession()
      await loadRoles()
      setEditorOpen(false)
      setSuccess('Роль сохранена')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить роль')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(role) {
    if (role.code === 'admin' || role.code === 'administrator') return
    setError('')
    try {
      await setRoleActive(role.id, false)
      await reloadRbac()
      refreshSession()
      await loadRoles()
      setSuccess(`Роль «${role.name}» деактивирована`)
    } catch (err) {
      setError(err.message || 'Не удалось деактивировать роль')
    }
  }

  async function handleActivate(role) {
    setError('')
    try {
      await setRoleActive(role.id, true)
      await reloadRbac()
      refreshSession()
      await loadRoles()
      setSuccess(`Роль «${role.name}» активирована`)
    } catch (err) {
      setError(err.message || 'Не удалось активировать роль')
    }
  }

  if (!allowed) return null

  const isMigrationError = error === RBAC_MIGRATION_MESSAGE

  return (
    <section className="admin-panel-card roles-access">
      <div className="roles-access__head">
        <div>
          <h2 className="admin-panel-card__title">Роли и доступы</h2>
          <p className="admin-panel-card__desc">
            Гибкая настройка прав доступа. Изменения применяются через can(permission) без правки кода.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openCreate} disabled={isMigrationError}>
          Создать роль
        </button>
      </div>

      {loading ? (
        <p className="roles-access__hint">Загрузка ролей…</p>
      ) : error ? (
        <div className="roles-access__empty">
          <p className={isMigrationError ? 'roles-access__hint' : 'admin-form__error'}>{error}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={loadRoles}>
            Повторить загрузку
          </button>
        </div>
      ) : roles.length === 0 ? (
        <div className="roles-access__empty">
          <p className="roles-access__hint">Роли пока не созданы. Добавьте первую роль или примените миграцию RBAC.</p>
          <button type="button" className="btn btn--primary btn--sm" onClick={openCreate}>
            Создать роль
          </button>
        </div>
      ) : (
        <div className="roles-access__table-wrap">
          <table className="admin-table roles-access__table">
            <thead>
              <tr>
                <th>Роль</th>
                <th>Сотрудников</th>
                <th>Статус</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td>
                    <div className="roles-access__role-name">{role.name}</div>
                    {role.description && (
                      <div className="roles-access__role-desc">{role.description}</div>
                    )}
                    {role.isSystem && <span className="roles-access__badge">Системная</span>}
                  </td>
                  <td>{role.employeeCount ?? 0}</td>
                  <td>
                    <span className={`roles-access__status${role.isActive ? ' roles-access__status--active' : ''}`}>
                      {role.isActive ? 'Активна' : 'Деактивирована'}
                    </span>
                  </td>
                  <td>
                    <div className="roles-access__actions">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(role)}>
                        Редактировать
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openDuplicate(role)}>
                        Дублировать
                      </button>
                      {role.isActive && role.code !== 'admin' && role.code !== 'administrator' ? (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleDeactivate(role)}>
                          Деактивировать
                        </button>
                      ) : null}
                      {!role.isActive ? (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleActivate(role)}>
                          Активировать
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {success && <p className="admin-form__success">{success}</p>}
      {!loading && !isMigrationError && error && roles.length > 0 && (
        <p className="admin-form__error">{error}</p>
      )}

      {editorOpen && (
        <AdminModal
          xwide
          title={
            editorMode === 'create'
              ? 'Создание роли'
              : editorMode === 'duplicate'
                ? 'Дублирование роли'
                : 'Редактирование роли'
          }
          onClose={() => setEditorOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setEditorOpen(false)}>
                Отмена
              </button>
              <button type="button" className="btn btn--primary" onClick={handleSaveEditor} disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </>
          }
        >
          <form className="roles-access__form" onSubmit={handleSaveEditor}>
            <label className="admin-form__label">
              Название роли *
              <input
                className="admin-form__input"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </label>

            <label className="admin-form__label">
              Описание
              <textarea
                className="admin-form__textarea"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </label>

            {editorMode === 'edit' && selectedRole?.code !== 'admin' && selectedRole?.code !== 'administrator' && (
              <label className="admin-form__label roles-access__checkbox-row">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                <span>Роль активна</span>
              </label>
            )}

            <div className="roles-access__permissions">
              <div className="roles-access__permissions-head">
                <h3 className="roles-access__permissions-title">Разрешения</h3>
                <div className="roles-access__permissions-actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={selectAllPermissions}>
                    Выбрать все
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={clearAllPermissions}>
                    Снять все
                  </button>
                </div>
              </div>

              {permissionGroups.length === 0 ? (
                <p className="roles-access__hint">Список разрешений пуст. Примените миграцию RBAC или перезагрузите страницу.</p>
              ) : (
                permissionGroups.map((group) => {
                  const groupIds = group.items.map((item) => item.id)
                  const checkedCount = groupIds.filter((id) => selectedPermissionIds.includes(id)).length
                  const allChecked = checkedCount === groupIds.length && groupIds.length > 0
                  const indeterminate = checkedCount > 0 && !allChecked

                  return (
                    <details key={group.module} className="roles-access__module" open>
                      <summary className="roles-access__module-summary">
                        <label className="roles-access__module-toggle" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={(node) => {
                              if (node) node.indeterminate = indeterminate
                            }}
                            onChange={(e) => toggleModule(groupIds, e.target.checked)}
                          />
                          <span>{group.label}</span>
                          <span className="roles-access__module-count">
                            {checkedCount}/{groupIds.length}
                          </span>
                        </label>
                      </summary>
                      <div className="roles-access__module-items">
                        {group.items.map((permission) => (
                          <label key={permission.id} className="roles-access__permission">
                            <input
                              type="checkbox"
                              checked={selectedPermissionIds.includes(permission.id)}
                              onChange={() => togglePermission(permission.id)}
                            />
                            <span className="roles-access__permission-name">{permission.name}</span>
                            {permission.description ? (
                              <span className="roles-access__permission-desc">{permission.description}</span>
                            ) : null}
                          </label>
                        ))}
                      </div>
                    </details>
                  )
                })
              )}
            </div>

            {error && <p className="admin-form__error">{error}</p>}
          </form>
        </AdminModal>
      )}
    </section>
  )
}

export { PERMISSION_CODES }
