/** Разделы Shugyla Platform — конфигурация навигации */

export const PLATFORM_NAV = [
  {
    id: 'dashboard',
    path: '/platform',
    label: 'Панель управления',
    icon: '◉',
    end: true,
    title: 'Панель управления',
    description: 'Сводка по ключевым разделам платформы.',
  },
  {
    id: 'products',
    path: '/platform/products',
    label: 'Товары',
    icon: '▦',
    title: 'Товары',
    description: 'Каталог товаров и номенклатура магазина.',
  },
  {
    id: 'suppliers',
    path: '/platform/suppliers',
    label: 'Поставщики',
    icon: '◫',
    title: 'Поставщики',
    description: 'База поставщиков и контактная информация.',
  },
  {
    id: 'procurement',
    path: '/platform/procurement',
    label: 'Закуп',
    icon: '⇄',
    title: 'Закуп',
    description: 'Заказы и закупочные операции.',
  },
  {
    id: 'receiving',
    path: '/platform/receiving',
    label: 'Приёмка',
    icon: '↧',
    title: 'Приёмка',
    description: 'Приёмка товара на склад и сверка поставок.',
  },
  {
    id: 'price-tags',
    path: '/platform/price-tags',
    label: 'Ценники',
    icon: '▤',
    title: 'Ценники',
    description: 'Печать и обновление ценников.',
  },
  {
    id: 'employees',
    path: '/platform/employees',
    label: 'Сотрудники',
    icon: '◎',
    title: 'Сотрудники',
    description: 'Сотрудники магазина и их роли.',
  },
  {
    id: 'academy',
    path: '/platform/academy',
    label: 'Academy',
    icon: '📚',
    title: 'Academy',
    description: 'Обучение, курсы, тесты и аттестация сотрудников.',
  },
  {
    id: 'standards',
    path: '/platform/standards',
    label: 'Стандарты',
    icon: '◈',
    title: 'Стандарты',
    description: 'База стандартов и регламентов Shugyla Market.',
  },
  {
    id: 'finance',
    path: '/platform/finance',
    label: 'Финансы',
    icon: '₸',
    title: 'Финансы',
    description: 'Финансовые показатели и отчёты.',
  },
  {
    id: 'settings',
    path: '/platform/settings',
    label: 'Настройки',
    icon: '⚙',
    title: 'Настройки',
    description: 'Параметры платформы и режим работы.',
  },
]

export function getPlatformSection(pathname) {
  const exact = PLATFORM_NAV.find((item) => item.path === pathname)
  if (exact) return exact

  const nested = PLATFORM_NAV.find(
    (item) => item.path !== '/platform' && pathname.startsWith(item.path)
  )
  if (nested) return nested

  return PLATFORM_NAV[0]
}
