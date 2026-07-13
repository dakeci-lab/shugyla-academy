import { useMemo, useState } from 'react'
import {
  ADMIN_PROTECTED_PERMISSIONS,
  generateUniqueRoleCode,
  groupPermissionsByModule,
} from '../../../config/permissionCatalog'
import {
  createRole,
  duplicateRole,
  getRolePermissionIds,
  reloadRbac,
  setRoleActive,
  upsertRole,
} from '../../../services/rbacService'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import RoleEditorModal from './RoleEditorModal'

const EMPTY_FORM = { name: '', description: '', isActive: true }

export function useRoleEditor({ roles, permissions, onSaved }) {
  const { refreshSession } = useSession()
  const { success: toastSuccess, error: toastError } = useToast()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState('edit')
  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedPermissionIds, setSelectedPermissionIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  )

  const permissionGroups = useMemo(
    () => groupPermissionsByModule(permissions),
    [permissions]
  )

  const allPermissionIds = useMemo(() => permissions.map((p) => p.id), [permissions])

  function validateAdminPermissions(nextPermissionIds) {
    const editingAdmin =
      selectedRole?.code === 'admin' || selectedRole?.code === 'administrator'
    if (!editingAdmin) return true
    const selectedCodes = permissions
      .filter((p) => nextPermissionIds.includes(p.id))
      .map((p) => p.code)
    return ADMIN_PROTECTED_PERMISSIONS.every((code) => selectedCodes.includes(code))
  }

  function openCreate() {
    setEditorMode('create')
    setSelectedRoleId(null)
    setForm(EMPTY_FORM)
    setSelectedPermissionIds([])
    setEditorOpen(true)
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
    setError('')
  }

  async function handleSave(e) {
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
    try {
      if (editorMode === 'create' || editorMode === 'duplicate') {
        const code = generateUniqueRoleCode(
          form.name.trim(),
          roles.map((role) => role.code)
        )
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
      await onSaved?.()
      setEditorOpen(false)
      toastSuccess('Роль сохранена')
    } catch (err) {
      const message = err.message || 'Не удалось сохранить роль'
      setError(message)
      toastError(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(role) {
    if (role.code === 'admin' || role.code === 'administrator') return
    try {
      await setRoleActive(role.id, false)
      await reloadRbac()
      refreshSession()
      await onSaved?.()
      toastSuccess(`Роль «${role.name}» деактивирована`)
    } catch (err) {
      toastError(err.message || 'Не удалось деактивировать роль')
    }
  }

  async function handleActivate(role) {
    try {
      await setRoleActive(role.id, true)
      await reloadRbac()
      refreshSession()
      await onSaved?.()
      toastSuccess(`Роль «${role.name}» активирована`)
    } catch (err) {
      toastError(err.message || 'Не удалось активировать роль')
    }
  }

  const editorModal = (
    <RoleEditorModal
      open={editorOpen}
      mode={editorMode}
      form={form}
      setForm={setForm}
      selectedRole={selectedRole}
      permissionGroups={permissionGroups}
      selectedPermissionIds={selectedPermissionIds}
      onTogglePermission={(id) =>
        setSelectedPermissionIds((prev) =>
          prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        )
      }
      onToggleModule={(groupIds, checked) =>
        setSelectedPermissionIds((prev) => {
          const without = prev.filter((id) => !groupIds.includes(id))
          return checked ? [...without, ...groupIds] : without
        })
      }
      onSelectAll={() => setSelectedPermissionIds(allPermissionIds)}
      onClearAll={() => setSelectedPermissionIds([])}
      onSave={handleSave}
      onClose={() => setEditorOpen(false)}
      saving={saving}
      error={error}
      showActiveToggle={editorMode === 'edit'}
    />
  )

  return {
    editorModal,
    openCreate,
    openEdit,
    openDuplicate,
    handleDeactivate,
    handleActivate,
  }
}
