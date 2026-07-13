import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getStaffEmployees,
  EMPTY_EMPLOYEE_FORM,
  employeeToForm,
  validateEmployeeForm,
  EMPLOYMENT_STATUS,
  EMPLOYEE_STATUS_OPTIONS,
  getEmploymentStatusLabel,
  getEmploymentStatusBadgeType,
  isDeactivatedStaffEmployee,
  isActiveStaffEmployee,
} from '../../../utils/employeeData'
import {
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  restoreEmployee,
  getCandidateById,
  getVacancyById,
  linkCandidateToEmployee,
  getWorkLocations,
} from '../../../services/academyDataService'
import {
  getVacancyEmployeeRole,
  canCreateEmployeeForCandidate,
  isCandidateEmployeeCreated,
} from '../../../utils/recruitmentData'
import { getRoleLabel } from '../../../data/roles'
import { getRoleByCode, getRolesForEmployeeForm } from '../../../services/rbacService'
import { formatRoleDisplayLabel } from '../../../utils/roleDisplay'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import AdminModal from '../AdminModal'
import StatusBadge from '../StatusBadge'
import EmployeeAvatar from '../../EmployeeAvatar'
import IconActionButton from '../IconActionButton'
import ConfirmDialog from '../ConfirmDialog'
import { PencilIcon, TrashIcon } from '../../icons/PlatformIcons'
import ProfileAvatarEditor from '../../ProfileAvatarEditor'
import '../../EmployeeAvatar.css'
import '../admin-shared.css'
import '../RecruitmentSection.css'
import '../IconActionButton.css'

const FILTER_TABS = [
  { id: 'active', label: 'Активные' },
  { id: 'deactivated', label: 'Деактивированные' },
  { id: 'all', label: 'Все' },
]

