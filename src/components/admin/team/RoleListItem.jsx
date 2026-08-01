import { formatRoleDisplayLabel } from '../../../utils/roleDisplay'
import RoleActionsMenu from './RoleActionsMenu'
import { employeesLabel } from './teamManagementUtils'

export default function RoleListItem({
  role,
  roles,
  selected,
  onSelect,
  onEdit,
  onDuplicate,
  onDeactivate,
  onRestore,
}) {
  const label = formatRoleDisplayLabel(role, roles)
  const metaParts = [
    role.isSystem ? 'Системная' : 'Пользовательская',
    employeesLabel(role.employeeCount),
  ]

  return (
    <div
      className={[
        'team-role-item',
        selected ? 'team-role-item--selected' : '',
        !role.isActive ? 'team-role-item--inactive' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="team-role-item__main"
        onClick={() => onSelect(role.id)}
        aria-current={selected ? 'true' : undefined}
      >
        <div className="team-role-item__title">{label}</div>
        <div className="team-role-item__meta">{metaParts.join(' · ')}</div>
        <div className="team-role-item__status-row">
          <span
            className={`team-role-item__status${role.isActive ? ' team-role-item__status--active' : ''}`}
          >
            {role.isActive ? 'Активна' : 'Неактивна'}
          </span>
        </div>
      </button>
      <RoleActionsMenu
        role={role}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onDeactivate={onDeactivate}
        onRestore={onRestore}
      />
    </div>
  )
}
