import { USERS } from '../data/users'
import { getRole, normalizeRoleId, ROLE_IDS } from '../data/roles'
import { isCloudMode } from '../lib/dataMode'
import { getCloudEmployees } from '../lib/cloudStore'
import { toDateKeyInAppTimezone } from './timezone'

/** YYYY-MM-DD from date / ISO / date-only string */
export function toEmployeeDateKey(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : null
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateKeyInAppTimezone(value)
  }
  return null
}

/** Display: 15.03.2026 */
export function formatEmployeeDateRu(value) {
  const key = toEmployeeDateKey(value)
  if (!key) return null
  const [year, month, day] = key.split('-')
  return `${day}.${month}.${year}`
}

export function todayEmployeeDateKey() {
  return toDateKeyInAppTimezone()
}

export const STORAGE_KEYS = {
  EXTRA_USERS: 'shugyla_extra_users',
  USER_EDITS: 'shugyla_user_edits',
  DELETED_USER_IDS: 'shugyla_deleted_user_ids',
}

export const EMPLOYMENT_STATUS = {
  ACTIVE: 'active',
  /** @deprecated legacy — при чтении маппится в terminated (Уволен) */
  INACTIVE: 'inactive',
  /** @deprecated legacy — при чтении маппится в active */
  INTERNSHIP: 'internship',
  TERMINATED: 'terminated',
}

export const EMPLOYMENT_STATUS_LABELS = {
  active: 'Работает',
  inactive: 'Уволен',
  deactivated: 'Уволен',
  internship: 'Работает',
  trainee: 'Работает',
  terminated: 'Уволен',
  dismissed: 'Уволен',
}

export const EMPLOYMENT_STATUS_BADGE = {
  active: 'active',
  inactive: 'failed',
  deactivated: 'failed',
  internship: 'active',
  trainee: 'active',
  terminated: 'failed',
  dismissed: 'failed',
}

/** Варианты статуса в формах сотрудников (только пользовательская модель) */
export const EMPLOYEE_STATUS_OPTIONS = [
  { value: EMPLOYMENT_STATUS.ACTIVE, label: 'Работает' },
  { value: EMPLOYMENT_STATUS.TERMINATED, label: 'Уволен' },
]

/** Режим работы сотрудника (offline — магазин / online — удалённо) */
export const WORK_MODE = {
  OFFLINE: 'offline',
  ONLINE: 'online',
}

export const WORK_MODE_LABELS = {
  offline: 'Офлайн',
  online: 'Онлайн',
}

export const WORK_MODE_OPTIONS = [
  { value: WORK_MODE.OFFLINE, label: WORK_MODE_LABELS.offline },
  { value: WORK_MODE.ONLINE, label: WORK_MODE_LABELS.online },
]

/** Тип расчёта зарплаты (пока только хранение / отображение) */
export const SALARY_CALCULATION_TYPE = {
  SHIFT_BASED: 'shift_based',
  FIXED_SALARY: 'fixed_salary',
}

/** Участие в зарплатной ведомости (независимо от статуса сотрудника) */
export const PAYROLL_PARTICIPATION = {
  ACTIVE: 'active',
  EXCLUDED: 'excluded',
}

export const PAYROLL_PARTICIPATION_LABELS = {
  active: 'Активный',
  excluded: 'Исключён',
}

export const PAYROLL_PARTICIPATION_OPTIONS = [
  { value: PAYROLL_PARTICIPATION.ACTIVE, label: PAYROLL_PARTICIPATION_LABELS.active },
  { value: PAYROLL_PARTICIPATION.EXCLUDED, label: PAYROLL_PARTICIPATION_LABELS.excluded },
]

export const PAYROLL_PARTICIPATION_FILTER_OPTIONS = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'excluded', label: 'Исключённые' },
]

export const SALARY_CALCULATION_TYPE_LABELS = {
  shift_based: 'По сменам',
  fixed_salary: 'Фиксированный оклад',
}

export const SALARY_CALCULATION_TYPE_OPTIONS = [
  {
    value: SALARY_CALCULATION_TYPE.SHIFT_BASED,
    label: SALARY_CALCULATION_TYPE_LABELS.shift_based,
  },
  {
    value: SALARY_CALCULATION_TYPE.FIXED_SALARY,
    label: SALARY_CALCULATION_TYPE_LABELS.fixed_salary,
  },
]

