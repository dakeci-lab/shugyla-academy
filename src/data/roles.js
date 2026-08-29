/**
 * Система ролей Shugyla Platform
 *
 * Production access-role canonical for procurement staff: `buyer`.
 * `purchaser` remains a legacy compatibility code (inactive DB role / old content).
 */

export const PERMISSIONS = {
  MANAGE_USERS: 'manage_users',
}

export const PERMISSION_LABELS = {
  [PERMISSIONS.MANAGE_USERS]: 'Управление сотрудниками',
}

export const ROLE_IDS = {
  ADMIN: 'admin',
  BUYER: 'buyer',
  /** Legacy compatibility code. New assignments and frontend defaults use ROLE_IDS.BUYER. */
  PURCHASER: 'purchaser',
  RECEIVER: 'receiver',
  FLOOR_ADMIN: 'floor_admin',
  CASHIER: 'cashier',
  SELLER: 'seller',
}

/** Canonical production procurement role code. */
export const BUYER = ROLE_IDS.BUYER

/**
 * Legacy role-code aliases → current frontend canonical.
 * purchaser (inactive DB / old PWA) maps to buyer.
 */
const LEGACY_ROLE_ALIASES = {
  purchaser: ROLE_IDS.BUYER,
}

/** Нормализация legacy-идентификаторов ролей (не мутирует input, не трогает role_id). */
export function normalizeRoleId(roleId) {
  if (roleId == null || roleId === '') return null
  const normalized = String(roleId).trim()
  if (!normalized) return null
  return LEGACY_ROLE_ALIASES[normalized] || normalized
}

/** True when two role codes refer to the same access role after compatibility normalize. */
export function roleIdsMatch(a, b) {
  const left = normalizeRoleId(a)
  const right = normalizeRoleId(b)
  if (left == null || right == null) return false
  return left === right
}

/** Membership check that normalizes both the needle and list entries (no mutation). */
export function roleListIncludes(list, roleId) {
  if (!Array.isArray(list)) return false
  const target = normalizeRoleId(roleId)
  if (target == null) return false
  return list.some((item) => normalizeRoleId(item) === target)
}

/** Роли, назначаемые сотрудникам (кроме admin) */
export const ALL_EMPLOYEE_ROLES = [
  ROLE_IDS.BUYER,
  ROLE_IDS.RECEIVER,
  ROLE_IDS.FLOOR_ADMIN,
  ROLE_IDS.CASHIER,
  ROLE_IDS.SELLER,
]

/** Все роли для формы сотрудника (включая admin) */
export const EMPLOYEE_FORM_ROLES = [
  ROLE_IDS.ADMIN,
  ...ALL_EMPLOYEE_ROLES,
]

export const ROLES = {
  [ROLE_IDS.ADMIN]: {
    id: ROLE_IDS.ADMIN,
    label: 'Админ',
    description: 'Полный доступ ко всем разделам платформы.',
    permissions: [PERMISSIONS.MANAGE_USERS],
  },
  [ROLE_IDS.BUYER]: {
    id: ROLE_IDS.BUYER,
    label: 'Закупщик',
    description: 'Закуп, приёмка и поставщики.',
    permissions: [],
  },
  [ROLE_IDS.RECEIVER]: {
    id: ROLE_IDS.RECEIVER,
    label: 'Приёмщик',
    description: 'Приёмка товара.',
    permissions: [],
  },
  [ROLE_IDS.FLOOR_ADMIN]: {
    id: ROLE_IDS.FLOOR_ADMIN,
    label: 'Администратор торгового зала',
    description: 'Рейтинг сотрудников.',
    permissions: [],
  },
  [ROLE_IDS.CASHIER]: {
    id: ROLE_IDS.CASHIER,
    label: 'Кассир',
    description: 'Рейтинг и личный кабинет.',
    permissions: [],
  },
  [ROLE_IDS.SELLER]: {
    id: ROLE_IDS.SELLER,
    label: 'Продавец',
    description: 'Рейтинг и личный кабинет.',
    permissions: [],
  },
}

export const ROLE_LIST = Object.values(ROLES)

export function getRole(roleId) {
  const normalized = normalizeRoleId(roleId)
  return ROLES[normalized] || null
}

export function getRoleLabel(roleId) {
  return getRole(roleId)?.label || roleId || '—'
}

export function hasPermission(roleId, permission) {
  const role = getRole(roleId)
  if (!role) return false
  return role.permissions.includes(permission)
}

export function hasAnyPermission(roleId, permissions) {
  return permissions.some((p) => hasPermission(roleId, p))
}

export function hasAllPermissions(roleId, permissions) {
  return permissions.every((p) => hasPermission(roleId, p))
}

export function isAdmin(roleId) {
  return normalizeRoleId(roleId) === ROLE_IDS.ADMIN
}

export function getPermissionLabel(permission) {
  return PERMISSION_LABELS[permission] || permission
}
