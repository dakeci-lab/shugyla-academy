import { USERS } from '../data/users'
import { getRole } from '../data/roles'
import { isCloudMode } from '../lib/dataMode'
import { getCloudEmployees } from '../lib/cloudStore'

export const STORAGE_KEYS = {
  EXTRA_USERS: 'shugyla_extra_users',
  USER_EDITS: 'shugyla_user_edits',
  DELETED_USER_IDS: 'shugyla_deleted_user_ids',
}

export const EMPLOYMENT_STATUS = {
  ACTIVE: 'active',
  INTERNSHIP: 'internship',
  TERMINATED: 'terminated',
}

export const EMPLOYMENT_STATUS_LABELS = {
  active: 'Активен',
  internship: 'Стажировка',
  terminated: 'Уволен',
}

export const EMPLOYMENT_STATUS_BADGE = {
  active: 'active',
  internship: 'progress',
  terminated: 'failed',
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
  const role = getRole(raw.role)
  const fromName = splitName(raw.name)
  const firstName = raw.firstName ?? fromName.firstName
  const lastName = raw.lastName ?? fromName.lastName
  const name = `${firstName} ${lastName}`.trim() || raw.name || ''

  return {
    ...raw,
    firstName,
    lastName,
    name,
    position: raw.position || role?.label || raw.role,
    employmentStatus: raw.employmentStatus || raw.status || EMPLOYMENT_STATUS.ACTIVE,
    assignedCourseIds: Array.isArray(raw.assignedCourseIds) ? raw.assignedCourseIds : [],
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

/** Активные сотрудники (без admin, без уволенных и удалённых) */
export function getActiveEmployees() {
  return getAllEmployees().filter(
    (u) =>
      u.role !== 'admin' &&
      u.employmentStatus !== EMPLOYMENT_STATUS.TERMINATED
  )
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

/** Деактивировать / уволить сотрудника */
export function deactivateEmployee(id) {
  updateEmployee(id, { employmentStatus: EMPLOYMENT_STATUS.TERMINATED })
}

/** Скрыть mock-сотрудника из списка */
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

/** Аутентификация по логину и паролю */
export function authenticateEmployee(loginValue, password) {
  const user = getEmployeeByLogin(loginValue)
  if (!user || user.password !== password) return null
  if (user.employmentStatus === EMPLOYMENT_STATUS.TERMINATED) return null
  return user
}

export const EMPTY_EMPLOYEE_FORM = {
  firstName: '',
  lastName: '',
  position: '',
  role: 'cashier',
  login: '',
  password: '',
  employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
  assignedCourseIds: [],
}

export function employeeToForm(employee) {
  return {
    firstName: employee.firstName || '',
    lastName: employee.lastName || '',
    position: employee.position || '',
    role: employee.role || 'cashier',
    login: employee.login || '',
    password: '',
    employmentStatus: employee.employmentStatus || EMPLOYMENT_STATUS.ACTIVE,
    assignedCourseIds: [...(employee.assignedCourseIds || [])],
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
  if (isLoginTaken(form.login, editId)) {
    return 'Сотрудник с таким логином уже существует'
  }
  return null
}
