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
import { groupEmployeesByPositionStructure } from '../../../utils/employeeOrganizationStructure'
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
import EmployeeOrganizationList from '../employees/EmployeeOrganizationList'
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
/** Larger page when client-side search needs group/position/role fields. */
const CLOUD_SEARCH_PAGE_SIZE = 200
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
    const hasSearch = Boolean(debouncedSearch.trim())
    if (!quiet) setListLoading(true)
    setListError('')
    try {
      // Search (incl. group/position/role) is applied client-side after batch load
      // so organizational fields participate without N+1 or Edge changes.
      const result = await listEmployeesForAdmin({
        page: hasSearch ? 1 : page,
        pageSize: hasSearch ? CLOUD_SEARCH_PAGE_SIZE : CLOUD_PAGE_SIZE,
        search: '',
        status: mapFilterToListStatus(appliedStatus),
        roleId: appliedRoleId || undefined,
        sortBy: 'full_name',
        sortDirection: 'asc',
      })
      setCloudEmployees(result.employees)
      setCloudPagination(result.pagination)
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
      pageSize: debouncedSearch.trim() ? CLOUD_SEARCH_PAGE_SIZE : 1,
      search: '',
      status: mapFilterToListStatus(draftStatus),
      roleId: draftRoleId || undefined,
      sortBy: 'full_name',
      sortDirection: 'asc',
    })
      .then((result) => {
        if (cancelled) return
        if (debouncedSearch.trim()) {
          setFilterPreviewTotal(
            filterEmployees(result.employees, {
              search: debouncedSearch,
              status: 'all',
              roleId: '',
            }).length
          )
        } else {
          setFilterPreviewTotal(result.pagination?.total ?? 0)
        }
      })
      .catch(() => {
        if (!cancelled) setFilterPreviewTotal(0)
      })

    return () => {
      cancelled = true
    }
  }, [cloudMode, filterOpen, debouncedSearch, draftStatus, draftRoleId])

  const filteredEmployees = useMemo(() => {
    if (cloudMode) {
      // Status/role already applied by admin-list-employees; search is client-side.
      return filterEmployees(cloudEmployees, {
        search: debouncedSearch,
        status: 'all',
        roleId: '',
      })
    }
    return filterEmployees(getStaffEmployees('all'), {
      search: debouncedSearch,
      status: appliedStatus,
      roleId: appliedRoleId,
    })
  }, [cloudMode, cloudEmployees, debouncedSearch, appliedStatus, appliedRoleId, version])

  const organizationGroups = useMemo(
    () => groupEmployeesByPositionStructure(filteredEmployees),
    [filteredEmployees]
  )

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

  const hasSearch = Boolean(debouncedSearch.trim())
  const rowOffset = cloudMode && !hasSearch ? (page - 1) * CLOUD_PAGE_SIZE : 0
  const totalPages = hasSearch ? 1 : cloudPagination?.total_pages ?? 1
  const searchActive = hasSearch

  const searchPlaceholder = isNarrowSearch
    ? 'Поиск по ФИО'
    : 'Поиск по ФИО, логину, должности, группе…'

  function getRoleLabelForEmployee(employee) {
    const role =
      filterRoles.find((item) => item.id === employee.roleId) ||
      getRoleByCode(employee.role)
    if (role) return formatRoleDisplayLabel(role, filterRoles)
    return getRoleLabel(employee.role)
  }

  function getEmptyMessage() {
    if (listError) return 'Не удалось загрузить список сотрудников.'
    if (debouncedSearch.trim() && !filtersActive) {
      return 'По запросу сотрудники не найдены.'
    }
    if (filtersActive || debouncedSearch.trim()) {
      return 'Нет сотрудников, соответствующих выбранным фильтрам.'
    }
    if (appliedStatus === 'active') return 'Работающие сотрудники не найдены.'
    if (appliedStatus === 'deactivated') return 'Уволенные сотрудники не найдены.'
    return 'Сотрудники не созданы.'
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
    // Prefill RBAC role from vacancy.employeeRole only when explicitly set.
    // Never invent positionId from vacancy title / role label.
    const role = getVacancyEmployeeRole(vacancy) || EMPTY_EMPLOYEE_FORM.role

    if (candidateChanged) {
      activeCandidateIdRef.current = candidateId
      formTouchedRef.current = false
      setCreateInitialForm({
        ...EMPTY_EMPLOYEE_FORM,
        firstName: candidate.firstName || '',
        lastName: candidate.lastName || '',
        role,
        roleId: '',
        positionId: '',
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
      showSuccess('Сотрудник уволен')
      await afterCloudMutation()
      refresh()
    } catch (err) {
      showError(err.message || 'Не удалось уволить сотрудника')
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
      showSuccess('Сотрудник восстановлен')
      await afterCloudMutation()
      refresh()
    } catch (err) {
      showError(err.message || 'Не удалось восстановить сотрудника')
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

      {listError && (
        <div className="employees-section__error" role="alert">
          <p className="admin-form__error">{listError}</p>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => loadCloudEmployees()}
          >
            Повторить
          </button>
        </div>
      )}
      {actionError && <p className="admin-form__error">{actionError}</p>}

      {!listError && (
        <EmployeeOrganizationList
          groups={organizationGroups}
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
          searchActive={searchActive}
          loading={Boolean(cloudMode && listLoading)}
        />
      )}

      {cloudMode && !hasSearch && totalPages > 1 && (
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
          title="Уволить сотрудника?"
          message={`Сотрудник «${deactivateTarget.name}» получит статус «Уволен» и потеряет доступ к платформе. Исторические данные, график, рейтинг, посещаемость и обучение сохранятся.`}
          confirmLabel="Уволить"
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={confirmDeactivate}
          loading={deactivating}
        />
      )}

      {activateTarget && (
        <ConfirmDialog
          title="Восстановить сотрудника?"
          message={`Вернуть сотрудника «${activateTarget.name}» в статус «Работает»? Прежние данные сохранятся.`}
          confirmLabel="Восстановить сотрудника"
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
