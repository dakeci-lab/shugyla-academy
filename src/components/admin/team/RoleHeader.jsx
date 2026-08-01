import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import { formatRoleDisplayLabel } from '../../../utils/roleDisplay'
import RoleActionsMenu from './RoleActionsMenu'
import { employeesLabel } from './teamManagementUtils'

export default function RoleHeader({
  role,
  roles,
  enabledCount,
  totalCount,
  onBack,
  onEdit,
  onDuplicate,
  onDeactivate,
  onRestore,
}) {
  if (!role) {
    return (
      <div className="team-role-header team-role-header--empty">
        <p>Выберите роль, чтобы настроить разрешения</p>
      </div>
    )
  }

  const label = formatRoleDisplayLabel(role, roles)
  const meta = [
    role.isSystem ? 'Системная' : 'Пользовательская',
    role.isActive ? 'Активна' : 'Неактивна',
    employeesLabel(role.employeeCount),
  ].join(' · ')

  return (
    <header className="team-role-header">
      {onBack ? (
        <button type="button" className="team-role-header__back" onClick={onBack} aria-label="Назад к списку ролей">
          ← К списку ролей
        </button>
      ) : null}
      <div className="team-role-header__top">
        <div className="team-role-header__text">
          <h3 className="team-role-header__title">{label}</h3>
          {role.description ? <p className="team-role-header__desc">{role.description}</p> : null}
          <p className="team-role-header__meta">{meta}</p>
          <p className="team-role-header__perms">
            {enabledCount} из {totalCount} разрешений
          </p>
        </div>
        <div className="team-role-header__actions">
          <Can anyOf={[PERMISSION_CODES.ROLES_EDIT, PERMISSION_CODES.ROLES_ASSIGN_PERMISSIONS]}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit?.(role)}>
              Редактировать роль
            </button>
          </Can>
          <Can permission={PERMISSION_CODES.ROLES_CREATE}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDuplicate?.(role)}>
              Дублировать
            </button>
          </Can>
          <RoleActionsMenu
            role={role}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDeactivate={onDeactivate}
            onRestore={onRestore}
          />
        </div>
      </div>
    </header>
  )
}
