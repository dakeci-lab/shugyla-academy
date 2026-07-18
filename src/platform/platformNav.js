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
    description: 'Отметка прихода и ухода, статус сегодняшней смены.',
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
        description: 'Добавление, редактирование, роли и увольнение сотрудников.',
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
        description: 'Итоговые баллы за выбранный период.',
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
    id: 'hr-group',
    label: 'HR',
    routeKey: ROUTE_KEYS.HR_GROUP,
    title: 'HR',
    description: 'Вакансии, кандидаты и процесс найма.',
    pathPrefixes: ['/platform/hr'],
    children: [
      {
        id: 'hr-vacancies',
        path: '/platform/hr/vacancies',
        label: 'Вакансии',
        routeKey: ROUTE_KEYS.HR_VACANCIES,
        title: 'Вакансии',
        description: 'Управление вакансиями и ссылками для кандидатов.',
      },
      {
        id: 'hr-candidates',
        path: '/platform/hr/candidates',
        label: 'Кандидаты',
        routeKey: ROUTE_KEYS.HR_CANDIDATES,
        title: 'Кандидаты',
        description: 'Кандидаты, результаты анкетирования и статусы найма.',
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
    id: 'standards-group',
    label: 'База стандартов',
    icon: '📚',
    routeKey: ROUTE_KEYS.STANDARDS_GROUP,
    title: 'База стандартов',
    description: 'База знаний Shugyla Market — правила и регламенты работы.',
    pathPrefixes: ['/platform/standards'],
    children: [
      {
        id: 'standards-list',
        path: '/platform/standards',
        label: 'Стандарты',
        standardsReadActive: true,
        routeKey: ROUTE_KEYS.STANDARDS,
        title: 'Стандарты',
        description: 'Опубликованные стандарты компании для ознакомления.',
      },
      {
        id: 'standards-manage',
        path: '/platform/standards/manage',
        label: 'Управление стандартами',
        end: true,
        routeKey: ROUTE_KEYS.STANDARDS_MANAGE,
        title: 'Управление стандартами',
        description: 'Создание, редактирование и архивация стандартов.',
      },
    ],
  },
  {
    id: 'academy-group',
    label: 'Академия',
    icon: '🎓',
    routeKey: ROUTE_KEYS.ACADEMY_GROUP,
    title: 'Академия',
    description: 'Обучение, курсы, тесты и прогресс сотрудников.',
    pathPrefixes: ['/platform/academy', '/platform/courses/'],
    children: [
      {
        id: 'academy-cabinet',
        path: '/platform/academy/cabinet',
        label: 'Мой кабинет',
        routeKey: ROUTE_KEYS.ACADEMY,
        title: 'Мой кабинет',
        description: 'Прогресс обучения, назначенные курсы и стандарты.',
      },
      {
        id: 'academy-catalog',
        path: '/platform/academy/catalog',
        label: 'Каталог курсов',
        routeKey: ROUTE_KEYS.ACADEMY,
        title: 'Каталог курсов',
        description: 'Доступные обучающие материалы Shugyla Academy.',
        coursePlayerActive: true,
      },
      {
        id: 'academy-assignment',
        path: '/platform/academy/assignment',
        label: 'Назначение обучения',
        routeKey: ROUTE_KEYS.ACADEMY_MANAGE,
        title: 'Назначение обучения',
        description: 'Назначение курсов сотрудникам и группам по ролям.',
      },
      {
        id: 'academy-manage',
        path: '/platform/academy/manage',
        label: 'Управление академией',
        end: true,
        manageHubActive: true,
        routeKey: ROUTE_KEYS.ACADEMY_MANAGE,
        title: 'Управление академией',
        description: 'Курсы, тесты и прогресс сотрудников.',
      },
      {
        id: 'academy-tests',
        path: '/platform/academy/manage/tests',
        label: 'Тесты',
        routeKey: ROUTE_KEYS.ACADEMY_MANAGE,
        title: 'Тесты',
        description: 'Управление тестами и вопросами внутри курсов.',
      },
      {
        id: 'academy-progress',
        path: '/platform/academy/manage/progress',
        label: 'Прогресс',
        routeKey: ROUTE_KEYS.ACADEMY_MANAGE,
        title: 'Прогресс сотрудников',
        description: 'Отслеживание прогресса обучения по сотрудникам.',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Настройки',
    routeKey: ROUTE_KEYS.SETTINGS,
    title: 'Настройки',
    description: 'Тайм-трекер, роли доступа и уведомления.',
    pathPrefixes: ['/platform/settings'],
    children: [
      {
        id: 'settings-general',
        path: '/platform/settings/general',
        label: 'Управление тайм-трекером',
        end: true,
        routeKey: ROUTE_KEYS.SETTINGS_GENERAL,
        title: 'Управление тайм-трекером',
        description: 'Рабочая территория и штрафные баллы тайм-трекера.',
      },
      {
        id: 'settings-roles',
        path: '/platform/settings/roles',
        label: 'Роли и доступы',
        end: true,
        routeKey: ROUTE_KEYS.SETTINGS_ROLES,
        title: 'Роли и доступы',
        description: 'Роли сотрудников и матрица разрешений.',
      },
      {
        id: 'settings-notifications',
        path: '/platform/settings/notifications',
        label: 'Настройки уведомлений',
        end: true,
        routeKey: ROUTE_KEYS.SETTINGS_NOTIFICATIONS,
        title: 'Настройки уведомлений',
        description: 'Автоматические уведомления тайм-трекера по графику смен.',
      },
    ],
  },
]

export const PROFILE_SECTION = {
  title: 'Профиль',
  description: 'Личные данные пользователя',
}

export const NOTIFICATIONS_SECTION = {
  title: 'Уведомления',
  description: 'Лента уведомлений платформы.',
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

  const prefixes = group.pathPrefixes || []
  if (prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    return true
  }

  return group.children.some((child) => isNavItemActive(pathname, child))
}

export function isNavItemActive(pathname, item) {
  if (!item?.path) return false

  if (pathname.startsWith('/platform/courses/') && item.coursePlayerActive) {
    return true
  }

  if (item.standardsReadActive) {
    if (!pathname.startsWith('/platform/standards')) return false
    return !pathname.startsWith('/platform/standards/manage')
  }

  if (item.manageHubActive) {
    const managePrefix = '/platform/academy/manage'
    if (!pathname.startsWith(managePrefix)) return false
    const rest = pathname.slice(managePrefix.length).replace(/^\//, '')
    if (!rest) return true
    const section = rest.split('/')[0]
    return !['tests', 'progress'].includes(section)
  }

  if (item.end) {
    return pathname === item.path
  }

  return pathname === item.path || pathname.startsWith(`${item.path}/`)
}

export function getAutoExpandedGroupIds(pathname, navItems = PLATFORM_NAV) {
  return navItems
    .filter((item) => item.children && isPathInGroup(pathname, item))
    .map((item) => item.id)
}

import { getAcademySection } from './academyNav'
import { getStandardsSection } from './standardsNav'

export function getPlatformSection(pathname) {
  if (pathname === '/platform/notifications' || pathname.startsWith('/platform/notifications/')) {
    return NOTIFICATIONS_SECTION
  }

  if (pathname === '/platform/profile' || pathname.startsWith('/platform/profile/')) {
    return PROFILE_SECTION
  }

  const standardsSection = getStandardsSection(pathname)
  if (standardsSection) return standardsSection

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

  const dynamic = getDynamicPlatformSection(pathname, flat)
  if (dynamic) return dynamic

  return flat[0] || { title: 'Shugyla Platform', description: '' }
}

function getDynamicPlatformSection(pathname, flat) {
  if (/^\/platform\/employees\/payroll\/records\/[^/]+\/?$/.test(pathname)) {
    return {
      title: 'Расчёт зарплаты',
      description: 'Карточка расчёта заработной платы сотрудника.',
    }
  }

  if (/^\/platform\/employees\/\d+\/documents\/?$/.test(pathname)) {
    return {
      title: 'Документы сотрудника',
      description: 'Документы кадрового учёта сотрудника.',
    }
  }

  if (/^\/platform\/employees\/\d+(\/schedule)?\/?$/.test(pathname)) {
    return {
      title: 'Карточка сотрудника',
      description: 'Профиль, статистика и персональный график сотрудника.',
    }
  }

  if (/^\/platform\/suppliers\/[^/]+/.test(pathname)) {
    const suppliers = flat.find((item) => item.id === 'suppliers')
    return {
      title: 'Поставщик',
      description: suppliers?.description || '',
    }
  }

  if (/^\/platform\/receiving\/[^/]+/.test(pathname)) {
    return flat.find((item) => item.id === 'receiving') || null
  }

  if (/^\/platform\/procurement\/analytics\/[^/]+/.test(pathname)) {
    return {
      title: 'Аналитика закупок',
      description: 'Детализация закупки и показатели.',
    }
  }

  if (/^\/platform\/procurement\/[^/]+/.test(pathname)) {
    return flat.find((item) => item.id === 'procurement') || null
  }

  return null
}
