/**
 * Каталог прав доступа Shugyla Platform (RBAC)
 * code — стабильный идентификатор для can('employees.view')
 */

import { isAcademyModuleEnabled } from './featureFlags'

export const PERMISSION_CODES = {
  DASHBOARD_VIEW: 'dashboard.view',

  EMPLOYEES_VIEW: 'employees.view',
  EMPLOYEES_CREATE: 'employees.create',
  EMPLOYEES_EDIT: 'employees.edit',
  EMPLOYEES_DEACTIVATE: 'employees.deactivate',
  EMPLOYEES_DELETE: 'employees.delete',
  EMPLOYEES_MANAGE_ROLES: 'employees.manage_roles',

  ROLES_VIEW: 'roles.view',
  ROLES_CREATE: 'roles.create',
  ROLES_EDIT: 'roles.edit',
  ROLES_DELETE: 'roles.delete',
  ROLES_ASSIGN_PERMISSIONS: 'roles.assign_permissions',

  SCHEDULE_VIEW_TEAM: 'schedule.view_team',
  SCHEDULE_VIEW_OWN: 'schedule.view_own',
  SCHEDULE_EDIT: 'schedule.edit',
  SCHEDULE_BULK_EDIT: 'schedule.bulk_edit',

  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_CHECK_IN: 'attendance.check_in',
  ATTENDANCE_CHECK_OUT: 'attendance.check_out',

  RATING_VIEW: 'rating.view',

  RECRUITMENT_VIEW: 'recruitment.view',
  RECRUITMENT_MANAGE_VACANCIES: 'recruitment.manage_vacancies',
  RECRUITMENT_MANAGE_CANDIDATES: 'recruitment.manage_candidates',
  RECRUITMENT_INVITE_CANDIDATE: 'recruitment.invite_candidate',
  RECRUITMENT_HIRE_CANDIDATE: 'recruitment.hire_candidate',

  ACADEMY_VIEW: 'academy.view',
  ACADEMY_MANAGE_COURSES: 'academy.manage_courses',
  ACADEMY_ASSIGN_COURSES: 'academy.assign_courses',

  STANDARDS_VIEW: 'standards.view',
  STANDARDS_MANAGE: 'standards.manage',

  PROCUREMENT_VIEW: 'procurement.view',
  PROCUREMENT_CREATE: 'procurement.create',
  PROCUREMENT_EDIT: 'procurement.edit',
  PROCUREMENT_DELETE: 'procurement.delete',
  PROCUREMENT_TRANSFER: 'procurement.transfer',

  RECEIVING_VIEW: 'receiving.view',
  RECEIVING_MANAGE: 'receiving.manage',

  SUPPLIERS_VIEW: 'suppliers.view',
  SUPPLIERS_CREATE: 'suppliers.create',
  SUPPLIERS_EDIT: 'suppliers.edit',
  SUPPLIERS_DELETE: 'suppliers.delete',

  PRICE_TAGS_VIEW: 'price_tags.view',
  PRICE_TAGS_MANAGE: 'price_tags.manage',

  PAYROLL_VIEW: 'payroll.view',
  PAYROLL_CALCULATE: 'payroll.calculate',
  PAYROLL_MANAGE_SETTINGS: 'payroll.manage_settings',

  FINANCE_VIEW: 'finance.view',
  FINANCE_MANAGE: 'finance.manage',

  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',
  NOTIFICATIONS_MANAGE: 'notifications.manage',
}

/** @deprecated используйте PERMISSION_CODES */
export const PERMISSION_KEYS = PERMISSION_CODES

