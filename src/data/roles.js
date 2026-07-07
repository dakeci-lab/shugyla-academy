/**
 * Система ролей и разрешений Shugyla Academy (mock data)
 *
 * Каждая роль: id, label, description, permissions
 * Курсы ограничиваются через allowedRoles в courses.js
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

/** Человекочитаемые названия разрешений (для UI) */
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
  CASHIER: 'cashier',
  FLOOR_ADMIN: 'floor_admin',
  SELLER: 'seller',
  BUYER: 'buyer',
  TRAINEE: 'trainee',
}

/** Роли всех сотрудников (кроме admin) — для курсов «для всех» */
export const ALL_EMPLOYEE_ROLES = [
  ROLE_IDS.CASHIER,
  ROLE_IDS.FLOOR_ADMIN,
  ROLE_IDS.SELLER,
  ROLE_IDS.BUYER,
  ROLE_IDS.TRAINEE,
]

/**
 * Роли сотрудников Shugyla Market
 */
export const ROLES = {
  [ROLE_IDS.ADMIN]: {
    id: ROLE_IDS.ADMIN,
    label: 'Владелец / директор',
    description:
      'Полный доступ к платформе: управление сотрудниками, курсами, тестами и прогрессом.',
    permissions: [
      PERMISSIONS.MANAGE_USERS,
      PERMISSIONS.MANAGE_COURSES,
      PERMISSIONS.VIEW_PROGRESS,
      PERMISSIONS.MANAGE_TESTS,
      PERMISSIONS.VIEW_OWN_COURSES,
      PERMISSIONS.PASS_TESTS,
    ],
  },
  [ROLE_IDS.CASHIER]: {
    id: ROLE_IDS.CASHIER,
    label: 'Кассир',
    description: 'Доступ к курсам для кассиров и общим программам обучения.',
    permissions: [PERMISSIONS.VIEW_OWN_COURSES, PERMISSIONS.PASS_TESTS],
  },
  [ROLE_IDS.FLOOR_ADMIN]: {
    id: ROLE_IDS.FLOOR_ADMIN,
    label: 'Администратор торгового зала',
    description: 'Курсы для администраторов зала, чек-листы команды и аттестация.',
    permissions: [
      PERMISSIONS.VIEW_OWN_COURSES,
      PERMISSIONS.PASS_TESTS,
      PERMISSIONS.VIEW_TEAM_CHECKLISTS,
    ],
  },
  [ROLE_IDS.SELLER]: {
    id: ROLE_IDS.SELLER,
    label: 'Продавец',
    description: 'Курсы по выкладке, сервису и работе с покупателями.',
    permissions: [PERMISSIONS.VIEW_OWN_COURSES, PERMISSIONS.PASS_TESTS],
  },
  [ROLE_IDS.BUYER]: {
    id: ROLE_IDS.BUYER,
    label: 'Закупщик',
    description: 'Курсы по закупу, поставщикам и управлению товарными запасами.',
    permissions: [PERMISSIONS.VIEW_OWN_COURSES, PERMISSIONS.PASS_TESTS],
  },
  [ROLE_IDS.TRAINEE]: {
    id: ROLE_IDS.TRAINEE,
    label: 'Стажёр',
    description: 'Вводные курсы и базовые программы для новых сотрудников.',
    permissions: [PERMISSIONS.VIEW_OWN_COURSES, PERMISSIONS.PASS_TESTS],
  },
}

/** Список всех ролей (для селектов и итерации) */
export const ROLE_LIST = Object.values(ROLES)

/** Категории для фильтрации курсов на главной странице */
export const CATEGORIES = [
  { id: 'all', label: 'Все категории' },
  { id: ROLE_IDS.CASHIER, label: 'Кассир' },
  { id: ROLE_IDS.FLOOR_ADMIN, label: 'Администратор' },
  { id: ROLE_IDS.SELLER, label: 'Продавец' },
  { id: ROLE_IDS.BUYER, label: 'Закупщик' },
  { id: ROLE_IDS.TRAINEE, label: 'Стажёр' },
  { id: 'for_all', label: 'Для всех' },
]

export function getRole(roleId) {
  return ROLES[roleId] || null
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

/** Админ — владелец с полным доступом ко всем курсам и админ-панели */
export function isAdmin(roleId) {
  return roleId === ROLE_IDS.ADMIN
}

export function getPermissionLabel(permission) {
  return PERMISSION_LABELS[permission] || permission
}
