import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import StatusBadge from '../StatusBadge'
import EmployeeAvatar from '../../EmployeeAvatar'
import {
  getEmploymentStatusLabel,
  getEmploymentStatusBadgeType,
  formatEmployeeDateRu,
  isTerminatedEmployeeStatus,
  getWorkModeLabel,
  getSalaryCalculationTypeLabel,
  getEmployeePositionLabel,
  getEmployeePositionGroupLabel,
  isEmployeePositionUnlinked,
} from '../../../utils/employeeData'
import { getRoleLabel } from '../../../data/roles'
import './EmployeeProfileHeader.css'

function displayValue(value) {
  if (value == null || value === '') return '—'
  return value
}

/** Главная карточка сотрудника на странице профиля */
export default function EmployeeProfileHeader({
  employee,
  roleLabel,
  showLogin = false,
  canEdit = false,
  onEdit,
  showDocuments = false,
  onDocuments,
}) {
  if (!employee) return null

  const positionLabel = getEmployeePositionLabel(employee)
  const groupLabel = getEmployeePositionGroupLabel(employee)
  const unlinked = isEmployeePositionUnlinked(employee)
  const headerPosition =
    positionLabel ||
    (unlinked ? 'Должность не привязана к справочнику' : '') ||
    '—'

  const systemRoleLabel =
    roleLabel || getRoleLabel(employee.role) || '—'

  const positionArchived =
    employee.positionId &&
    (employee.positionIsActive === false || employee.positionGroupIsActive === false)

  const hasActions = (canEdit && onEdit) || (showDocuments && onDocuments)

  return (
    <section className="employee-profile-header" aria-label="Карточка сотрудника">
      <div className="employee-profile-header__main">
        <EmployeeAvatar
          name={employee.name}
          avatarUrl={employee.avatarUrl}
          size="lg"
        />
        <div className="employee-profile-header__info">
          <h1 className="employee-profile-header__name">{employee.name}</h1>
          <p className="employee-profile-header__role">{headerPosition}</p>
          {unlinked && employee.position ? (
            <p className="employee-profile-header__legacy-position">{employee.position}</p>
          ) : null}
          <div className="employee-profile-header__status">
            <StatusBadge
              label={getEmploymentStatusLabel(employee.employmentStatus)}
              type={getEmploymentStatusBadgeType(employee.employmentStatus)}
            />
          </div>
          <div className="employee-profile-header__dates">
            <p className="employee-profile-header__date-row">
              <span className="employee-profile-header__meta-label">Должность</span>
              <span>
                {displayValue(positionLabel || (unlinked ? null : headerPosition))}
                {positionArchived ? ' (архивная)' : ''}
                {unlinked ? ' (не привязана к справочнику)' : ''}
              </span>
            </p>
            <p className="employee-profile-header__date-row">
              <span className="employee-profile-header__meta-label">Группа должности</span>
              <span>
                {displayValue(groupLabel)}
                {employee.positionGroupIsActive === false ? ' (архивная)' : ''}
              </span>
            </p>
            <p className="employee-profile-header__date-row">
              <span className="employee-profile-header__meta-label">Роль в системе</span>
              <span>{displayValue(systemRoleLabel)}</span>
            </p>
            {formatEmployeeDateRu(employee.hiredAt) && (
              <p className="employee-profile-header__date-row">
                <span className="employee-profile-header__meta-label">Принят на работу</span>
                <span>{formatEmployeeDateRu(employee.hiredAt)}</span>
              </p>
            )}
            {isTerminatedEmployeeStatus(employee.employmentStatus) &&
              formatEmployeeDateRu(employee.terminatedAt) && (
                <p className="employee-profile-header__date-row">
                  <span className="employee-profile-header__meta-label">Уволен</span>
                  <span>{formatEmployeeDateRu(employee.terminatedAt)}</span>
                </p>
              )}
            <p className="employee-profile-header__date-row">
              <span className="employee-profile-header__meta-label">Режим работы</span>
              <span>{getWorkModeLabel(employee.workMode)}</span>
            </p>
            <p className="employee-profile-header__date-row">
              <span className="employee-profile-header__meta-label">Тип расчёта зарплаты</span>
              <span>{getSalaryCalculationTypeLabel(employee.salaryCalculationType)}</span>
            </p>
          </div>
          {showLogin && (
            <p className="employee-profile-header__login">
              <span className="employee-profile-header__meta-label">Логин</span>
              <code className="admin-code">{displayValue(employee.login)}</code>
            </p>
          )}
        </div>
      </div>

      {hasActions && (
        <div className="employee-profile-header__actions">
          {showDocuments && onDocuments && (
            <button
              type="button"
              className="btn btn--outline employee-profile-header__documents"
              onClick={onDocuments}
            >
              Документы
            </button>
          )}
          {canEdit && onEdit && (
            <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
              <button
                type="button"
                className="btn btn--primary employee-profile-header__edit"
                onClick={() => onEdit(employee)}
              >
                Редактировать
              </button>
            </Can>
          )}
        </div>
      )}
    </section>
  )
}