export function normalizeWorkMode(value) {
  return value === WORK_MODE.ONLINE ? WORK_MODE.ONLINE : WORK_MODE.OFFLINE
}

export function normalizeSalaryCalculationType(value) {
  return value === SALARY_CALCULATION_TYPE.FIXED_SALARY
    ? SALARY_CALCULATION_TYPE.FIXED_SALARY
    : SALARY_CALCULATION_TYPE.SHIFT_BASED
}

export function normalizePayrollParticipation(value) {
  return value === PAYROLL_PARTICIPATION.EXCLUDED
    ? PAYROLL_PARTICIPATION.EXCLUDED
    : PAYROLL_PARTICIPATION.ACTIVE
}

export function getPayrollParticipationLabel(value) {
  return (
    PAYROLL_PARTICIPATION_LABELS[normalizePayrollParticipation(value)] ||
    PAYROLL_PARTICIPATION_LABELS.active
  )
}

export function isPayrollExcluded(employeeOrValue) {
  const value =
    employeeOrValue && typeof employeeOrValue === 'object'
      ? employeeOrValue.payrollParticipation ?? employeeOrValue.payroll_participation
      : employeeOrValue
  return normalizePayrollParticipation(value) === PAYROLL_PARTICIPATION.EXCLUDED
}

export function getWorkModeLabel(value) {
  return WORK_MODE_LABELS[normalizeWorkMode(value)] || WORK_MODE_LABELS.offline
}

export function getSalaryCalculationTypeLabel(value) {
  return (
    SALARY_CALCULATION_TYPE_LABELS[normalizeSalaryCalculationType(value)] ||
    SALARY_CALCULATION_TYPE_LABELS.shift_based
  )
}

function resolveWorkModeValue(employeeOrMode) {
  if (employeeOrMode == null) return WORK_MODE.OFFLINE
  if (typeof employeeOrMode === 'string') return employeeOrMode
  return employeeOrMode.workMode ?? employeeOrMode.work_mode
}

/** Удалённый режим — без графика, смен и присутствия в магазине */
export function isOnlineWorkMode(employeeOrMode) {
  return normalizeWorkMode(resolveWorkModeValue(employeeOrMode)) === WORK_MODE.ONLINE
}

export function isOfflineWorkMode(employeeOrMode) {
  return !isOnlineWorkMode(employeeOrMode)
}

/**
 * Участвует в графике / сменах / модулях физического присутствия.
 * Не смешивать с типом расчёта зарплаты.
 */
export function participatesInStoreSchedule(employee) {
  return isOfflineWorkMode(employee)
}

/** Нормализация статуса из базы / legacy-значений → Работает | Уволен */
export function normalizeEmploymentStatus(status) {
  if (!status) return EMPLOYMENT_STATUS.ACTIVE
  if (status === 'deactivated' || status === 'inactive') return EMPLOYMENT_STATUS.TERMINATED
  if (status === 'dismissed') return EMPLOYMENT_STATUS.TERMINATED
  if (status === 'trainee' || status === 'internship') return EMPLOYMENT_STATUS.ACTIVE
  return status
}

/** Статус для select в форме */
export function employmentStatusForForm(status) {
  const normalized = normalizeEmploymentStatus(status)
  if (
    normalized === EMPLOYMENT_STATUS.ACTIVE ||
    normalized === EMPLOYMENT_STATUS.TERMINATED
  ) {
    return normalized
  }
  return EMPLOYMENT_STATUS.ACTIVE
}

export function canEmployeeLogin(status) {
  const normalized = normalizeEmploymentStatus(status)
  return normalized === EMPLOYMENT_STATUS.ACTIVE
}

/** Сотрудник не работает (уволен), включая legacy inactive/deactivated */
export function isDeactivatedEmployeeStatus(status) {
  return normalizeEmploymentStatus(status) === EMPLOYMENT_STATUS.TERMINATED
}

export function isTerminatedEmployeeStatus(status) {
  return isDeactivatedEmployeeStatus(status)
}

export function isStaffEmployee(employee) {
  return employee?.role !== 'admin'
}

