import { ROUTE_KEYS } from '../config/permissions'

/** Разделы Shugyla Platform — иерархическая навигация */
export const PLATFORM_NAV = [
  {
    id: 'home',
    path: '/platform',
    label: 'Главная',
    end: true,
    routeKey: ROUTE_KEYS.HOME,
    title: 'Главная',
    description: 'Сводная панель магазина: финансы, сотрудники, заказы и ключевые показатели.',
  },
  {
    id: 'employees',
    label: 'Сотрудники',
    routeKey: ROUTE_KEYS.EMPLOYEES_GROUP,
    title: 'Сотрудники',
    description: 'Учётные записи, роли и статус сотрудников.',
    children: [
      {
        id: 'employees-list',
        path: '/platform/employees/list',
        label: 'Список сотрудников',
        routeKey: ROUTE_KEYS.EMPLOYEES_LIST,
        title: 'Список сотрудников',
        description: 'Добавление, редактирование, роли и деактивация сотрудников.',
      },
      {
        id: 'employees-schedule',
        path: '/platform/employees/schedule',
        label: 'График работы',
        routeKey: ROUTE_KEYS.EMPLOYEES_SCHEDULE,
        title: 'График работы',
        description: 'Настройки графика персонала магазина.',
      },
      {
        id: 'employees-rating',
        path: '/platform/employees/rating',
        label: 'Рейтинг',
        routeKey: ROUTE_KEYS.EMPLOYEES_RATING,
        title: 'Рейтинг сотрудников',
        description: 'Рейтинг по дисциплине, приходу вовремя и уходу не раньше времени.',
      },
      {
        id: 'employees-payroll',
        path: '/platform/employees/payroll',
        label: 'Подсчёт зарплаты',
        routeKey: ROUTE_KEYS.EMPLOYEES_PAYROLL,
        title: 'Подсчёт зарплаты',
        description: 'Расчёт заработной платы сотрудников.',
      },
    ],
  },
  {
    id: 'procurement-group',
    label: 'Закупки',
    routeKey: ROUTE_KEYS.PROCUREMENT_GROUP,
    title: 'Закупки',
    description: 'Закуп, приёмка и база поставщиков.',
    children: [
      {
        id: 'procurement',
        path: '/platform/procurement',
        label: 'Закуп',
        routeKey: ROUTE_KEYS.PROCUREMENT,
        title: 'Закуп',
        description: 'Формирование заказов поставщикам на основе остатков и продаж.',
      },
      {
        id: 'receiving',
        path: '/platform/receiving',
        label: 'Приёмка',
        routeKey: ROUTE_KEYS.RECEIVING,
        title: 'Приёмка',
        description: 'Приёмка товара и сверка с накладными.',
      },
      {
        id: 'suppliers',
        path: '/platform/suppliers',
        label: 'Поставщики',
        routeKey: ROUTE_KEYS.SUPPLIERS,
        title: 'Поставщики',
        description: 'База поставщиков и контактная информация.',
      },
    ],
  },
  {
    id: 'price-tags',
    path: '/platform/price-tags',
    label: 'Ценники',
    routeKey: ROUTE_KEYS.PRICE_TAGS,
    title: 'Ценники',
    description: 'Настройки печати ценников и виды ценников.',
  },
  {
    id: 'academy',
    path: '/platform/academy',
    label: 'Academy',
    end: false,
    routeKey: ROUTE_KEYS.ACADEMY,
    title: 'Academy',
    description: 'Обучение, курсы, тесты и аттестация сотрудников.',
  },
  {
    id: 'settings',
    path: '/platform/settings',
    label: 'Настройки',
    routeKey: ROUTE_KEYS.SETTINGS,
    title: 'Настройки',
    description: 'Параметры платформы и режим работы.',
  },
]

export const PROFILE_SECTION = {
  title: 'Профиль',
  description: 'Личные данные пользователя',
}

function flattenNav(nav = PLATFORM_NAV) {
  const items = []
  for (const item of nav) {
    if (item.path) items.push(item)
    if (item.children) items.push(...item.children)
  }
  return items
}

export function isPathInGroup(pathname, group) {
  if (!group.children) return false
  return group.children.some(
    (child) =>
      pathname === child.path ||
      (child.path !== '/platform' && pathname.startsWith(`${child.path}/`))
  )
}

export function getAutoExpandedGroupIds(pathname, navItems = PLATFORM_NAV) {
  return navItems
    .filter((item) => item.children && isPathInGroup(pathname, item))
    .map((item) => item.id)
}

import { getAcademySection } from './academyNav'

export function getPlatformSection(pathname) {
  if (pathname === '/platform/profile' || pathname.startsWith('/platform/profile/')) {
    return PROFILE_SECTION
  }

  const academySection = getAcademySection(pathname)
  if (academySection) return academySection

  const flat = flattenNav()

  const exact = flat.find((item) => item.path === pathname)
  if (exact) return exact

  const nested = flat
    .filter((item) => item.path !== '/platform')
    .sort((a, b) => b.path.length - a.path.length)
    .find(
      (item) =>
        pathname === item.path || pathname.startsWith(`${item.path}/`)
    )

  if (nested) return nested

  return flat[0] || { title: 'Shugyla Platform', description: '' }
}
