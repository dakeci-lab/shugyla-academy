import { useCallback, useEffect, useState } from 'react'
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
import { listEmployeesForAdmin } from '../../../services/employeeAdminService'
import {
  getVacancyEmployeeRole,
  canCreateEmployeeForCandidate,
  isCandidateEmployeeCreated,
} from '../../../utils/recruitmentData'
import { getRoleLabel } from '../../../data/roles'
import { getRoleByCode, getRolesForEmployeeForm } from '../../../services/rbacService'
import { formatRoleDisplayLabel } from '../../../utils/roleDisplay'
import { isCloudMode } from '../../../lib/dataMode'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { useSession } from '../../../context/SessionContext'
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

const CLOUD_PAGE_SIZE = 50

function mapFilterToListStatus(filter) {
  if (filter === 'all') return 'all'
  if (filter === 'deactivated') return 'deactivated'
  return 'active'
}

/** Раздел «Сотрудники» — учётные записи, роли и статус */
export default function EmployeesSection() {
  const cloudMode = isCloudMode()
  const { user: sessionUser } = useSession()
  const { version, refresh } = useAdminRefresh()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState('active')
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const [roleFilterId, setRoleFilterId] = useState('')
  const [page, setPage] = useState(1)
  const [cloudEmployees, setCloudEmployees] = useState([])
  const [cloudPagination, setCloudPagination] = useState(null)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')
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
  const [submitting, setSubmitting] = useState(false)

  void version

  const loadCloudEmployees = useCallback(async () => {
    if (!cloudMode) return
    setListLoading(true)
    setListError('')
    try {
      const result = await listEmployeesForAdmin({
        page,
        pageSize: CLOUD_PAGE_SIZE,
        search: debouncedSearch,
        status: mapFilterToListStatus(filter),
        roleId: roleFilterId || undefined,
        sortBy: 'full_name',
        sortDirection: 'asc',
      })
      setCloudEmployees(result.employees)
      setCloudPagination(result.pagination)
    } catch (err) {
      setCloudEmployees([])
      setCloudPagination(null)
      setListError(err.message || 'Не удалось загрузить сотрудников')
    } finally {
      setListLoading(false)
    }
  }, [cloudMode, page, debouncedSearch, filter, roleFilterId])

  useEffect(() => {
    if (cloudMode) {
      loadCloudEmployees()
    }
  }, [cloudMode, loadCloudEmployees, version])

  useEffect(() => {
    setPage(1)
  }, [filter, debouncedSearch, roleFilterId])

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

  const offlineEmployees = getStaffEmployees(filter)
  const employees = cloudMode ? cloudEmployees : offlineEmployees

  const activeCount = cloudMode
    ? filter === 'active'
      ? cloudPagination?.total ?? 0
      : null
    : getStaffEmployees('active').length
  const deactivatedCount = cloudMode
    ? filter === 'deactivated'
      ? cloudPagination?.total ?? 0
      : null
    : getStaffEmployees('deactivated').length

  const editingSelf = Boolean(editId && sessionUser?.id === editId)

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
    setForm((current) => ({ ...current, password: '' }))
    clearCandidateQuery()
  }

  async function afterCloudMutation() {
    if (cloudMode) {
      await loadCloudEmployees()
    } else {
      await refresh()
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (submitting) return

    if (!editId && cloudMode && form.password.trim().length < 12) {
      setFormError('Временный пароль должен содержать не менее 12 символов')
      return
    }

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

    setSubmitting(true)
    try {
      if (editId) {
        if (cloudMode) {
          await updateEmployee(editId, {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            roleId: selectedRole?.id || form.roleId || null,
            position: selectedRole?.name || getRoleLabel(roleCode),
            employmentStatus: form.employmentStatus,
            avatarUrl: form.avatarUrl || null,
          })
        } else {
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
          await updateEmployee(editId, payload)
        }
        closeForm()
      } else {
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
        const newUserId = await createEmployee(payload)
        if (sourceCandidateId) {
          await linkCandidateToEmployee(sourceCandidateId, newUserId)
          setSuccessMessage('Сотрудник успешно создан')
        }
        closeForm()
      }
      await afterCloudMutation()
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить сотрудника')
    } finally {
      setSubmitting(false)
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
      await afterCloudMutation()
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
      await afterCloudMutation()
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

  const totalPages = cloudPagination?.total_pages ?? 1
  const totalFound = cloudPagination?.total ?? employees.length

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
              {tab.id === 'active' && activeCount != null && ` (${activeCount})`}
              {tab.id === 'deactivated' && deactivatedCount != null && ` (${deactivatedCount})`}
            </button>
          ))}
        </div>
        <Can permission={PERMISSION_CODES.EMPLOYEES_CREATE}>
          <button type="button" className="btn btn--primary btn--sm" onClick={openAdd}>
            + Добавить сотрудника
          </button>
        </Can>
      </div>

      {cloudMode && (
        <div className="admin-toolbar admin-toolbar--stack">
          <label className="admin-form__label admin-form__label--inline">
            Поиск
            <input
              className="admin-form__input"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Имя, логин, должность"
            />
          </label>
          <label className="admin-form__label admin-form__label--inline">
            Роль
            <select
              className="admin-form__select"
              value={roleFilterId}
              onChange={(e) => setRoleFilterId(e.target.value)}
            >
              <option value="">Все роли</option>
              {assignableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {formatRoleDisplayLabel(role, assignableRoles)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {successMessage && (
        <p className="admin-success-banner" role="status">
          {successMessage}
        </p>
      )}

      {listError && <p className="admin-form__error">{listError}</p>}
      {actionError && <p className="admin-form__error">{actionError}</p>}

      {cloudMode && listLoading && (
        <p className="admin-form__hint" role="status">
          Загрузка сотрудников…
        </p>
      )}

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
            {!listLoading && employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-empty">
                  {listError
                    ? 'Не удалось загрузить список сотрудников.'
                    : filter === 'active'
                      ? 'Активные сотрудники не найдены.'
                      : filter === 'deactivated'
                        ? 'Деактивированные сотрудники не найдены.'
                        : 'Сотрудники не найдены.'}
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

      {cloudMode && totalPages > 1 && (
        <div className="admin-toolbar">
          <button
            type="button"
            className="btn btn--outline btn--sm"
            disabled={page <= 1 || listLoading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Предыдущая
          </button>
          <span className="admin-form__hint">
            Страница {page} из {totalPages} · найдено {totalFound}
          </span>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            disabled={page >= totalPages || listLoading}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Следующая
          </button>
        </div>
      )}

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
              <button
                type="submit"
                className="btn btn--primary"
                form="employee-form"
                disabled={submitting}
              >
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

            {editId && !cloudMode && (
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
                disabled={editingSelf}
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
              {editingSelf && (
                <span className="admin-form__hint">
                  Нельзя изменить собственную роль.
                </span>
              )}
              {!editingSelf && (
                <span className="admin-form__hint">
                  Роль определяет доступ к разделам платформы через RBAC.
                </span>
              )}
            </label>

            {!cloudMode && workLocations.length > 0 && (
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
                  required={!editId}
                  disabled={Boolean(editId && cloudMode)}
                  readOnly={Boolean(editId && cloudMode)}
                />
                {editId && cloudMode && (
                  <span className="admin-form__hint">
                    Изменение логина и данных входа будет доступно после безопасной синхронизации с Auth.
                  </span>
                )}
              </label>
              {!editId && (
                <label className="admin-form__label">
                  {cloudMode ? 'Временный пароль *' : 'Пароль *'}
                  <input
                    className="admin-form__input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    autoComplete="new-password"
                  />
                  {cloudMode && (
                    <span className="admin-form__hint">
                      Используется для первого входа сотрудника через Supabase Auth.
                    </span>
                  )}
                </label>
              )}
              {editId && !cloudMode && (
                <label className="admin-form__label">
                  Пароль (оставьте пустым, чтобы не менять)
                  <input
                    className="admin-form__input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    autoComplete="new-password"
                  />
                </label>
              )}
            </div>

            <label className="admin-form__label">
              Статус
              <select
                className="admin-form__select"
                value={form.employmentStatus}
                disabled={editingSelf}
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
              {editingSelf && (
                <span className="admin-form__hint">
                  Нельзя изменить собственный статус.
                </span>
              )}
            </label>

            {formError && <p className="admin-form__error">{formError}</p>}
          </form>
        </AdminModal>
      )}
    </>
  )
}
