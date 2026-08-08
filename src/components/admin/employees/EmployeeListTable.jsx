import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import StatusBadge from '../StatusBadge'
import IconActionButton from '../IconActionButton'
import EmployeeAvatar from '../../EmployeeAvatar'
import { PencilIcon } from '../../icons/PlatformIcons'
import LoadingSkeleton from '../../loading/LoadingSkeleton'
import useDelayedLoading from '../../loading/useDelayedLoading'
import {
  getEmploymentStatusLabel,
  getEmploymentStatusBadgeType,
} from '../../../utils/employeeData'
import '../IconActionButton.css'
import './EmployeeListTable.css'

function displayValue(value) {
  if (value == null || value === '') return '—'
  return value
}

/** Группа должностей для колонки списка (не название должности). */
function resolvePositionGroupCell(employee) {
  const groupName = String(employee?.positionGroupName || '').trim()
  const archived = employee?.positionGroupIsActive === false
  const positionHint = String(employee?.positionName || employee?.position || '').trim()

  if (groupName) {
    return {
      label: groupName,
      archived,
      missing: false,
      title: positionHint ? `${groupName} · ${positionHint}` : groupName,
    }
  }

  return {
    label: 'Не назначена',
    archived: false,
    missing: true,
    title: positionHint ? `Не назначена · ${positionHint}` : 'Не назначена',
  }
}

function handleCardKeyDown(event, onOpen, employee) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpen(employee)
  }
}