export function isActiveStaffEmployee(employee) {
  return (
    isStaffEmployee(employee) &&
    canEmployeeLogin(employee.employmentStatus)
  )
}

export function isDeactivatedStaffEmployee(employee) {
  return (
    isStaffEmployee(employee) &&
    isDeactivatedEmployeeStatus(employee.employmentStatus)
  )
}

/**
 * Фильтр списка сотрудников.
 * id `deactivated` — legacy ключ API («уволенные»); в UI подпись «Уволен».
 */
export function getStaffEmployees(filter = 'active') {
  const staff = getAllEmployees().filter(isStaffEmployee)

  if (filter === 'active') {
    return staff.filter(isActiveStaffEmployee)
  }

  if (filter === 'deactivated') {
    return staff.filter(isDeactivatedStaffEmployee)
  }

  return staff
}

/** Активные сотрудники, доступные для графика и назначения смен */
export function getScheduleEligibleEmployees(filter = 'active') {
  return getStaffEmployees(filter).filter(participatesInStoreSchedule)
}

/** Значение фильтра списка сотрудников по умолчанию */
export const EMPLOYEE_LIST_DEFAULT_STATUS = 'active'

/** Варианты фильтра статуса на странице списка сотрудников */
export const EMPLOYEE_LIST_STATUS_FILTER_OPTIONS = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Работает' },
  { id: 'deactivated', label: 'Уволен' },
]

/** Компактная подпись количества в фильтре сотрудников */
export function formatEmployeeFilterCount(status, count) {
  const total = Number(count) || 0
  if (status === 'all') return `Найдено: ${total}`
  if (status === 'active') return `Работает: ${total}`
  if (status === 'deactivated') return `Уволен: ${total}`
  return `Найдено: ${total}`
}

