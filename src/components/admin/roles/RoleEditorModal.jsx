import AdminModal from '../AdminModal'
import { groupPermissionsByModule } from '../../../config/permissionCatalog'
import '../RolesAccessSection.css'
import '../admin-shared.css'

export default function RoleEditorModal({
  open,
  mode,
  form,
  setForm,
  selectedRole,
  permissionGroups,
  selectedPermissionIds,
  onTogglePermission,
  onToggleModule,
  onSelectAll,
  onClearAll,
  onSave,
  onClose,
  saving,
  error,
  showActiveToggle = true,
}) {
  if (!open) return null

  const groups = permissionGroups?.length
    ? permissionGroups
    : groupPermissionsByModule([])

  const title =
    mode === 'create'
      ? 'Создание роли'
      : mode === 'duplicate'
        ? 'Дублирование роли'
        : 'Редактирование роли'

  return (
    <AdminModal
      xwide
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn btn--primary" onClick={onSave} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form className="roles-access__form" onSubmit={onSave}>
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

        {(mode === 'create' || showActiveToggle) &&
          selectedRole?.code !== 'admin' &&
          selectedRole?.code !== 'administrator' && (
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
              <button type="button" className="btn btn--ghost btn--sm" onClick={onSelectAll}>
                Выбрать все
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onClearAll}>
                Снять все
              </button>
            </div>
          </div>

          {groups.length === 0 ? (
            <p className="roles-access__hint">Список разрешений пуст.</p>
          ) : (
            groups.map((group) => {
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
                        onChange={(e) => onToggleModule(groupIds, e.target.checked)}
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
                          onChange={() => onTogglePermission(permission.id)}
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
  )
}
