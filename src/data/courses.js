/**
 * Курсы обучения Shugyla Academy
 * category — для какой роли предназначен курс ('for_all' = для всех)
 */
export const COURSES = [
  {
    id: 1,
    title: 'Курс для кассиров. START',
    description:
      'Базовый курс для новых кассиров: работа с кассой, приём оплаты, возвраты и стандарты обслуживания.',
    category: 'cashier',
    duration: '4 часа',
    lessonsCount: 6,
    imageColor: '#2d8f4e',
  },
  {
    id: 2,
    title: 'Курс для администраторов. START',
    description:
      'Обучение администраторов торгового зала: контроль персонала, открытие/закрытие смены, решение конфликтов.',
    category: 'floor_admin',
    duration: '5 часов',
    lessonsCount: 7,
    imageColor: '#1a6b3c',
  },
  {
    id: 3,
    title: 'Основы сервиса в магазине',
    description:
      'Универсальный курс по клиентскому сервису: приветствие, помощь покупателю, работа с жалобами.',
    category: 'for_all',
    duration: '2 часа',
    lessonsCount: 4,
    imageColor: '#3cb371',
  },
  {
    id: 4,
    title: 'Планограмма и выкладка товара',
    description:
      'Правила выкладки товаров, работа с планограммой, ротация и контроль сроков годности.',
    category: 'seller',
    duration: '3 часа',
    lessonsCount: 5,
    imageColor: '#228b45',
  },
  {
    id: 5,
    title: 'Система закупа и работа с поставщиками',
    description:
      'Процесс закупа товаров, ведение переговоров с поставщиками, контроль поставок и документооборот.',
    category: 'buyer',
    duration: '4 часа',
    lessonsCount: 6,
    imageColor: '#1e7a3a',
  },
  {
    id: 6,
    title: 'Стандарты Shugyla Market',
    description:
      'Корпоративные стандарты, ценности компании, дресс-код и правила поведения на рабочем месте.',
    category: 'for_all',
    duration: '1.5 часа',
    lessonsCount: 3,
    imageColor: '#2d8f4e',
  },
  {
    id: 7,
    title: 'Стажировка: первые шаги',
    description:
      'Вводный курс для стажёров: знакомство с магазином, базовые процедуры и наставничество.',
    category: 'trainee',
    duration: '2 часа',
    lessonsCount: 4,
    imageColor: '#4caf50',
  },
]