/** Алиасы legacy-кодов v1 → v2 */
export const LEGACY_PERMISSION_ALIASES = {
  'platform.home': PERMISSION_CODES.DASHBOARD_VIEW,
  'employees.schedule.view_team': PERMISSION_CODES.SCHEDULE_VIEW_TEAM,
  'employees.schedule.view_own': PERMISSION_CODES.SCHEDULE_VIEW_OWN,
  'employees.schedule.edit': PERMISSION_CODES.SCHEDULE_EDIT,
  'employees.rating.view': PERMISSION_CODES.RATING_VIEW,
  'employees.payroll.view': PERMISSION_CODES.PAYROLL_VIEW,
  'hr.vacancies.view': PERMISSION_CODES.RECRUITMENT_VIEW,
  'hr.vacancies.edit': PERMISSION_CODES.RECRUITMENT_MANAGE_VACANCIES,
  'hr.candidates.view': PERMISSION_CODES.RECRUITMENT_VIEW,
  'hr.candidates.edit': PERMISSION_CODES.RECRUITMENT_MANAGE_CANDIDATES,
  'receiving.receive': PERMISSION_CODES.RECEIVING_MANAGE,
  'suppliers.archive': PERMISSION_CODES.SUPPLIERS_EDIT,
  'academy.manage': PERMISSION_CODES.ACADEMY_MANAGE_COURSES,
  'academy.assign': PERMISSION_CODES.ACADEMY_ASSIGN_COURSES,
  'roles.manage': PERMISSION_CODES.ROLES_ASSIGN_PERMISSIONS,
  'users.manage': PERMISSION_CODES.EMPLOYEES_MANAGE_ROLES,
}

export const PERMISSION_MODULES = {
  dashboard: 'Главная',
  employees: 'Сотрудники',
  roles: 'Роли и доступы',
  schedule: 'График работы',
  attendance: 'Тайм-трекер',
  rating: 'Рейтинг',
  recruitment: 'HR',
  academy: 'Академия',
  standards: 'База стандартов',
  procurement: 'Закупки',
  receiving: 'Приёмка',
  suppliers: 'Поставщики',
  price_tags: 'Ценники',
  payroll: 'Зарплата',
  finance: 'Финансы',
  settings: 'Настройки',
}

/** Модули для вкладок матрицы доступа (только реальные разделы платформы) */
export const RBAC_MATRIX_MODULES = [
  'dashboard',
  'employees',
  'schedule',
  'attendance',
  'rating',
  'recruitment',
  'procurement',
  'receiving',
  'suppliers',
  'price_tags',
  'standards',
  'academy',
  'settings',
  'roles',
]

/** Visible RBAC matrix modules — Academy hidden while feature toggle is off. */
export function getRbacMatrixModules() {
  return RBAC_MATRIX_MODULES.filter(
    (module) => module !== 'academy' || isAcademyModuleEnabled()
  )
}

export const PERMISSION_ACTION_LABELS = {
  view: 'Смотреть',
  create: 'Создавать',
  edit: 'Редактировать',
  delete: 'Удалять',
  manage: 'Управлять',
  view_team: 'График команды',
  view_own: 'Свой график',
  bulk_edit: 'Массовое изменение',
  check_in: 'Отметка прихода',
  check_out: 'Отметка ухода',
  manage_roles: 'Назначение ролей',
  deactivate: 'Уволить',
  assign_permissions: 'Назначение разрешений',
  manage_vacancies: 'Управление вакансиями',
  manage_candidates: 'Управление кандидатами',
  invite_candidate: 'Приглашение кандидата',
  hire_candidate: 'Приём кандидата',
  manage_courses: 'Управление курсами',
  assign_courses: 'Назначение обучения',
  transfer: 'Передача в приёмку',
  calculate: 'Расчёт',
  manage_settings: 'Настройки модуля',
}

/** @deprecated */
export const PERMISSION_CATEGORIES = PERMISSION_MODULES