/** Раздел «Сотрудники» — учётные записи, роли и статус */
export default function EmployeesSection() {
  const { version, refresh } = useAdminRefresh()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState('active')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [sourceCandidateId, setSourceCandidateId] = useState(null)
  const [candidatePhone, setCandidatePhone] = useState('')
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [deactivating, setDeactivating] = useState(false)
  const [workLocations, setWorkLocations] = useState([])
  const [assignableRoles, setAssignableRoles] = useState([])

  void version

  useEffect(() => {
    getRolesForEmployeeForm(form.role, form.roleId)
      .then(setAssignableRoles)
      .catch(() => setAssignableRoles([]))
  }, [version, form.role, form.roleId])

  useEffect(() => {
    getWorkLocations()
      .then(setWorkLocations)
      .catch(() => setWorkLocations([]))
  }, [version])

  const employees = getStaffEmployees(filter)
  const activeCount = getStaffEmployees('active').length
  const deactivatedCount = getStaffEmployees('deactivated').length

  useEffect(() => {
    const candidateId = searchParams.get('createFromCandidate')
    if (!candidateId) return

    const candidate = getCandidateById(candidateId)
    if (!candidate) {
      setActionError('Кандидат не найден')
      return
    }

    if (isCandidateEmployeeCreated(candidate)) {
      setActionError('Сотрудник уже создан для этого кандидата')
      return
    }

    if (!canCreateEmployeeForCandidate(candidate)) {
      setActionError('Создание сотрудника доступно после собеседования или для стажёра')
      return
    }

    const vacancy = candidate.vacancyId ? getVacancyById(candidate.vacancyId) : null
    const role = getVacancyEmployeeRole(vacancy) || EMPTY_EMPLOYEE_FORM.role

    setSourceCandidateId(candidateId)
    setCandidatePhone(candidate.phone || '')
    setEditId(null)
    setForm({
      ...EMPTY_EMPLOYEE_FORM,
      firstName: candidate.firstName || '',
      lastName: candidate.lastName || '',
      role,
      avatarUrl: candidate.photoUrl || '',
      employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    })
    setFormError('')
    setShowForm(true)
  }, [searchParams, version])

  function clearCandidateQuery() {
    if (searchParams.get('createFromCandidate')) {
      navigate('/platform/employees/list', { replace: true })
    }
  }

  function openAdd() {
    setSuccessMessage('')
    setSourceCandidateId(null)
    setCandidatePhone('')
    setEditId(null)
    setForm(EMPTY_EMPLOYEE_FORM)
    setFormError('')
    clearCandidateQuery()
    setShowForm(true)
  }

  function openEdit(emp) {
    setSourceCandidateId(null)
    setCandidatePhone('')
    setEditId(emp.id)
    setForm(employeeToForm(emp))
    setFormError('')
    clearCandidateQuery()
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setFormError('')
    setSourceCandidateId(null)
    setCandidatePhone('')
    clearCandidateQuery()
  }

  async function handleSave(e) {
    e.preventDefault()
    const error = validateEmployeeForm(form, editId)
    if (error) {
      setFormError(error)
      return
    }

    const selectedRole =
      assignableRoles.find((role) => role.id === form.roleId) ||
      getRoleByCode(form.role) ||
      assignableRoles.find((role) => role.code === form.role)
    const roleCode = selectedRole?.code || form.role

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      role: roleCode,
      roleId: selectedRole?.id || form.roleId || null,
      login: form.login.trim(),
      position: selectedRole?.name || getRoleLabel(roleCode),
      employmentStatus: form.employmentStatus,
      workLocationId: form.workLocationId || null,
      ...(form.avatarUrl ? { avatarUrl: form.avatarUrl } : {}),
      ...(form.password?.trim() ? { password: form.password } : {}),
    }

    try {
      if (editId) {
        await updateEmployee(editId, payload)
        closeForm()
      } else {
        const newUserId = await createEmployee({ ...payload, password: form.password })
        if (sourceCandidateId) {
          await linkCandidateToEmployee(sourceCandidateId, newUserId)
          setSuccessMessage('Сотрудник успешно создан')
        }
        closeForm()
      }
      await refresh()
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить сотрудника')
    }
  }

  async function handleDeactivate(emp) {
    setDeactivateTarget(emp)
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setDeactivating(true)
    setActionError('')
    try {
      await deactivateEmployee(deactivateTarget.id)
      setDeactivateTarget(null)
      await refresh()
    } catch (err) {
      setActionError(err.message || 'Не удалось деактивировать сотрудника')
    } finally {
      setDeactivating(false)
    }
  }

  async function handleActivate(emp) {
    setActionError('')
    try {
      await restoreEmployee(emp.id)
      setFilter('active')
      await refresh()
    } catch (err) {
      setActionError(err.message || 'Не удалось активировать сотрудника')
    }
  }

  function openSchedule(emp) {
    navigate(`/platform/employees/${emp.id}/schedule`)
  }

  function renderActions(emp) {
    if (isActiveStaffEmployee(emp)) {
      return (
        <>
          <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
            <IconActionButton
              label="Редактировать сотрудника"
              variant="primary"
              onClick={(event) => {
                event.stopPropagation()
                openEdit(emp)
              }}
            >
              <PencilIcon />
            </IconActionButton>
          </Can>
          <Can permission={PERMISSION_CODES.EMPLOYEES_DEACTIVATE}>
            <IconActionButton
              label="Деактивировать сотрудника"
              variant="danger"
              onClick={(event) => {
                event.stopPropagation()
                handleDeactivate(emp)
              }}
            >
              <TrashIcon />
            </IconActionButton>
          </Can>
        </>
      )
    }

    if (isDeactivatedStaffEmployee(emp)) {
      return (
        <>
          <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
            <IconActionButton
              label="Редактировать сотрудника"
              variant="primary"
              onClick={(event) => {
                event.stopPropagation()
                openEdit(emp)
              }}
            >
              <PencilIcon />
            </IconActionButton>
          </Can>
          <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={(event) => {
                event.stopPropagation()
                handleActivate(emp)
              }}
            >
              Активировать
            </button>
          </Can>
        </>
      )
    }

    return (
      <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
        <IconActionButton
          label="Редактировать сотрудника"
          variant="primary"
          onClick={(event) => {
            event.stopPropagation()
            openEdit(emp)
          }}
        >
          <PencilIcon />
        </IconActionButton>
      </Can>
    )
  }

  return (
    <>
      <div className="admin-toolbar admin-toolbar--stack">
        <div className="admin-filter-tabs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`admin-filter-tab ${
                filter === tab.id ? 'admin-filter-tab--active' : ''
              }`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
              {tab.id === 'active' && ` (${activeCount})`}
              {tab.id === 'deactivated' && ` (${deactivatedCount})`}
            </button>
          ))}
        </div>
        <Can permission={PERMISSION_CODES.EMPLOYEES_CREATE}>
          <button type="button" className="btn btn--primary btn--sm" onClick={openAdd}>
            + Добавить сотрудника
          </button>
        </Can>
      </div>

      {successMessage && (
        <p className="admin-success-banner" role="status">
          {successMessage}
        </p>
      )}

      {actionError && <p className="admin-form__error">{actionError}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-empty">
                  {filter === 'active' && 'Активные сотрудники не найдены.'}
                  {filter === 'deactivated' && 'Деактивированные сотрудники не найдены.'}
                  {filter === 'all' && 'Сотрудники не найдены.'}
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr
                  key={emp.id}
                  className="employee-row-link"
                  onClick={() => openSchedule(emp)}
                >
                  <td>
                    <span className="employee-table-cell">
                      <EmployeeAvatar
                        name={emp.name}
                        avatarUrl={emp.avatarUrl}
                        size="sm"
                      />
                      <strong>{emp.name}</strong>
                    </span>
                  </td>
                  <td><code className="admin-code">{emp.login}</code></td>
                  <td>{getRoleLabel(emp.role)}</td>
                  <td>
                    <StatusBadge
                      label={getEmploymentStatusLabel(emp.employmentStatus)}
                      type={getEmploymentStatusBadgeType(emp.employmentStatus)}
                    />
                  </td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="admin-table__actions">
                      {renderActions(emp)}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deactivateTarget && (
        <ConfirmDialog
          title="Деактивировать сотрудника?"
          message="Сотрудник больше не будет отображаться среди активных сотрудников, но его данные, история смен и результаты обучения сохранятся."
          confirmLabel="Деактивировать"
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={confirmDeactivate}
          loading={deactivating}
        />
      )}

      {showForm && (
        <AdminModal
          title={editId ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
          onClose={closeForm}
          wide
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={closeForm}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" form="employee-form">
                {sourceCandidateId ? 'Создать сотрудника' : 'Сохранить'}
              </button>
            </>
          }
        >
          <form id="employee-form" className="admin-form" onSubmit={handleSave}>
            {sourceCandidateId && (
              <div className="employee-form-candidate-meta">
                {form.avatarUrl && (
                  <EmployeeAvatar
                    name={`${form.firstName} ${form.lastName}`.trim()}
                    avatarUrl={form.avatarUrl}
                    size="lg"
                  />
                )}
                <div className="employee-form-candidate-meta__info">
                  <p className="admin-form__hint">
                    Данные заполнены из карточки кандидата. Логин и пароль укажите вручную.
                  </p>
                  {candidatePhone && (
                    <p><strong>Телефон:</strong> {candidatePhone}</p>
                  )}
                </div>
              </div>
            )}

            {editId && (
              <ProfileAvatarEditor
                employeeId={editId}
                employee={{
                  ...form,
                  name: `${form.firstName} ${form.lastName}`.trim(),
                  avatarUrl: getStaffEmployees('all').find((item) => item.id === editId)?.avatarUrl || form.avatarUrl,
                }}
                onAvatarChange={async () => {
                  await refresh()
                }}
              />
            )}

            <div className="admin-form__row">
              <label className="admin-form__label">
                Имя *
                <input
                  className="admin-form__input"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  required
                />
              </label>
              <label className="admin-form__label">
                Фамилия
                <input
                  className="admin-form__input"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </label>
            </div>

            <label className="admin-form__label">
              Роль в системе *
              <select
                className="admin-form__select"
                value={form.roleId || form.role}
                onChange={(e) => {
                  const value = e.target.value
                  const role = assignableRoles.find((item) => item.id === value)
                  setForm({
                    ...form,
                    roleId: role?.id || '',
                    role: role?.code || value,
                  })
                }}
              >
                {!form.roleId &&
                  form.role &&
                  !assignableRoles.some((role) => role.code === form.role) && (
                    <option value={form.role}>
                      {getRoleLabel(form.role)} (legacy)
                    </option>
                  )}
                {editId &&
                  form.roleId &&
                  !assignableRoles.some((role) => role.id === form.roleId) && (
                    <option value={form.roleId}>
                      {formatRoleDisplayLabel(
                        getRoleByCode(form.role) || {
                          code: form.role,
                          name: getRoleLabel(form.role),
                          employeeCount: 0,
                        },
                        assignableRoles
                      )}{' '}
                      (неактивна)
                    </option>
                  )}
                {assignableRoles.length === 0 &&
                  [form.role].filter(Boolean).map((roleCode) => (
                    <option key={roleCode} value={roleCode}>
                      {formatRoleDisplayLabel(
                        getRoleByCode(roleCode) || {
                          code: roleCode,
                          name: getRoleLabel(roleCode),
                          employeeCount: 0,
                        },
                        assignableRoles
                      )}
                    </option>
                  ))}
                {assignableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {formatRoleDisplayLabel(role, assignableRoles)}
                    {!role.isActive ? ' (неактивна)' : ''}
                  </option>
                ))}
              </select>
              <span className="admin-form__hint">
                Роль определяет доступ к разделам платформы через RBAC.
              </span>
            </label>

            {workLocations.length > 0 && (
              <label className="admin-form__label">
                Рабочая точка
                <select
                  className="admin-form__select"
                  value={form.workLocationId || ''}
                  onChange={(e) => setForm({ ...form, workLocationId: e.target.value })}
                >
                  <option value="">По умолчанию (активная точка)</option>
                  {workLocations.filter((loc) => loc.isActive).map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="admin-form__row">
              <label className="admin-form__label">
                Логин *
                <input
                  className="admin-form__input"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  required
                />
              </label>
              <label className="admin-form__label">
                Пароль {editId ? '(оставьте пустым, чтобы не менять)' : '*'}
                <input
                  className="admin-form__input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!editId}
                />
              </label>
            </div>

            <label className="admin-form__label">
              Статус
              <select
                className="admin-form__select"
                value={form.employmentStatus}
                onChange={(e) =>
                  setForm({ ...form, employmentStatus: e.target.value })
                }
              >
                {EMPLOYEE_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            {formError && <p className="admin-form__error">{formError}</p>}
          </form>
        </AdminModal>
      )}
    </>
  )
}
