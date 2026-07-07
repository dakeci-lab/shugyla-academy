/**
 * Все доступные разрешения в системе Shugyla Academy
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

/** Роли всех сотрудников (кроме admin) — для курсов «для всех» */
export const ALL_EMPLOYEE_ROLES = [
  'cashier',
  'floor_admin',
  'seller',
  'buyer',
  'trainee',
]

/**
 * Роли сотрудников Shugyla Market
 * permissions — список разрешений, которые даёт роль
 */
export const ROLES = {
  admin: {
    id: 'admin',
    label: 'Владелец / директор',
    description: 'Полный доступ к платформе: управление сотрудниками, курсами, тестами и прогрессом.',
    permissions: [
      PERMISSIONS.MANAGE_USERS,
      PERMISSIONS.MANAGE_COURSES,
      PERMISSIONS.VIEW_PROGRESS,
      PERMISSIONS.MANAGE_TESTS,
      PERMISSIONS.VIEW_OWN_COURSES,
      PERMISSIONS.PASS_TESTS,
    ],
  },
  cashier: {
    id: 'cashier',
    label: 'Кассир',
    description: 'Доступ к курсам для кассиров и общим программам обучения.',
    permissions: [
      PERMISSIONS.VIEW_OWN_COURSES,
      PERMISSIONS.PASS_TESTS,
    ],
  },
  floor_admin: {
    id: 'floor_admin',
    label: 'Администратор торгового зала',
    description: 'Курсы для администраторов зала, чек-листы команды и аттестация.',
    permissions: [
      PERMISSIONS.VIEW_OWN_COURSES,
      PERMISSIONS.PASS_TESTS,
      PERMISSIONS.VIEW_TEAM_CHECKLISTS,
    ],
  },
  seller: {
    id: 'seller',
    label: 'Продавец',
    description: 'Курсы по выкладке, сервису и работе с покупателями.',
    permissions: [
      PERMISSIONS.VIEW_OWN_COURSES,
      PERMISSIONS.PASS_TESTS,
    ],
  },
  buyer: {
    id: 'buyer',
    label: 'Закупщик',
    description: 'Курсы по закупу, поставщикам и управлению товарными запасами.',
    permissions: [
      PERMISSIONS.VIEW_OWN_COURSES,
      PERMISSIONS.PASS_TESTS,
    ],
  },
  trainee: {
    id: 'trainee',
    label: 'Стажёр',
    description: 'Вводные курсы и базовые программы для новых сотрудников.',
    permissions: [
      PERMISSIONS.VIEW_OWN_COURSES,
      PERMISSIONS.PASS_TESTS,
    ],
  },
}

/** Категории для фильтрации курсов на главной странице */
export const CATEGORIES = [
  { id: 'all', label: 'Все категории' },
  { id: 'cashier', label: 'Кассир' },
  { id: 'floor_admin', label: 'Администратор' },
  { id: 'seller', label: 'Продавец' },
  { id: 'buyer', label: 'Закупщик' },
  { id: 'trainee', label: 'Стажёр' },
  { id: 'for_all', label: 'Для всех' },
]

/** Получить объект роли по id */
export function getRole(roleId) {
  return ROLES[roleId] || null
}

/** Проверить, есть ли у роли указанное разрешение */
export function hasPermission(roleId, permission) {
  const role = getRole(roleId)
  if (!role) return false
  return role.permissions.includes(permission)
}

/** Проверить, есть ли у роли хотя бы одно из разрешений */
export function hasAnyPermission(roleId, permissions) {
  return permissions.some((p) => hasPermission(roleId, p))
}

/** Админ — владелец с полным доступом ко всем курсам */
export function isAdmin(roleId) {
  return hasPermission(roleId, PERMISSIONS.MANAGE_COURSES)
}