export const PERMISSION_CATALOG = [
  { code: PERMISSION_CODES.DASHBOARD_VIEW, name: 'Главная платформа', module: 'dashboard', sortOrder: 10 },
  { code: PERMISSION_CODES.EMPLOYEES_VIEW, name: 'Просмотр сотрудников', module: 'employees', sortOrder: 20 },
  { code: PERMISSION_CODES.EMPLOYEES_CREATE, name: 'Создание сотрудников', module: 'employees', sortOrder: 21 },
  { code: PERMISSION_CODES.EMPLOYEES_EDIT, name: 'Редактирование сотрудников', module: 'employees', sortOrder: 22 },
  { code: PERMISSION_CODES.EMPLOYEES_DEACTIVATE, name: 'Увольнение сотрудников', module: 'employees', sortOrder: 23 },
  { code: PERMISSION_CODES.EMPLOYEES_DELETE, name: 'Удаление сотрудников', module: 'employees', sortOrder: 24 },
  { code: PERMISSION_CODES.EMPLOYEES_MANAGE_ROLES, name: 'Назначение ролей', module: 'employees', sortOrder: 25 },
  { code: PERMISSION_CODES.ROLES_VIEW, name: 'Просмотр ролей', module: 'roles', sortOrder: 30 },
  { code: PERMISSION_CODES.ROLES_CREATE, name: 'Создание ролей', module: 'roles', sortOrder: 31 },
  { code: PERMISSION_CODES.ROLES_EDIT, name: 'Редактирование ролей', module: 'roles', sortOrder: 32 },
  { code: PERMISSION_CODES.ROLES_DELETE, name: 'Удаление ролей', module: 'roles', sortOrder: 33 },
  { code: PERMISSION_CODES.ROLES_ASSIGN_PERMISSIONS, name: 'Назначение разрешений', module: 'roles', sortOrder: 34 },
  { code: PERMISSION_CODES.SCHEDULE_VIEW_TEAM, name: 'График команды', module: 'schedule', sortOrder: 40 },
  { code: PERMISSION_CODES.SCHEDULE_VIEW_OWN, name: 'Свой график', module: 'schedule', sortOrder: 41 },
  { code: PERMISSION_CODES.SCHEDULE_EDIT, name: 'Редактирование графика', module: 'schedule', sortOrder: 42 },
  { code: PERMISSION_CODES.SCHEDULE_BULK_EDIT, name: 'Массовое редактирование', module: 'schedule', sortOrder: 43 },
  { code: PERMISSION_CODES.ATTENDANCE_VIEW, name: 'Просмотр посещаемости', module: 'attendance', sortOrder: 50 },
  { code: PERMISSION_CODES.ATTENDANCE_CHECK_IN, name: 'Отметка прихода', module: 'attendance', sortOrder: 51 },
  { code: PERMISSION_CODES.ATTENDANCE_CHECK_OUT, name: 'Отметка ухода', module: 'attendance', sortOrder: 52 },
  { code: PERMISSION_CODES.RATING_VIEW, name: 'Рейтинг сотрудников', module: 'rating', sortOrder: 60 },
  { code: PERMISSION_CODES.RECRUITMENT_VIEW, name: 'Раздел HR', module: 'recruitment', sortOrder: 70 },
  { code: PERMISSION_CODES.RECRUITMENT_MANAGE_VACANCIES, name: 'Управление вакансиями', module: 'recruitment', sortOrder: 71 },
  { code: PERMISSION_CODES.RECRUITMENT_MANAGE_CANDIDATES, name: 'Управление кандидатами', module: 'recruitment', sortOrder: 72 },
  { code: PERMISSION_CODES.RECRUITMENT_INVITE_CANDIDATE, name: 'Приглашение кандидата', module: 'recruitment', sortOrder: 73 },
  { code: PERMISSION_CODES.RECRUITMENT_HIRE_CANDIDATE, name: 'Приём кандидата', module: 'recruitment', sortOrder: 74 },
  { code: PERMISSION_CODES.ACADEMY_VIEW, name: 'Academy', module: 'academy', sortOrder: 80 },
  { code: PERMISSION_CODES.ACADEMY_MANAGE_COURSES, name: 'Управление курсами', module: 'academy', sortOrder: 81 },
  { code: PERMISSION_CODES.ACADEMY_ASSIGN_COURSES, name: 'Назначение обучения', module: 'academy', sortOrder: 82 },
  { code: PERMISSION_CODES.STANDARDS_VIEW, name: 'Стандарты', module: 'standards', sortOrder: 90 },
  { code: PERMISSION_CODES.STANDARDS_MANAGE, name: 'Редактирование стандартов', module: 'standards', sortOrder: 91 },
  { code: PERMISSION_CODES.PROCUREMENT_VIEW, name: 'Просмотр закупок', module: 'procurement', sortOrder: 100 },
  { code: PERMISSION_CODES.PROCUREMENT_CREATE, name: 'Создание закупки', module: 'procurement', sortOrder: 101 },
  { code: PERMISSION_CODES.PROCUREMENT_EDIT, name: 'Редактирование закупки', module: 'procurement', sortOrder: 102 },
  { code: PERMISSION_CODES.PROCUREMENT_DELETE, name: 'Удаление закупки', module: 'procurement', sortOrder: 103 },
  { code: PERMISSION_CODES.PROCUREMENT_TRANSFER, name: 'Передача в приёмку', module: 'procurement', sortOrder: 104 },
  { code: PERMISSION_CODES.RECEIVING_VIEW, name: 'Просмотр приёмки', module: 'receiving', sortOrder: 110 },
  { code: PERMISSION_CODES.RECEIVING_MANAGE, name: 'Управление приёмкой', module: 'receiving', sortOrder: 111 },
  { code: PERMISSION_CODES.SUPPLIERS_VIEW, name: 'Просмотр поставщиков', module: 'suppliers', sortOrder: 120 },
  { code: PERMISSION_CODES.SUPPLIERS_CREATE, name: 'Создание поставщиков', module: 'suppliers', sortOrder: 121 },
  { code: PERMISSION_CODES.SUPPLIERS_EDIT, name: 'Редактирование поставщиков', module: 'suppliers', sortOrder: 122 },
  { code: PERMISSION_CODES.SUPPLIERS_DELETE, name: 'Удаление поставщиков', module: 'suppliers', sortOrder: 123 },
  { code: PERMISSION_CODES.PRICE_TAGS_VIEW, name: 'Просмотр ценников', module: 'price_tags', sortOrder: 130 },
  { code: PERMISSION_CODES.PRICE_TAGS_MANAGE, name: 'Управление ценниками', module: 'price_tags', sortOrder: 131 },
  { code: PERMISSION_CODES.PAYROLL_VIEW, name: 'Просмотр зарплат', module: 'payroll', sortOrder: 140 },
  { code: PERMISSION_CODES.PAYROLL_CALCULATE, name: 'Расчёт зарплаты', module: 'payroll', sortOrder: 141 },
  { code: PERMISSION_CODES.PAYROLL_MANAGE_SETTINGS, name: 'Настройки зарплаты', module: 'payroll', sortOrder: 142 },
  { code: PERMISSION_CODES.FINANCE_VIEW, name: 'Просмотр финансов', module: 'finance', sortOrder: 150 },
  { code: PERMISSION_CODES.FINANCE_MANAGE, name: 'Управление финансами', module: 'finance', sortOrder: 151 },
  { code: PERMISSION_CODES.SETTINGS_VIEW, name: 'Просмотр настроек', module: 'settings', sortOrder: 160 },
  { code: PERMISSION_CODES.SETTINGS_MANAGE, name: 'Управление настройками', module: 'settings', sortOrder: 161 },
  { code: PERMISSION_CODES.NOTIFICATIONS_MANAGE, name: 'Управление уведомлениями', module: 'settings', sortOrder: 162 },
]

