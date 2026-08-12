import { useMemo, useState } from 'react'
import {
  ADMIN_PROTECTED_PERMISSIONS,
  generateUniqueRoleCode,
  groupPermissionsByModule,
} from '../../../config/permissionCatalog'
import {
  describeRoleNameConflict,
  findRoleByName,
  isRoleNameUniqueViolation,
} from '../../../utils/roleNameConflict'
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
      name: `Копия — ${role.name}`,
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

    // Раньше при совпадении названия код молча получал суффикс _2, и в списке
    // появлялась вторая роль с тем же именем. Теперь это ошибка с объяснением.
    const nameConflict = findRoleByName(roles, form.name, {
      exceptRoleId: editorMode === 'edit' ? selectedRoleId : null,
    })
    if (nameConflict) {
      setError(describeRoleNameConflict(nameConflict))
      return
    }

    setSaving(true)
    setError('')
    try {
      let savedRoleId = selectedRoleId
      if (editorMode === 'create' || editorMode === 'duplicate') {
        const code = generateUniqueRoleCode(
          form.name.trim(),
          roles.map((role) => role.code)
        )
        if (editorMode === 'duplicate' && selectedRoleId) {
          const created = await duplicateRole(selectedRoleId, { code, name: form.name.trim() })
          savedRoleId = created?.id || null
          if (savedRoleId) {
            // Apply form description + any permission edits made before confirm.
            await upsertRole(savedRoleId, {
              name: form.name.trim(),
              description: form.description.trim(),
              isActive: true,
              permissionIds: selectedPermissionIds,
            })
          }
        } else {
          const created = await createRole({
            code,
            name: form.name.trim(),
            description: form.description.trim(),
            permissionIds: selectedPermissionIds,
          })
          savedRoleId = created?.id || null
        }
      } else if (selectedRoleId) {
        await upsertRole(selectedRoleId, {
          name: form.name.trim(),
          description: form.description.trim(),
          isActive: form.isActive,
          permissionIds: selectedPermissionIds,
        })
        savedRoleId = selectedRoleId
      }
      await reloadRbac()
      refreshSession()
      await onSaved?.({ roleId: savedRoleId, mode: editorMode })
      setEditorOpen(false)
      toastSuccess('Роль сохранена')
    } catch (err) {
      // Уникальность имени защищена ещё и в базе: если два админа создают роль
      // одновременно, ошибка придёт оттуда — показываем тот же понятный текст.
      const message = isRoleNameUniqueViolation(err)
        ? `Роль с названием «${form.name.trim()}» уже существует. Выберите другое название.`
        : err.message || 'Не удалось сохранить роль'
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
      roles={roles}
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
      onCopyFromRole={async (roleId) => {
        const ids = await getRolePermissionIds(roleId)
        setSelectedPermissionIds(ids)
      }}
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
