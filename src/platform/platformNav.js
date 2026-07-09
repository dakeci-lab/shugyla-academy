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
        access: ACCESS.PROCUREMENT,
        title: 'Закуп',
        description: 'Закупочные заявки и заказы.',
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
        access: ACCESS.PROCUREMENT,
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

function flattenNav(nav = PLATFORM_NAV) {
  const items = []
  for (const item of nav) {
    if (item.path) items.push(item)
    if (item.children) items.push(...item.children)
  }
  return items
}

export function getPlatformSection(pathname) {
  const flat = flattenNav()

  const exact = flat.find((item) => item.path === pathname)
  if (exact) return exact

  const nested = flat
    .filter((item) => item.path !== '/platform')
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => pathname.startsWith(item.path))

  if (nested) return nested

  if (pathname.startsWith('/platform/suppliers/')) {
    return flat.find((item) => item.id === 'suppliers') || flat[0]
  }

  return flat[0] || { title: 'Shugyla Platform', description: '' }
}
