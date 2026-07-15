import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getStaffEmployees,
  EMPTY_EMPLOYEE_FORM,
  employeeToForm,
  validateEmployeeForm,
  EMPLOYMENT_STATUS,
  EMPLOYEE_STATUS_OPTIONS,
  EMPLOYEE_LIST_DEFAULT_STATUS,
  filterEmployees,
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
import useMediaQuery from '../../../hooks/useMediaQuery'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import Can from '../../auth/Can'
import { PERMISSION_CODES, canManageEmployees } from '../../../config/permissions'
import AdminModal from '../AdminModal'
import ConfirmDialog from '../ConfirmDialog'
import EmployeeFilterPopover from '../employees/EmployeeFilterPopover'
import EmployeeListTable from '../employees/EmployeeListTable'
import EmployeeAvatar from '../../EmployeeAvatar'
import ProfileAvatarEditor from '../../ProfileAvatarEditor'
import { FilterIcon, PlusIcon, SearchIcon } from '../../icons/PlatformIcons'
import '../../EmployeeAvatar.css'
import '../admin-shared.css'
import '../RecruitmentSection.css'
import './EmployeesSection.css'

const CLOUD_PAGE_SIZE = 50
const NARROW_SEARCH_QUERY = '(max-width: 480px)'

function mapFilterToListStatus(filter) {
  if (filter === 'all') return 'all'
  if (filter === 'deactivated') return 'deactivated'
  return 'active'
}

