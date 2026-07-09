import { ROLE_IDS, ALL_EMPLOYEE_ROLES } from './roles'

/**
 * Курсы обучения Shugyla Academy
 * category — категория для отображения и фильтрации
 * allowedRoles — роли, которым разрешён доступ к курсу
 */
export const COURSES = [
  {
    id: 1,
    title: 'Курс для кассиров. START',
    description:
      'Базовый курс для новых кассиров: работа с кассой, приём оплаты, возвраты и стандарты обслуживания.',
    category: 'cashier',
    allowedRoles: [ROLE_IDS.CASHIER, ROLE_IDS.ADMIN],
    duration: '4 часа',
    lessonsCount: 7,
    blocksCount: 2,
    imageColor: '#2d8f4e',
    status: 'published',
  },
  {
    id: 2,
    title: 'Курс для администраторов. START',
    description:
      'Обучение администраторов торгового зала: контроль персонала, открытие/закрытие смены, решение конфликтов.',
    category: 'floor_admin',
    allowedRoles: [ROLE_IDS.FLOOR_ADMIN, ROLE_IDS.ADMIN],
    duration: '5 часов',
    lessonsCount: 7,
    blocksCount: 4,
    imageColor: '#1a6b3c',
    status: 'published',
  },
  {
    id: 3,
    title: 'Основы сервиса в магазине',
    description:
      'Универсальный курс по клиентскому сервису: приветствие, помощь покупателю, работа с жалобами.',
    category: 'for_all',
    allowedRoles: [...ALL_EMPLOYEE_ROLES, ROLE_IDS.ADMIN],
    duration: '2 часа',
    lessonsCount: 4,
    blocksCount: 2,
    imageColor: '#3cb371',
    status: 'published',
  },
  {
    id: 4,
    title: 'Планограмма и выкладка товара',
    description:
      'Правила выкладки товаров, работа с планограммой, ротация и контроль сроков годности.',
    category: 'seller',
    allowedRoles: [ROLE_IDS.SELLER, ROLE_IDS.ADMIN],
    duration: '3 часа',
    lessonsCount: 5,
    blocksCount: 3,
    imageColor: '#228b45',
    status: 'published',
  },
  {
    id: 5,
    title: 'Система закупа и работа с поставщиками',
    description:
      'Процесс закупа товаров, ведение переговоров с поставщиками, контроль поставок и документооборот.',
    category: 'purchaser',
    allowedRoles: [ROLE_IDS.PURCHASER, ROLE_IDS.ADMIN],
    duration: '4 часа',
    lessonsCount: 6,
    blocksCount: 3,
    imageColor: '#1e7a3a',
    status: 'published',
  },
  {
    id: 6,
    title: 'Стандарты Shugyla Market',
    description:
      'Корпоративные стандарты, ценности компании, дресс-код и правила поведения на рабочем месте.',
    category: 'for_all',
    allowedRoles: [...ALL_EMPLOYEE_ROLES, ROLE_IDS.ADMIN],
    duration: '1.5 часа',
    lessonsCount: 3,
    blocksCount: 2,
    imageColor: '#2d8f4e',
    status: 'published',
  },
  {
    id: 7,
    title: 'Первые шаги в Shugyla Market',
    description:
      'Вводный курс: знакомство с магазином, базовые процедуры и наставничество.',
    category: 'for_all',
    allowedRoles: [...ALL_EMPLOYEE_ROLES, ROLE_IDS.ADMIN],
    duration: '2 часа',
    lessonsCount: 4,
    blocksCount: 2,
    imageColor: '#4caf50',
    status: 'published',
  },
]
