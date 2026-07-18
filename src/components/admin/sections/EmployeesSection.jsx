import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getStaffEmployees,
  EMPTY_EMPLOYEE_FORM,
  EMPLOYMENT_STATUS,
  EMPLOYEE_LIST_DEFAULT_STATUS,
  filterEmployees,
  isDeactivatedStaffEmployee,
  isActiveStaffEmployee,
} from '../../../utils/employeeData'
import {
  deactivateEmployee,
  restoreEmployee,
  getCandidateById,
  getVacancyById,
} from '../../../services/academyDataService'
import { listEmployeesForAdmin } from '../../../services/employeeAdminService'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
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
import {
  PERMISSION_CODES,
  canEditEmployees,
  canManageEmployees,
} from '../../../config/permissions'
import ConfirmDialog from '../ConfirmDialog'
import EmployeeFilterPopover from '../employees/EmployeeFilterPopover'
import EmployeeListTable from '../employees/EmployeeListTable'
import EmployeeEditModal from '../employees/EmployeeEditModal'
import { PlusIcon } from '../../icons/PlatformIcons'
import PlatformSearchToolbar, {
  PlatformFilterButton,
  PlatformToolbarActionWrap,
  PlatformToolbarIconButton,
} from '../../platform/PlatformSearchToolbar'
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
  const activeCandidateIdRef = useRef(null)
  const formTouchedRef = useRef(false)
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
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [createInitialForm, setCreateInitialForm] = useState(null)
  const [actionError, setActionError] = useState('')
  const [sourceCandidateId, setSourceCandidateId] = useState(null)
  const [candidatePhone, setCandidatePhone] = useState('')
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [activateTarget, setActivateTarget] = useState(null)
  const [deactivating, setDeactivating] = useState(false)
  const [activating, setActivating] = useState(false)
  const [filterRoles, setFilterRoles] = useState([])

  void version

  const canViewList = canManageEmployees(sessionUser)
  const canEdit = canEditEmployees(sessionUser)

  const filtersActive =
    appliedStatus !== EMPLOYEE_LIST_DEFAULT_STATUS || Boolean(appliedRoleId)

  const loadCloudEmployees = useCallback(async (options = {}) => {
    if (!cloudMode) return
    const quiet = options?.quiet === true
    if (!quiet) setListLoading(true)
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
      if (!quiet) {
        setCloudEmployees([])
        setCloudPagination(null)
      }
      setListError(err.message || 'Не удалось загрузить сотрудников')
    } finally {
      if (!quiet) setListLoading(false)
    }
  }, [cloudMode, page, debouncedSearch, appliedStatus, appliedRoleId])

  usePlatformPageRefresh(loadCloudEmployees)

  useEffect(() => {
    if (cloudMode) {
      loadCloudEmployees()
    }
    // Intentionally omit AcademyData `version`: progressive bootstrap bumps it and
    // was replaying admin-list-employees. Mutations call loadCloudEmployees/refresh.
  }, [cloudMode, loadCloudEmployees])

  useEffect(() => {
    setPage(1)
  }, [appliedStatus, debouncedSearch, appliedRoleId])

  useEffect(() => {
    getRolesForEmployeeForm('', '')
      .then(setFilterRoles)
      .catch(() => setFilterRoles([]))
    // Roles catalog is session-cached via ensureRbacLoaded; do not reload on version.
  }, [])

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

  const rowOffset = cloudMode ? (page - 1) * CLOUD_PAGE_SIZE : 0
  const totalPages = cloudPagination?.total_pages ?? 1
  const showInitialLoading =
    cloudMode && listLoading && !hasLoadedOnceRef.current && filteredEmployees.length === 0

  const searchPlaceholder = isNarrowSearch
    ? 'Поиск по ФИО'
    : 'Поиск по ФИО, логину, должности…'

  function getRoleLabelForEmployee(employee) {
    const role =
      filterRoles.find((item) => item.id === employee.roleId) ||
      getRoleByCode(employee.role)
    if (role) return formatRoleDisplayLabel(role, filterRoles)
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

  function clearCandidateQuery() {
    if (searchParams.get('createFromCandidate')) {
      navigate('/platform/employees/list', { replace: true })
    }
  }

  function closeForm() {
    setShowForm(false)
    setEditingEmployee(null)
    setCreateInitialForm(null)
    setSourceCandidateId(null)
    setCandidatePhone('')
    activeCandidateIdRef.current = null
    formTouchedRef.current = false
    clearCandidateQuery()
  }

  function openAdd() {
    setActionError('')
    setSourceCandidateId(null)
    setCandidatePhone('')
    activeCandidateIdRef.current = null
    formTouchedRef.current = false
    setEditingEmployee(null)
    setCreateInitialForm({ ...EMPTY_EMPLOYEE_FORM })
    clearCandidateQuery()
    setShowForm(true)
  }

  function openEdit(emp) {
    setActionError('')
    setSourceCandidateId(null)
    setCandidatePhone('')
    activeCandidateIdRef.current = null
    formTouchedRef.current = false
    setCreateInitialForm(null)
    setEditingEmployee(emp)
    clearCandidateQuery()
    setShowForm(true)
  }

  useEffect(() => {
    const candidateId = searchParams.get('createFromCandidate')
    if (!candidateId) {
      activeCandidateIdRef.current = null
      return
    }

    const candidate = getCandidateById(candidateId)
    if (!candidate) {
      if (activeCandidateIdRef.current !== candidateId) {
        setActionError('Кандидат не найден')
      }
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

    const candidateChanged = activeCandidateIdRef.current !== candidateId
    if (!candidateChanged && formTouchedRef.current) {
      if (!showForm) setShowForm(true)
      return
    }

    const vacancy = candidate.vacancyId ? getVacancyById(candidate.vacancyId) : null
    const role = getVacancyEmployeeRole(vacancy) || EMPTY_EMPLOYEE_FORM.role

    if (candidateChanged) {
      activeCandidateIdRef.current = candidateId
      formTouchedRef.current = false
      setCreateInitialForm({
        ...EMPTY_EMPLOYEE_FORM,
        firstName: candidate.firstName || '',
        lastName: candidate.lastName || '',
        role,
        avatarUrl: candidate.photoUrl || '',
        employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
      })
    }

    setSourceCandidateId(candidateId)
    setCandidatePhone(candidate.phone || '')
    setEditingEmployee(null)
    setShowForm(true)
  }, [searchParams, version, showForm])

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

  async function handleEmployeeSaved() {
    await afterCloudMutation()
    refresh()
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
      refresh()
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
      refresh()
    } catch (err) {
      showError(err.message || 'Не удалось активировать сотрудника')
    } finally {
      setActivating(false)
    }
  }

  return (
    <>
      <PlatformSearchToolbar
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        placeholder={searchPlaceholder}
        ariaLabel="Поиск по ФИО"
        actions={
          <>
            <PlatformToolbarActionWrap>
              <PlatformFilterButton
                buttonRef={filterButtonRef}
                active={filtersActive}
                onClick={toggleFilter}
                ariaExpanded={filterOpen}
                ariaLabel="Фильтр"
                title="Фильтр"
              />
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
            </PlatformToolbarActionWrap>
            <Can permission={PERMISSION_CODES.EMPLOYEES_CREATE}>
              <PlatformToolbarIconButton
                create
                onClick={openAdd}
                aria-label="Добавить сотрудника"
                title="Добавить сотрудника"
              >
                <PlusIcon size={20} />
              </PlatformToolbarIconButton>
            </Can>
          </>
        }
      />

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
          onOpen={
            canViewList
              ? (employee) => navigate(`/platform/employees/${employee.id}`)
              : null
          }
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
            Страница {page} из {totalPages} · найдено{' '}
            {cloudPagination?.total ?? filteredEmployees.length}
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
        <Can
          permission={
            editingEmployee
              ? PERMISSION_CODES.EMPLOYEES_EDIT
              : PERMISSION_CODES.EMPLOYEES_CREATE
          }
        >
          <EmployeeEditModal
            employee={editingEmployee}
            initialForm={editingEmployee ? null : createInitialForm}
            sourceCandidateId={sourceCandidateId}
            candidatePhone={candidatePhone}
            onClose={closeForm}
            onSaved={handleEmployeeSaved}
            onFormDirty={() => {
              formTouchedRef.current = true
            }}
            onRequestDeactivate={
              editingEmployee && isActiveStaffEmployee(editingEmployee)
                ? setDeactivateTarget
                : undefined
            }
            onRequestActivate={
              editingEmployee && isDeactivatedStaffEmployee(editingEmployee)
                ? setActivateTarget
                : undefined
            }
            deactivating={deactivating}
            activating={activating}
          />
        </Can>
      )}
    </>
  )
}