export const ALL_PERMISSION_CODES = PERMISSION_CATALOG.map((item) => item.code)

export const ADMIN_PROTECTED_PERMISSIONS = [
  PERMISSION_CODES.ROLES_VIEW,
  PERMISSION_CODES.ROLES_ASSIGN_PERMISSIONS,
  PERMISSION_CODES.SETTINGS_MANAGE,
]

export const RBAC_SYSTEM_ROLES = [
  { code: 'admin', name: 'Администратор', description: 'Полный доступ ко всем разделам платформы.', isSystem: true },
  { code: 'purchaser', name: 'Закупщик', description: 'Закуп, приёмка, поставщики и ценники.', isSystem: true },
  { code: 'receiver', name: 'Приёмщик', description: 'Приёмка товара и ценники.', isSystem: true },
  { code: 'floor_admin', name: 'Администратор торгового зала', description: 'Рейтинг, ценники, график и Academy.', isSystem: true },
  { code: 'cashier', name: 'Кассир', description: 'Рейтинг, обучение и личный график.', isSystem: true },
  { code: 'seller', name: 'Продавец', description: 'Рейтинг, обучение и личный график.', isSystem: true },
]

const P = PERMISSION_CODES

export const RBAC_DEFAULT_ROLE_PERMISSIONS = {
  admin: ALL_PERMISSION_CODES,
  purchaser: [
    P.DASHBOARD_VIEW, P.ATTENDANCE_VIEW, P.ATTENDANCE_CHECK_IN, P.ATTENDANCE_CHECK_OUT,
    P.SCHEDULE_VIEW_OWN, P.RATING_VIEW,
    P.PROCUREMENT_VIEW, P.PROCUREMENT_CREATE, P.PROCUREMENT_EDIT, P.PROCUREMENT_DELETE, P.PROCUREMENT_TRANSFER,
    P.RECEIVING_VIEW, P.RECEIVING_MANAGE,
    P.SUPPLIERS_VIEW, P.SUPPLIERS_CREATE, P.SUPPLIERS_EDIT, P.SUPPLIERS_DELETE,
    P.PRICE_TAGS_VIEW, P.PRICE_TAGS_MANAGE,
    P.ACADEMY_VIEW, P.STANDARDS_VIEW,
  ],
  receiver: [
    P.DASHBOARD_VIEW, P.ATTENDANCE_VIEW, P.ATTENDANCE_CHECK_IN, P.ATTENDANCE_CHECK_OUT,
    P.SCHEDULE_VIEW_OWN, P.RATING_VIEW,
    P.RECEIVING_VIEW, P.RECEIVING_MANAGE, P.PRICE_TAGS_VIEW,
    P.ACADEMY_VIEW, P.STANDARDS_VIEW,
  ],
  floor_admin: [
    P.DASHBOARD_VIEW, P.ATTENDANCE_VIEW, P.ATTENDANCE_CHECK_IN, P.ATTENDANCE_CHECK_OUT,
    P.SCHEDULE_VIEW_OWN, P.SCHEDULE_VIEW_TEAM, P.SCHEDULE_EDIT, P.RATING_VIEW,
    P.PRICE_TAGS_VIEW, P.PRICE_TAGS_MANAGE,
    P.ACADEMY_VIEW, P.STANDARDS_VIEW,
  ],
  cashier: [
    P.DASHBOARD_VIEW, P.ATTENDANCE_VIEW, P.ATTENDANCE_CHECK_IN, P.ATTENDANCE_CHECK_OUT,
    P.SCHEDULE_VIEW_OWN, P.RATING_VIEW, P.ACADEMY_VIEW, P.STANDARDS_VIEW,
  ],
  seller: [
    P.DASHBOARD_VIEW, P.ATTENDANCE_VIEW, P.ATTENDANCE_CHECK_IN, P.ATTENDANCE_CHECK_OUT,
    P.SCHEDULE_VIEW_OWN, P.RATING_VIEW, P.ACADEMY_VIEW, P.STANDARDS_VIEW,
  ],
}

