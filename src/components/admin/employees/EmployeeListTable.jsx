import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import StatusBadge from '../StatusBadge'
import IconActionButton from '../IconActionButton'
import EmployeeAvatar from '../../EmployeeAvatar'
import { PencilIcon } from '../../icons/PlatformIcons'
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

function handleCardKeyDown(event, onOpen, employee) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpen(employee)
  }
}

/** Таблица (desktop) и карточки (mobile) сотрудников */
export default function EmployeeListTable({
  employees,
  rowOffset = 0,
  getRoleLabelForEmployee,
  canEdit = false,
  onEdit,
  onOpen,
  emptyMessage,
}) {
  function openProfile(employee, event) {
    event?.stopPropagation?.()
    onOpen?.(employee)
  }

  function openEdit(employee, event) {
    event?.stopPropagation?.()
    onEdit?.(employee)
  }

  return (
    <>
      <div className="employee-list-table-desktop">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="employee-list-table__num-col">№</th>
                <th>Сотрудник</th>
                <th>Логин</th>
                <th>Роль</th>
                <th>Статус</th>
                <th className="employee-list-table__actions-col">Действия</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-empty">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                employees.map((employee, index) => (
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
                            <strong>{employee.name}</strong>
                          </span>
                        </button>
                      ) : (
                        <span className="employee-table-cell">
                          <EmployeeAvatar
                            name={employee.name}
                            avatarUrl={employee.avatarUrl}
                            size="sm"
                          />
                          <strong>{employee.name}</strong>
                        </span>
                      )}
                    </td>
                    <td>
                      <code className="admin-code">{displayValue(employee.login)}</code>
                    </td>
                    <td>{displayValue(getRoleLabelForEmployee(employee))}</td>
                    <td>
                      <StatusBadge
                        label={getEmploymentStatusLabel(employee.employmentStatus)}
                        type={getEmploymentStatusBadgeType(employee.employmentStatus)}
                      />
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
                        {canEdit && onEdit && (
                          <div className="admin-table__actions">
                            <IconActionButton
                              label="Редактировать сотрудника"
                              variant="primary"
                              onClick={(event) => openEdit(employee, event)}
                            >
                              <PencilIcon />
                            </IconActionButton>
                          </div>
                        )}
                      </Can>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="employee-cards">
        {employees.length === 0 ? (
          <li className="employee-cards__empty">{emptyMessage}</li>
        ) : (
          employees.map((employee, index) => {
            const isInteractive = Boolean(onOpen)

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
                      {canEdit && onEdit && (
                        <IconActionButton
                          label="Редактировать сотрудника"
                          variant="primary"
                          onClick={(event) => openEdit(employee, event)}
                        >
                          <PencilIcon />
                        </IconActionButton>
                      )}
                    </Can>
                  </div>
                </div>

                <div className="employee-card-item__meta">
                  <p className="employee-card-item__meta-line">
                    <span className="employee-card-item__meta-label">Роль:</span>{' '}
                    <span className="employee-card-item__meta-value">
                      {displayValue(getRoleLabelForEmployee(employee))}
                    </span>
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
          })
        )}
      </ul>
    </>
  )
}
