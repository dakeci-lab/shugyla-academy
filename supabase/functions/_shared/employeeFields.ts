export const MAX_NAME_LENGTH = 200
export const MAX_LOGIN_LENGTH = 128
export const MAX_SEARCH_LENGTH = 100
export const MAX_AVATAR_URL_LENGTH = 2048

export const SORTABLE_FIELDS = [
  'full_name',
  'login',
  'role',
  'status',
  'position',
  'created_at',
  'updated_at',
] as const

export type SortableField = (typeof SORTABLE_FIELDS)[number]

/** Status values stored in academy_users.status */
export const ALLOWED_STATUSES = new Set([
  'active',
  'inactive',
  'deactivated',
  'terminated',
  'internship',
  'trainee',
])

export const SAFE_EMPLOYEE_SELECT =
  'id, first_name, last_name, full_name, login, role, role_id, status, position, avatar_url, hired_at, terminated_at, work_mode, salary_calculation_type, payroll_participation, created_at, updated_at, auth_user_id'

export const ALLOWED_WORK_MODES = new Set(['offline', 'online'])
export const ALLOWED_SALARY_CALCULATION_TYPES = new Set(['shift_based', 'fixed_salary'])
export const ALLOWED_PAYROLL_PARTICIPATIONS = new Set(['active', 'excluded'])

export type DbEmployeeRow = {
  id: number
  first_name: string
  last_name: string
  full_name: string
  login: string
  role: string
  role_id: string | null
  status: string
  position: string
  avatar_url: string | null
  hired_at?: string | null
  terminated_at?: string | null
  work_mode?: string | null
  salary_calculation_type?: string | null
  payroll_participation?: string | null
  created_at: string
  updated_at: string
  auth_user_id?: string | null
}

export type SafeEmployee = {
  id: number
  first_name: string
  last_name: string
  full_name: string
  login: string
  role: string
  role_id: string | null
  status: string
  position: string
  avatar_url: string | null
  hired_at: string | null
  terminated_at: string | null
  work_mode: string
  salary_calculation_type: string
  payroll_participation: string
  created_at: string
  updated_at: string
  auth_linked: boolean
}

/** Calendar date YYYY-MM-DD in Asia/Almaty */
export function todayDateKeyAlmaty(date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Almaty' })
}

export function normalizeDateKey(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

export function buildFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim().slice(0, MAX_NAME_LENGTH)
}

export function normalizeWorkMode(value: unknown): string {
  return value === 'online' ? 'online' : 'offline'
}

export function normalizeSalaryCalculationType(value: unknown): string {
  return value === 'fixed_salary' ? 'fixed_salary' : 'shift_based'
}

export function normalizePayrollParticipation(value: unknown): string {
  return value === 'excluded' ? 'excluded' : 'active'
}

export function mapSafeEmployee(row: DbEmployeeRow): SafeEmployee {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: row.full_name,
    login: row.login,
    role: row.role,
    role_id: row.role_id,
    status: row.status,
    position: row.position,
    avatar_url: row.avatar_url,
    hired_at: normalizeDateKey(row.hired_at) ?? normalizeDateKey(row.created_at),
    terminated_at: normalizeDateKey(row.terminated_at),
    work_mode: normalizeWorkMode(row.work_mode),
    salary_calculation_type: normalizeSalaryCalculationType(row.salary_calculation_type),
    payroll_participation: normalizePayrollParticipation(row.payroll_participation),
    created_at: row.created_at,
    updated_at: row.updated_at,
    auth_linked: Boolean(row.auth_user_id),
  }
}

export function sanitizeSearchTerm(raw: string): string {
  return raw
    .trim()
    .slice(0, MAX_SEARCH_LENGTH)
    .replace(/[%(),.*\\]/g, '')
}
