import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import RoleFilters from './RoleFilters'
import RoleListItem from './RoleListItem'

export default function RolesSidebar({
  roles,
  filteredRoles,
  selectedRoleId,
  query,
  filter,
  loading,
  onQueryChange,
  onFilterChange,
  onSelect,
  onCreate,
  onEdit,
  onDuplicate,
  onDeactivate,
  onRestore,
}) {
  return (
    <aside className="team-roles-sidebar" aria-label="Список ролей">
      <div className="team-roles-sidebar__head">
        <div className="team-roles-sidebar__title-row">
          <div>
            <h3 className="team-roles-sidebar__title">Роли</h3>
            <p className="team-roles-sidebar__count">{filteredRoles.length} из {roles.length}</p>
          </div>
          <Can anyOf={[PERMISSION_CODES.ROLES_CREATE, PERMISSION_CODES.ROLES_EDIT]}>
            <button type="button" className="btn btn--primary btn--sm" onClick={onCreate}>
              Создать роль
            </button>
          </Can>
        </div>

        <label className="team-roles-sidebar__search">
          <span className="sr-only">Поиск ролей</span>
          <input
            type="search"
            className="admin-form__input"
            placeholder="Поиск ролей"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>

        <RoleFilters value={filter} onChange={onFilterChange} />
      </div>

      <div className="team-roles-sidebar__list">
        {loading ? (
          <div className="team-mgmt__skeleton-stack" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="team-mgmt__skeleton team-mgmt__skeleton--role" />
            ))}
          </div>
        ) : filteredRoles.length === 0 ? (
          <div className="team-mgmt__empty">
            {roles.length === 0 ? (
              <>
                <p>Создайте первую роль, чтобы настроить доступ сотрудников</p>
                <Can anyOf={[PERMISSION_CODES.ROLES_CREATE, PERMISSION_CODES.ROLES_EDIT]}>
                  <button type="button" className="btn btn--primary btn--sm" onClick={onCreate}>
                    Создать роль
                  </button>
                </Can>
              </>
            ) : (
              <p>По запросу ничего не найдено</p>
            )}
          </div>
        ) : (
          filteredRoles.map((role) => (
            <RoleListItem
              key={role.id}
              role={role}
              roles={roles}
              selected={role.id === selectedRoleId}
              onSelect={onSelect}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDeactivate={onDeactivate}
              onRestore={onRestore}
            />
          ))
        )}
      </div>
    </aside>
  )
}