/** Раздел «Сотрудники» — учётные записи, роли и статус */
export default function EmployeesSection() {
  const cloudMode = isCloudMode()
  const { user: sessionUser } = useSession()
  const { success: showSuccess, error: showError } = useToast()
  const { version, refresh } = useAdminRefresh()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const filterButtonRef = useRef(null)
  const hasLoadedOnceRef = useRef(false)
  const isNarrowSearch = useMediaQuery(NARROW_SEARCH_QUERY)

  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const [appliedStatus, setAppliedStatus] = useState(EMPLOYEE_LIST_DEFAULT_STATUS)
  const [appliedRoleId, setAppliedRoleId] = useState('')
  const [draftStatus, setDraftStatus] = useState(EMPLOYEE_LIST_DEFAULT_STATUS)
  const [draftRoleId, setDraftRoleId] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterPreviewTotal, setFilterPreviewTotal] = useState(0)

  const [page, setPage] = useState(1)
  const [cloudEmployees, setCloudEmployees] = useState([])
  const [cloudPagination, setCloudPagination] = useState(null)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [sourceCandidateId, setSourceCandidateId] = useState(null)
  const [candidatePhone, setCandidatePhone] = useState('')
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [activateTarget, setActivateTarget] = useState(null)
  const [deactivating, setDeactivating] = useState(false)
  const [activating, setActivating] = useState(false)
  const [workLocations, setWorkLocations] = useState([])
  const [assignableRoles, setAssignableRoles] = useState([])
  const [filterRoles, setFilterRoles] = useState([])
  const [submitting, setSubmitting] = useState(false)

  void version

  const canEdit = canManageEmployees(sessionUser)

  const filtersActive =
    appliedStatus !== EMPLOYEE_LIST_DEFAULT_STATUS || Boolean(appliedRoleId)

  const loadCloudEmployees = useCallback(async () => {
    if (!cloudMode) return
    setListLoading(true)
    setListError('')
    try {
      const result = await listEmployeesForAdmin({
        page,
        pageSize: CLOUD_PAGE_SIZE,
        search: debouncedSearch,
        status: mapFilterToListStatus(appliedStatus),
        roleId: appliedRoleId || undefined,
        sortBy: 'full_name',
        sortDirection: 'asc',
      })
      setCloudEmployees(result.employees)
      setCloudPagination(result.pagination)
      hasLoadedOnceRef.current = true
    } catch (err) {
      setCloudEmployees([])
      setCloudPagination(null)
      setListError(err.message || 'Не удалось загрузить сотрудников')
    } finally {
      setListLoading(false)
    }
  }, [cloudMode, page, debouncedSearch, appliedStatus, appliedRoleId])

  useEffect(() => {
    if (cloudMode) {
      loadCloudEmployees()
    }
  }, [cloudMode, loadCloudEmployees, version])

  useEffect(() => {
    setPage(1)
  }, [appliedStatus, debouncedSearch, appliedRoleId])

  useEffect(() => {
    getRolesForEmployeeForm(form.role, form.roleId)
      .then(setAssignableRoles)
      .catch(() => setAssignableRoles([]))
  }, [version, form.role, form.roleId])

  useEffect(() => {
    getRolesForEmployeeForm('', '')
      .then(setFilterRoles)
      .catch(() => setFilterRoles([]))
  }, [version])

  useEffect(() => {
    getWorkLocations()
      .then(setWorkLocations)
      .catch(() => setWorkLocations([]))
  }, [version])

  useEffect(() => {
    if (!cloudMode || !filterOpen) return undefined

    let cancelled = false
    listEmployeesForAdmin({
      page: 1,
      pageSize: 1,
      search: debouncedSearch,
      status: mapFilterToListStatus(draftStatus),
      roleId: draftRoleId || undefined,
      sortBy: 'full_name',
      sortDirection: 'asc',
    })
      .then((result) => {
        if (!cancelled) setFilterPreviewTotal(result.pagination?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) setFilterPreviewTotal(0)
      })

    return () => {
      cancelled = true
    }
  }, [cloudMode, filterOpen, debouncedSearch, draftStatus, draftRoleId])

  const filteredEmployees = useMemo(() => {
    if (cloudMode) return cloudEmployees
    return filterEmployees(getStaffEmployees('all'), {
      search: debouncedSearch,
      status: appliedStatus,
      roleId: appliedRoleId,
    })
  }, [cloudMode, cloudEmployees, debouncedSearch, appliedStatus, appliedRoleId, version])

  const filterPreviewCount = useMemo(() => {
    if (cloudMode) return filterPreviewTotal
    return filterEmployees(getStaffEmployees('all'), {
      search: debouncedSearch,
      status: draftStatus,
      roleId: draftRoleId,
    }).length
  }, [
    cloudMode,
    filterPreviewTotal,
    debouncedSearch,
    draftStatus,
    draftRoleId,
    version,
  ])

  const editingSelf = Boolean(editId && sessionUser?.id === editId)
  const rowOffset = cloudMode ? (page - 1) * CLOUD_PAGE_SIZE : 0
  const totalPages = cloudPagination?.total_pages ?? 1
  const showInitialLoading =
    cloudMode && listLoading && !hasLoadedOnceRef.current && filteredEmployees.length === 0

  const searchPlaceholder = isNarrowSearch
    ? 'Поиск сотрудника…'
    : 'Имя, логин, должность…'

  function getRoleLabelForEmployee(employee) {
    const role =
      filterRoles.find((item) => item.id === employee.roleId) ||
      assignableRoles.find((item) => item.id === employee.roleId) ||
      getRoleByCode(employee.role)
    if (role) return formatRoleDisplayLabel(role, filterRoles.length ? filterRoles : assignableRoles)
    return getRoleLabel(employee.role)
  }

  function getEmptyMessage() {
    if (listError) return 'Не удалось загрузить список сотрудников.'
    if (filtersActive || debouncedSearch.trim()) {
      return 'По выбранным фильтрам сотрудники не найдены.'
    }
    if (appliedStatus === 'active') return 'Активные сотрудники не найдены.'
    if (appliedStatus === 'deactivated') return 'Деактивированные сотрудники не найдены.'
    return 'Сотрудники не найдены.'
  }

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
    setEditingEmployee(null)
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
    setEditingEmployee(null)
    setForm(EMPTY_EMPLOYEE_FORM)
    setFormError('')
    clearCandidateQuery()
    setShowForm(true)
  }

  function openEdit(emp) {
    setSourceCandidateId(null)
    setCandidatePhone('')
    setEditId(emp.id)
    setEditingEmployee(emp)
    setForm(employeeToForm(emp))
    setFormError('')
    clearCandidateQuery()
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setEditingEmployee(null)
    setFormError('')
    setSourceCandidateId(null)
    setCandidatePhone('')
    setForm((current) => ({ ...current, password: '' }))
    clearCandidateQuery()
  }

  function toggleFilter() {
    if (filterOpen) {
      setFilterOpen(false)
      return
    }
    setDraftStatus(appliedStatus)
    setDraftRoleId(appliedRoleId)
    setFilterOpen(true)
  }

  function closeFilter() {
    setFilterOpen(false)
  }

  function applyFilter() {
    setAppliedStatus(draftStatus)
    setAppliedRoleId(draftRoleId)
    setFilterOpen(false)
  }

  function resetFilter() {
    setDraftStatus(EMPLOYEE_LIST_DEFAULT_STATUS)
    setDraftRoleId('')
    setAppliedStatus(EMPLOYEE_LIST_DEFAULT_STATUS)
    setAppliedRoleId('')
    setFilterOpen(false)
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

  function requestDeactivateFromModal() {
    if (!editingEmployee) return
    setDeactivateTarget(editingEmployee)
  }

  function requestActivateFromModal() {
    if (!editingEmployee) return
    setActivateTarget(editingEmployee)
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setDeactivating(true)
    setActionError('')
    try {
      await deactivateEmployee(deactivateTarget.id)
      setDeactivateTarget(null)
      closeForm()
      showSuccess('Сотрудник деактивирован')
      await afterCloudMutation()
    } catch (err) {
      showError(err.message || 'Не удалось деактивировать сотрудника')
    } finally {
      setDeactivating(false)
    }
  }

  async function confirmActivate() {
    if (!activateTarget) return
    setActivating(true)
    setActionError('')
    try {
      await restoreEmployee(activateTarget.id)
      setActivateTarget(null)
      closeForm()
      setAppliedStatus(EMPLOYEE_LIST_DEFAULT_STATUS)
      showSuccess('Сотрудник активирован')
      await afterCloudMutation()
    } catch (err) {
      showError(err.message || 'Не удалось активировать сотрудника')
    } finally {
      setActivating(false)
    }
  }

  const showDeactivateAction =
    editId &&
    editingEmployee &&
    isActiveStaffEmployee(editingEmployee) &&
    !editingSelf
  const showActivateAction =
    editId &&
    editingEmployee &&
    isDeactivatedStaffEmployee(editingEmployee) &&
    !editingSelf

  return (
    <>
      <div className="employees-section__toolbar">
        <label className="employees-section__search-wrap">
          <span className="employees-section__search-icon" aria-hidden="true">
            <SearchIcon size={18} />
          </span>
          <input
            type="search"
            className="employees-section__search"
            placeholder={searchPlaceholder}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Поиск сотрудников"
          />
        </label>

        <div className="employees-section__filter-wrap">
          <button
            ref={filterButtonRef}
            type="button"
            className={`employees-section__icon-btn${
              filtersActive ? ' employees-section__icon-btn--active' : ''
            }`}
            onClick={toggleFilter}
            aria-expanded={filterOpen}
            aria-label="Фильтр сотрудников"
            title="Фильтр сотрудников"
          >
            <FilterIcon size={20} />
            {filtersActive && (
              <span className="employees-section__filter-indicator" aria-hidden="true" />
            )}
          </button>
          <EmployeeFilterPopover
            open={filterOpen}
            draftStatus={draftStatus}
            draftRoleId={draftRoleId}
            roles={filterRoles}
            onStatusChange={setDraftStatus}
            onRoleChange={setDraftRoleId}
            resultCount={filterPreviewCount}
            onApply={applyFilter}
            onReset={resetFilter}
            onClose={closeFilter}
            anchorRef={filterButtonRef}
          />
        </div>

        <Can permission={PERMISSION_CODES.EMPLOYEES_CREATE}>
          <button
            type="button"
            className="employees-section__icon-btn employees-section__create-btn"
            onClick={openAdd}
            aria-label="Добавить сотрудника"
            title="Добавить сотрудника"
          >
            <PlusIcon size={20} />
          </button>
        </Can>
      </div>

      {successMessage && (
        <p className="admin-success-banner" role="status">
          {successMessage}
        </p>
      )}

      {listError && <p className="admin-form__error">{listError}</p>}
      {actionError && <p className="admin-form__error">{actionError}</p>}

      {showInitialLoading ? (
        <p className="admin-form__hint" role="status">
          Загрузка сотрудников…
        </p>
      ) : (
        <EmployeeListTable
          employees={filteredEmployees}
          rowOffset={rowOffset}
          getRoleLabelForEmployee={getRoleLabelForEmployee}
          canEdit={canEdit}
          onEdit={canEdit ? openEdit : null}
          emptyMessage={getEmptyMessage()}
        />
      )}

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
            Страница {page} из {totalPages} · найдено {cloudPagination?.total ?? filteredEmployees.length}
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
          message={`Сотрудник «${deactivateTarget.name}» потеряет доступ к работе в платформе согласно текущей логике. Исторические данные, график, рейтинг, посещаемость и обучение сохранятся.`}
          confirmLabel="Деактивировать"
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={confirmDeactivate}
          loading={deactivating}
        />
      )}

      {activateTarget && (
        <ConfirmDialog
          title="Активировать сотрудника?"
          message={`Вернуть сотрудника «${activateTarget.name}» в активный статус? Прежние данные сохранятся.`}
          confirmLabel="Активировать"
          confirmVariant="primary"
          onCancel={() => setActivateTarget(null)}
          onConfirm={confirmActivate}
          loading={activating}
        />
      )}

      {showForm && (
        <AdminModal
          title={editId ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
          onClose={closeForm}
          wide
          footer={
            <div className="employees-modal-footer">
              {showDeactivateAction && (
                <Can permission={PERMISSION_CODES.EMPLOYEES_DEACTIVATE}>
                  <button
                    type="button"
                    className="btn employees-modal-footer__status-action employees-modal-footer__status-action--danger"
                    disabled={submitting || deactivating || activating}
                    onClick={requestDeactivateFromModal}
                  >
                    Деактивировать сотрудника
                  </button>
                </Can>
              )}
              {showActivateAction && (
                <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
                  <button
                    type="button"
                    className="btn employees-modal-footer__status-action employees-modal-footer__status-action--success"
                    disabled={submitting || deactivating || activating}
                    onClick={requestActivateFromModal}
                  >
                    Активировать сотрудника
                  </button>
                </Can>
              )}
              <div className="employees-modal-footer__actions">
                <button type="button" className="btn btn--outline" onClick={closeForm}>
                  Отмена
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  form="employee-form"
                  disabled={submitting || deactivating || activating}
                >
                  {sourceCandidateId ? 'Создать сотрудника' : 'Сохранить'}
                </button>
              </div>
            </div>
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
                  avatarUrl:
                    getStaffEmployees('all').find((item) => item.id === editId)?.avatarUrl ||
                    form.avatarUrl,
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