export function resolvePermissionCode(code) {
  if (!code) return code
  return LEGACY_PERMISSION_ALIASES[code] || code
}

export function getPermissionLabel(code) {
  const resolved = resolvePermissionCode(code)
  return PERMISSION_CATALOG.find((item) => item.code === resolved)?.name || code
}

export function getPermissionModuleLabel(module) {
  return PERMISSION_MODULES[module] || module
}

export function getPermissionActionLabel(action) {
  if (!action) return 'Доступ'
  return PERMISSION_ACTION_LABELS[action] || action.replace(/_/g, ' ')
}

export function parsePermissionAction(code) {
  if (!code) return 'access'
  const parts = String(code).split('.')
  return parts[parts.length - 1] || 'access'
}

export function groupPermissionsForMatrix(permissions, moduleFilter = null) {
  const modules = moduleFilter ? [moduleFilter] : getRbacMatrixModules()
  const byModule = groupPermissionsByModule(permissions)
  const map = new Map(byModule.map((g) => [g.module, g]))

  return modules
    .map((module) => map.get(module))
    .filter(Boolean)
}

export function groupPermissionsByModule(permissions) {
  const groups = new Map()
  permissions.forEach((perm) => {
    const module = perm.module || perm.category || 'general'
    const list = groups.get(module) || []
    list.push(perm)
    groups.set(module, list)
  })
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const orderA = PERMISSION_CATALOG.find((p) => p.module === a)?.sortOrder ?? 999
      const orderB = PERMISSION_CATALOG.find((p) => p.module === b)?.sortOrder ?? 999
      return orderA - orderB
    })
    .map(([module, items]) => ({
      module,
      label: getPermissionModuleLabel(module),
      items: items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    }))
}

/** @deprecated */
export function groupPermissionsByCategory(permissions) {
  return groupPermissionsByModule(
    permissions.map((p) => ({ ...p, module: p.module || p.category, code: p.code || p.slug }))
  )
}

const CYRILLIC_TO_LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function transliterate(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split('')
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join('')
}

export function slugifyRoleCode(value) {
  return transliterate(value)
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export function generateUniqueRoleCode(name, existingCodes = []) {
  const set = new Set(existingCodes.filter(Boolean))
  let base = slugifyRoleCode(name)
  if (!base) base = 'role'
  let code = base
  let suffix = 2
  while (set.has(code)) {
    code = `${base}_${suffix}`
    suffix += 1
  }
  return code
}
