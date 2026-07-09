import { ACCESS } from './platformAccess'

/** Разделы Shugyla Platform — иерархическая навигация */
export const PLATFORM_NAV = [
  {
    id: 'home',
    path: '/platform',
    label: 'Главная',
    end: true,
    access: ACCESS.ADMIN,
    title: 'Главная',
    description: 'Сводная панель магазина: финансы, сотрудники, заказы и ключевые показатели.',
  },
  {
    id: 'employees',
    label: 'Сотрудники',
    access: ACCESS.ADMIN,
    title: 'Сотрудники',
    description: 'Информация и настройки сотрудников компании.',
    children: [
      {
        id: 'employees-list',
        path: '/platform/employees/list',
        label: 'Список сотрудников',
        access: ACCESS.ADMIN,
        title: 'Список сотрудников',
        description: 'Добавление, редактирование и деактивация сотрудников.',
      },
      {
        id: 'employees-schedule',
        path: '/platform/employees/schedule',
        label: 'График работы',
        access: ACCESS.ADMIN,
        title: 'График работы',
        description: 'Настройки графика персонала магазина.',
      },
      {
        id: 'employees-rating',
        path: '/platform/employees/rating',
        label: 'Рейтинг',
        access: ACCESS.ALL,
        title: 'Рейтинг сотрудников',
        description: 'Рейтинг по дисциплине, приходу вовремя и уходу не раньше времени.',
      },
      {
        id: 'employees-payroll',
        path: '/platform/employees/payroll',
        label: 'Подсчёт зарплаты',
        access: ACCESS.ADMIN,
        title: 'Подсчёт зарплаты',
        description: 'Расчёт заработной платы сотрудников.',
      },
    ],
  },
  {
    id: 'procurement-group',
    label: 'Закупки',
    access: ACCESS.PROCUREMENT,
    title: 'Закупки',
    description: 'Закуп, приёмка и база поставщиков.',
    children: [
      {
        id: 'procurement',
        path: '/platform/procurement',
        label: 'Закуп',
        access: ACCESS.PURCHASE_VIEW,
        title: 'Закуп',
        description: 'Формирование заказов поставщикам на основе остатков и продаж.',
      },
      {
        id: 'receiving',
        path: '/platform/receiving',
        label: 'Приёмка',
        access: ACCESS.PROCUREMENT,
        title: 'Приёмка',
        description: 'Приёмка товара и сверка с накладными.',
      },
      {
        id: 'suppliers',
        path: '/platform/suppliers',
        label: 'Поставщики',
        access: ACCESS.SUPPLIERS_VIEW,
        title: 'Поставщики',
        description: 'База поставщиков и контактная информация.',
      },
    ],
  },
  {
    id: 'price-tags',
    path: '/platform/price-tags',
    label: 'Ценники',
    access: ACCESS.PROCUREMENT,
    title: 'Ценники',
    description: 'Настройки печати ценников и виды ценников.',
  },
  {
    id: 'academy',
    path: '/platform/academy',
    label: 'Academy',
    end: false,
    access: ACCESS.ALL,
    title: 'Academy',
    description: 'Обучение, курсы, тесты и аттестация сотрудников.',
  },
  {
    id: 'settings',
    path: '/platform/settings',
    label: 'Настройки',
    access: ACCESS.ADMIN,
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
