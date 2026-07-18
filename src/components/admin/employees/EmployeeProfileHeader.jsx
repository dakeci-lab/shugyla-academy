import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import StatusBadge from '../StatusBadge'
import EmployeeAvatar from '../../EmployeeAvatar'
import {
  getEmploymentStatusLabel,
  getEmploymentStatusBadgeType,
  formatEmployeeDateRu,
  isTerminatedEmployeeStatus,
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

  const resolvedRole =
    roleLabel || employee.position || getRoleLabel(employee.role) || '—'

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
          <p className="employee-profile-header__role">{resolvedRole}</p>
          <div className="employee-profile-header__status">
            <StatusBadge
              label={getEmploymentStatusLabel(employee.employmentStatus)}
              type={getEmploymentStatusBadgeType(employee.employmentStatus)}
            />
          </div>
          <div className="employee-profile-header__dates">
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