/** Клиентская фильтрация списка сотрудников по статусу, роли и поиску */
export function filterEmployees(
  employees,
  { search = '', status = EMPLOYEE_LIST_DEFAULT_STATUS, roleId = '' } = {}
) {
  let list = Array.isArray(employees) ? employees : []

  if (status === 'active') {
    list = list.filter(isActiveStaffEmployee)
  } else if (status === 'deactivated') {
    list = list.filter(isDeactivatedStaffEmployee)
  }

  if (roleId) {
    list = list.filter(
      (employee) =>
        String(employee.roleId || '') === String(roleId) ||
        String(employee.role || '') === String(roleId)
    )
  }

  const query = search.trim().toLowerCase()
  if (!query) return list

  return list.filter((employee) => {
    const haystack = [
      employee.name,
      employee.firstName,
      employee.lastName,
      employee.login,
      employee.position,
      employee.role,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
}

function readJson(key, fallback) {
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : fallback
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function splitName(fullName) {
  if (!fullName) return { firstName: '', lastName: '' }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/** Нормализация записи сотрудника */
export function normalizeEmployee(raw) {
  const roleId = normalizeRoleId(raw.role) || raw.role
  const role = getRole(roleId)
  const fromName = splitName(raw.name)
  const firstName = raw.firstName ?? fromName.firstName
  const lastName = raw.lastName ?? fromName.lastName
  const name = `${firstName} ${lastName}`.trim() || raw.name || ''

  return {
    ...raw,
    role: roleId,
    firstName,
    lastName,
    name,
    position: raw.position || role?.label || roleId,
    roleId: raw.roleId ?? raw.role_id ?? null,
    employmentStatus: normalizeEmploymentStatus(
      raw.employmentStatus || raw.status
    ),
    terminatedAt: toEmployeeDateKey(raw.terminatedAt ?? raw.terminated_at),
    hiredAt: toEmployeeDateKey(
      raw.hiredAt ?? raw.hired_at ?? raw.createdAt ?? raw.created_at
    ),
    workMode: normalizeWorkMode(raw.workMode ?? raw.work_mode),
    salaryCalculationType: normalizeSalaryCalculationType(
      raw.salaryCalculationType ?? raw.salary_calculation_type
    ),
    payrollParticipation: normalizePayrollParticipation(
      raw.payrollParticipation ?? raw.payroll_participation
    ),
    assignedCourseIds: Array.isArray(raw.assignedCourseIds) ? raw.assignedCourseIds : [],
    avatarUrl: raw.avatarUrl ?? raw.avatar_url ?? null,
    contactEmail: raw.contactEmail ?? raw.contact_email ?? '',
    workLocationId: raw.workLocationId ?? raw.work_location_id ?? null,
  }
}

function isMockUser(id) {
  return USERS.some((u) => u.id === id)
}

function getDeletedIds() {
  return readJson(STORAGE_KEYS.DELETED_USER_IDS, [])
}

/** Все сотрудники из localStorage (без облачного кэша) */
export function getAllEmployeesLocal() {
  const extra = readJson(STORAGE_KEYS.EXTRA_USERS, [])
  const edits = readJson(STORAGE_KEYS.USER_EDITS, {})
  const deleted = getDeletedIds()

  const base = USERS.filter((u) => !deleted.includes(u.id)).map((u) =>
    normalizeEmployee({ ...u, ...edits[u.id] })
  )

  const added = extra.map((u) => normalizeEmployee(u))

  return [...base, ...added]
}

/** Все сотрудники включая admin */
export function getAllEmployees() {
  if (isCloudMode()) {
    const cached = getCloudEmployees()
    if (cached) return cached
    return []
  }
  return getAllEmployeesLocal()
}

/** Работающие сотрудники (без admin, без уволенных) */
export function getActiveEmployees() {
  return getStaffEmployees('active')
}

/** Уволенные сотрудники (legacy id фильтра: deactivated) */
export function getDeactivatedEmployees() {
  return getStaffEmployees('deactivated')
}

/** Для статистики обучения — alias */
export function getTrainingEmployees() {
  return getActiveEmployees()
}

export function getEmployeeById(id) {
  return getAllEmployees().find((u) => u.id === id) || null
}

export function getEmployeeByLogin(login) {
  const value = login?.trim().toLowerCase()
  if (!value) return null
  return (
    getAllEmployees().find((u) => u.login?.trim().toLowerCase() === value) || null
  )
}

export function isLoginTaken(login, excludeId = null) {
  const value = login?.trim().toLowerCase()
  if (!value) return false
  return getAllEmployees().some(
    (u) => u.login?.trim().toLowerCase() === value && u.id !== excludeId
  )
}

function getNextEmployeeId() {
  const all = getAllEmployees()
  return all.length > 0 ? Math.max(...all.map((u) => u.id)) + 1 : 1
}

/** Добавить сотрудника */
export function addEmployee(data) {
  const extra = readJson(STORAGE_KEYS.EXTRA_USERS, [])

  const employee = normalizeEmployee({
    ...data,
    id: getNextEmployeeId(),
    employmentStatus: data.employmentStatus || EMPLOYMENT_STATUS.ACTIVE,
    hiredAt: data.hiredAt || todayEmployeeDateKey(),
    terminatedAt: data.terminatedAt ?? null,
    workMode: data.workMode || WORK_MODE.OFFLINE,
    salaryCalculationType:
      data.salaryCalculationType || SALARY_CALCULATION_TYPE.SHIFT_BASED,
    payrollParticipation:
      data.payrollParticipation || PAYROLL_PARTICIPATION.ACTIVE,
    assignedCourseIds: data.assignedCourseIds || [],
  })

  extra.push(employee)
  writeJson(STORAGE_KEYS.EXTRA_USERS, extra)
  return employee.id
}

/** Обновить сотрудника (mock → edits, extra → in place) */
export function updateEmployee(id, updates) {
  const extra = readJson(STORAGE_KEYS.EXTRA_USERS, [])
  const idx = extra.findIndex((u) => u.id === id)

  const payload = { ...updates }
  if (payload.password === '') delete payload.password

  if (idx >= 0) {
    extra[idx] = normalizeEmployee({ ...extra[idx], ...payload })
    writeJson(STORAGE_KEYS.EXTRA_USERS, extra)
    return
  }

  const edits = readJson(STORAGE_KEYS.USER_EDITS, {})
  edits[id] = { ...edits[id], ...payload }
  writeJson(STORAGE_KEYS.USER_EDITS, edits)
}

/** Уволить сотрудника (не удаляет из базы; дата увольнения = сегодня) */
export function deactivateEmployee(id) {
  updateEmployee(id, {
    employmentStatus: EMPLOYMENT_STATUS.TERMINATED,
    terminatedAt: todayEmployeeDateKey(),
  })
}

/** Восстановить сотрудника (статус снова «Работает»; дата приёма сохраняется) */
export function restoreEmployee(id) {
  updateEmployee(id, {
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    terminatedAt: null,
  })
}

/** Скрыть mock-сотрудника из списка / удалить extra-пользователя */
export function deleteEmployee(id) {
  if (isMockUser(id)) {
    const deleted = getDeletedIds()
    if (!deleted.includes(id)) {
      deleted.push(id)
      writeJson(STORAGE_KEYS.DELETED_USER_IDS, deleted)
    }
    return
  }

  const extra = readJson(STORAGE_KEYS.EXTRA_USERS, [])
  writeJson(
    STORAGE_KEYS.EXTRA_USERS,
    extra.filter((u) => u.id !== id)
  )
}

/** Полное удаление сотрудника из localStorage */
export function permanentlyDeleteEmployee(id) {
  if (isMockUser(id)) {
    const deleted = getDeletedIds()
    if (!deleted.includes(id)) {
      deleted.push(id)
      writeJson(STORAGE_KEYS.DELETED_USER_IDS, deleted)
    }
  } else {
    const extra = readJson(STORAGE_KEYS.EXTRA_USERS, [])
    writeJson(
      STORAGE_KEYS.EXTRA_USERS,
      extra.filter((u) => u.id !== id)
    )
  }

  const edits = readJson(STORAGE_KEYS.USER_EDITS, {})
  if (edits[id]) {
    delete edits[id]
    writeJson(STORAGE_KEYS.USER_EDITS, edits)
  }
}

/** Аутентификация по логину и паролю */
export function authenticateEmployee(loginValue, password) {
  const user = getEmployeeByLogin(loginValue)
  if (!user || user.password !== password) {
    return { ok: false, reason: 'invalid' }
  }
  if (!canEmployeeLogin(user.employmentStatus)) {
    return { ok: false, reason: 'deactivated' }
  }
  return { ok: true, user }
}

export function getEmploymentStatusLabel(status) {
  const normalized = normalizeEmploymentStatus(status)
  return EMPLOYMENT_STATUS_LABELS[normalized] || normalized
}

export function getEmploymentStatusBadgeType(status) {
  const normalized = normalizeEmploymentStatus(status)
  return EMPLOYMENT_STATUS_BADGE[normalized] || 'idle'
}

export const EMPTY_EMPLOYEE_FORM = {
  firstName: '',
  lastName: '',
  role: ROLE_IDS.CASHIER,
  roleId: '',
  login: '',
  password: '',
  avatarUrl: '',
  employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
  hiredAt: '',
  workMode: WORK_MODE.OFFLINE,
  salaryCalculationType: SALARY_CALCULATION_TYPE.SHIFT_BASED,
  payrollParticipation: PAYROLL_PARTICIPATION.ACTIVE,
  workLocationId: '',
}

export function employeeToForm(employee) {
  return {
    firstName: employee.firstName || '',
    lastName: employee.lastName || '',
    role: employee.role || ROLE_IDS.CASHIER,
    roleId: employee.roleId || '',
    login: employee.login || '',
    password: '',
    avatarUrl: employee.avatarUrl || '',
    employmentStatus: employmentStatusForForm(employee.employmentStatus),
    hiredAt: toEmployeeDateKey(employee.hiredAt) || '',
    workMode: normalizeWorkMode(employee.workMode),
    salaryCalculationType: normalizeSalaryCalculationType(employee.salaryCalculationType),
    payrollParticipation: normalizePayrollParticipation(employee.payrollParticipation),
    workLocationId: employee.workLocationId || '',
  }
}

export function validateEmployeeForm(form, editId = null) {
  if (!form.firstName?.trim()) {
    return 'Укажите имя сотрудника'
  }
  if (!form.login?.trim()) {
    return 'Укажите логин'
  }
  if (!editId && !form.password?.trim()) {
    return 'Укажите пароль'
  }
  if (editId && !toEmployeeDateKey(form.hiredAt)) {
    return 'Укажите дату приёма на работу'
  }
  if (isLoginTaken(form.login, editId)) {
    return 'Сотрудник с таким логином уже существует'
  }
  return null
}
