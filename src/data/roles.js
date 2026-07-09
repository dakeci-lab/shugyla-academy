/**
 * Система ролей Shugyla Platform + Academy
 */

export const PERMISSIONS = {
  MANAGE_USERS: 'manage_users',
  MANAGE_COURSES: 'manage_courses',
  VIEW_PROGRESS: 'view_progress',
  MANAGE_TESTS: 'manage_tests',
  VIEW_OWN_COURSES: 'view_own_courses',
  PASS_TESTS: 'pass_tests',
  VIEW_TEAM_CHECKLISTS: 'view_team_checklists',
}

export const PERMISSION_LABELS = {
  [PERMISSIONS.MANAGE_USERS]: 'Управление сотрудниками',
  [PERMISSIONS.MANAGE_COURSES]: 'Управление курсами',
  [PERMISSIONS.VIEW_PROGRESS]: 'Просмотр прогресса',
  [PERMISSIONS.MANAGE_TESTS]: 'Управление тестами',
  [PERMISSIONS.VIEW_OWN_COURSES]: 'Доступ к своим курсам',
  [PERMISSIONS.PASS_TESTS]: 'Прохождение тестов',
  [PERMISSIONS.VIEW_TEAM_CHECKLISTS]: 'Чек-листы команды',
}

export const ROLE_IDS = {
  ADMIN: 'admin',
  PURCHASER: 'purchaser',
  RECEIVER: 'receiver',
  FLOOR_ADMIN: 'floor_admin',
  CASHIER: 'cashier',
  SELLER: 'seller',
}

/** @deprecated используйте ROLE_IDS.PURCHASER */
export const BUYER = ROLE_IDS.PURCHASER

const LEGACY_ROLE_ALIASES = {
  buyer: ROLE_IDS.PURCHASER,
}

/** Нормализация legacy-идентификаторов ролей */
export function normalizeRoleId(roleId) {
  if (!roleId) return null
  return LEGACY_ROLE_ALIASES[roleId] || roleId
}

/** Роли, назначаемые сотрудникам (кроме admin) */
export const ALL_EMPLOYEE_ROLES = [
  ROLE_IDS.PURCHASER,
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
    permissions: [
      PERMISSIONS.MANAGE_USERS,
      PERMISSIONS.MANAGE_COURSES,
      PERMISSIONS.VIEW_PROGRESS,
      PERMISSIONS.MANAGE_TESTS,
      PERMISSIONS.VIEW_OWN_COURSES,
      PERMISSIONS.PASS_TESTS,
    ],
  },
  [ROLE_IDS.PURCHASER]: {
    id: ROLE_IDS.PURCHASER,
    label: 'Закупщик',
    description: 'Закуп, приёмка, поставщики и ценники.',
    permissions: [PERMISSIONS.VIEW_OWN_COURSES, PERMISSIONS.PASS_TESTS],
  },
  [ROLE_IDS.RECEIVER]: {
    id: ROLE_IDS.RECEIVER,
    label: 'Приёмщик',
    description: 'Приёмка товара и ценники.',
    permissions: [PERMISSIONS.VIEW_OWN_COURSES, PERMISSIONS.PASS_TESTS],
  },
  [ROLE_IDS.FLOOR_ADMIN]: {
    id: ROLE_IDS.FLOOR_ADMIN,
    label: 'Администратор торгового зала',
    description: 'Рейтинг сотрудников, ценники и Academy.',
    permissions: [
      PERMISSIONS.VIEW_OWN_COURSES,
      PERMISSIONS.PASS_TESTS,
      PERMISSIONS.VIEW_TEAM_CHECKLISTS,
    ],
  },
  [ROLE_IDS.CASHIER]: {
    id: ROLE_IDS.CASHIER,
    label: 'Кассир',
    description: 'Рейтинг и обучение.',
    permissions: [PERMISSIONS.VIEW_OWN_COURSES, PERMISSIONS.PASS_TESTS],
  },
  [ROLE_IDS.SELLER]: {
    id: ROLE_IDS.SELLER,
    label: 'Продавец',
    description: 'Рейтинг и обучение.',
    permissions: [PERMISSIONS.VIEW_OWN_COURSES, PERMISSIONS.PASS_TESTS],
  },
}

export const ROLE_LIST = Object.values(ROLES)

export const CATEGORIES = [
  { id: 'all', label: 'Все категории' },
  { id: ROLE_IDS.CASHIER, label: 'Кассир' },
  { id: ROLE_IDS.FLOOR_ADMIN, label: 'Администратор торгового зала' },
  { id: ROLE_IDS.SELLER, label: 'Продавец' },
  { id: ROLE_IDS.PURCHASER, label: 'Закупщик' },
  { id: ROLE_IDS.RECEIVER, label: 'Приёмщик' },
  { id: 'for_all', label: 'Для всех' },
]

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
