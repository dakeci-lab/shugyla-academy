import { useRoleEditor } from './useRoleEditor'
import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import { formatRoleDisplayLabel } from '../../../utils/roleDisplay'
import '../RolesAccessSection.css'
import '../admin-shared.css'

export default function RolesListTab({
  roles,
  permissions,
  loading,
  error,
  isMigrationError,
  onReload,
  onCreateRole,
}) {
  const editor = useRoleEditor({ roles, permissions, onSaved: onReload })

  return (
    <div className="roles-page__panel">
      <div className="roles-access__head">
        <div>
          <p className="admin-panel-card__desc">
            Список ролей сотрудников. Код роли создаётся автоматически и не отображается здесь.
          </p>
        </div>
        <Can anyOf={[PERMISSION_CODES.ROLES_CREATE, PERMISSION_CODES.ROLES_EDIT]}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onCreateRole || editor.openCreate}
            disabled={isMigrationError}
          >
            Создать роль
          </button>
        </Can>
      </div>

      {loading ? (
        <p className="roles-access__hint">Загрузка ролей…</p>
      ) : error ? (
        <div className="roles-access__empty">
          <p className={isMigrationError ? 'roles-access__hint' : 'admin-form__error'}>{error}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onReload}>
            Повторить загрузку
          </button>
        </div>
      ) : roles.length === 0 ? (
        <div className="roles-access__empty">
          <p className="roles-access__hint">Роли пока не созданы.</p>
          <button type="button" className="btn btn--primary btn--sm" onClick={editor.openCreate}>
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
                    <div className="roles-access__role-name">
                      {formatRoleDisplayLabel(role, roles)}
                    </div>
                    {role.description && (
                      <div className="roles-access__role-desc">{role.description}</div>
                    )}
                    {role.isSystem && <span className="roles-access__badge">Системная</span>}
                  </td>
                  <td>{role.employeeCount ?? 0}</td>
                  <td>
                    <span
                      className={`roles-access__status${role.isActive ? ' roles-access__status--active' : ''}`}
                    >
                      {role.isActive ? 'Активна' : 'Неактивна'}
                    </span>
                  </td>
                  <td>
                    <div className="roles-access__actions">
                      <Can anyOf={[PERMISSION_CODES.ROLES_EDIT, PERMISSION_CODES.ROLES_ASSIGN_PERMISSIONS]}>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => editor.openEdit(role)}
                        >
                          Редактировать
                        </button>
                      </Can>
                      <Can permission={PERMISSION_CODES.ROLES_CREATE}>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => editor.openDuplicate(role)}
                        >
                          Дублировать
                        </button>
                      </Can>
                      {role.isActive && role.code !== 'admin' && role.code !== 'administrator' ? (
                        <Can permission={PERMISSION_CODES.ROLES_EDIT}>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => editor.handleDeactivate(role)}
                          >
                            Деактивировать
                          </button>
                        </Can>
                      ) : null}
                      {!role.isActive ? (
                        <Can permission={PERMISSION_CODES.ROLES_EDIT}>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => editor.handleActivate(role)}
                          >
                            Активировать
                          </button>
                        </Can>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor.editorModal}
    </div>
  )
}