/** Единая таблица (desktop) и карточки (mobile) сотрудников */
export default function EmployeeListTable({
  employees,
  rowOffset = 0,
  getRoleLabelForEmployee,
  canEdit = false,
  onEdit,
  onOpen,
  emptyMessage = '',
  emptyCopy = null,
  onClearSearch,
  loading = false,
}) {
  const showInitialSkeleton = useDelayedLoading(loading && employees.length === 0)

  function openProfile(employee, event) {
    event?.stopPropagation?.()
    onOpen?.(employee)
  }

  function openEdit(employee, event) {
    event?.stopPropagation?.()
    onEdit?.(employee)
  }

  if (loading && employees.length === 0) {
    return (
      <div className="employee-list" aria-busy="true" aria-live="polite">
        {showInitialSkeleton ? <LoadingSkeleton variant="list" count={5} /> : null}
      </div>
    )
  }

  if (!employees.length) {
    const title = emptyCopy?.title || 'Сотрудники не найдены'
    const description =
      emptyCopy?.description || emptyMessage || 'По выбранным условиям сотрудники не найдены.'
    return (
      <div className="employee-list-empty" role="status">
        <div className="employee-list-empty__icon" aria-hidden="true">
          ⌕
        </div>
        <h3 className="employee-list-empty__title">{title}</h3>
        <p className="employee-list-empty__description">{description}</p>
        {emptyCopy?.showClearSearch && typeof onClearSearch === 'function' ? (
          <button type="button" className="btn btn--outline" onClick={onClearSearch}>
            Очистить поиск
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`employee-list${loading ? ' employee-list--loading' : ''}`}>
      {loading ? (
        <p className="employee-list__loading-hint" role="status">
          Обновление списка…
        </p>
      ) : null}

      <div className="employee-list-table-desktop">
        <div className="employee-list-table-wrap">
          <table className="employee-list-table">
            <colgroup>
              <col className="employee-list-table__col-num" />
              <col className="employee-list-table__col-name" />
              <col className="employee-list-table__col-login" />
              <col className="employee-list-table__col-group" />
              <col className="employee-list-table__col-role" />
              <col className="employee-list-table__col-status" />
              <col className="employee-list-table__col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">№</th>
                <th scope="col">Сотрудник</th>
                <th scope="col">Логин</th>
                <th scope="col">Группа должностей</th>
                <th scope="col">Роль</th>
                <th scope="col">Статус</th>
                <th scope="col" className="employee-list-table__actions-head">
                  <span className="visually-hidden">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee, index) => {
                const group = resolvePositionGroupCell(employee)
                const roleLabel = displayValue(getRoleLabelForEmployee(employee))
                return (
                  <tr
                    key={employee.id}
                    className={`employee-list-table__row${
                      onOpen ? ' employee-list-table__row--clickable' : ''
                    }`}
                    onClick={onOpen ? () => onOpen(employee) : undefined}
                  >
                    <td className="employee-list-table__num">{rowOffset + index + 1}</td>
                    <td className="employee-list-table__name">
                      {onOpen ? (
                        <button
                          type="button"
                          className="employee-name-link"
                          onClick={(event) => openProfile(employee, event)}
                        >
                          <span className="employee-table-cell">
                            <EmployeeAvatar
                              name={employee.name}
                              avatarUrl={employee.avatarUrl}
                              size="sm"
                            />
                            <strong title={employee.name}>{employee.name}</strong>
                          </span>
                        </button>
                      ) : (
                        <span className="employee-table-cell">
                          <EmployeeAvatar
                            name={employee.name}
                            avatarUrl={employee.avatarUrl}
                            size="sm"
                          />
                          <strong title={employee.name}>{employee.name}</strong>
                        </span>
                      )}
                    </td>
                    <td>
                      <code
                        className="admin-code employee-list-table__login"
                        title={employee.login || ''}
                      >
                        {displayValue(employee.login)}
                      </code>
                    </td>
                    <td>
                      <span
                        className={`employee-list-table__clamp${
                          group.missing ? ' employee-list-table__clamp--muted' : ''
                        }`}
                        title={group.title}
                      >
                        {group.label}
                      </span>
                      {group.archived ? (
                        <span className="employee-list-table__archive-badge">Архивная</span>
                      ) : null}
                    </td>
                    <td>
                      <span className="employee-list-table__clamp" title={roleLabel}>
                        {roleLabel}
                      </span>
                    </td>
                    <td>
                      <StatusBadge
                        label={getEmploymentStatusLabel(employee.employmentStatus)}
                        type={getEmploymentStatusBadgeType(employee.employmentStatus)}
                      />
                    </td>
                    <td
                      className="employee-list-table__actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
                        {canEdit && onEdit ? (
                          <IconActionButton
                            label="Редактировать сотрудника"
                            variant="primary"
                            onClick={(event) => openEdit(employee, event)}
                          >
                            <PencilIcon />
                          </IconActionButton>
                        ) : null}
                      </Can>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="employee-cards">
        {employees.map((employee, index) => {
          const isInteractive = Boolean(onOpen)
          const group = resolvePositionGroupCell(employee)
          const roleLabel = displayValue(getRoleLabelForEmployee(employee))

          return (
            <li
              key={employee.id}
              className={`employee-card-item${isInteractive ? ' employee-card-item--clickable' : ''}`}
              {...(isInteractive
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `Открыть карточку сотрудника ${employee.name}`,
                    onClick: () => onOpen(employee),
                    onKeyDown: (event) => handleCardKeyDown(event, onOpen, employee),
                  }
                : {})}
            >
              <div className="employee-card-item__head">
                <div className="employee-card-item__identity">
                  <span className="employee-card-item__num">{rowOffset + index + 1}</span>
                  <EmployeeAvatar
                    name={employee.name}
                    avatarUrl={employee.avatarUrl}
                    size="sm"
                  />
                  <h3 className="employee-card-item__title">{employee.name}</h3>
                </div>
                <div className="employee-card-item__head-actions">
                  <StatusBadge
                    label={getEmploymentStatusLabel(employee.employmentStatus)}
                    type={getEmploymentStatusBadgeType(employee.employmentStatus)}
                  />
                  <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
                    {canEdit && onEdit ? (
                      <IconActionButton
                        label="Редактировать сотрудника"
                        variant="primary"
                        onClick={(event) => openEdit(employee, event)}
                      >
                        <PencilIcon />
                      </IconActionButton>
                    ) : null}
                  </Can>
                </div>
              </div>

              <div className="employee-card-item__meta">
                <p className="employee-card-item__meta-line">
                  <span className="employee-card-item__meta-label">Группа должностей:</span>{' '}
                  <span className="employee-card-item__meta-value">
                    {group.label}
                    {group.archived ? ' · Архивная' : ''}
                  </span>
                </p>
                <p className="employee-card-item__meta-line">
                  <span className="employee-card-item__meta-label">Роль:</span>{' '}
                  <span className="employee-card-item__meta-value">{roleLabel}</span>
                </p>
                <p className="employee-card-item__meta-line employee-card-item__meta-line--login">
                  <span className="employee-card-item__meta-label">Логин:</span>{' '}
                  <span className="employee-card-item__meta-value">
                    {displayValue(employee.login)}
                  </span>
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
