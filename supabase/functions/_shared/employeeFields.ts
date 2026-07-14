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
  'id, first_name, last_name, full_name, login, role, role_id, status, position, avatar_url, created_at, updated_at, auth_user_id'

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
  created_at: string
  updated_at: string
  auth_linked: boolean
}

export function buildFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim().slice(0, MAX_NAME_LENGTH)
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
