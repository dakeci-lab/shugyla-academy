/**
 * Уроки для каждого курса
 * courseId — ID курса, к которому относится урок
 */
export const LESSONS = [
  // Курс 1 — Кассиры
  { id: 101, courseId: 1, title: 'Знакомство с кассовым оборудованием', duration: '30 мин', order: 1 },
  { id: 102, courseId: 1, title: 'Приём наличных и безналичных платежей', duration: '45 мин', order: 2 },
  { id: 103, courseId: 1, title: 'Работа со скидками и акциями', duration: '30 мин', order: 3 },
  { id: 104, courseId: 1, title: 'Возврат товара и оформление чека', duration: '40 мин', order: 4 },
  { id: 105, courseId: 1, title: 'Работа с очередью и стрессовыми ситуациями', duration: '35 мин', order: 5 },
  { id: 106, courseId: 1, title: 'Закрытие смены кассира', duration: '40 мин', order: 6 },

  // Курс 2 — Администраторы зала
  { id: 201, courseId: 2, title: 'Роль администратора торгового зала', duration: '30 мин', order: 1 },
  { id: 202, courseId: 2, title: 'Открытие и закрытие смены', duration: '45 мин', order: 2 },
  { id: 203, courseId: 2, title: 'Контроль работы персонала', duration: '40 мин', order: 3 },
  { id: 204, courseId: 2, title: 'Решение конфликтных ситуаций', duration: '50 мин', order: 4 },
  { id: 205, courseId: 2, title: 'Инвентаризация и списание', duration: '45 мин', order: 5 },
  { id: 206, courseId: 2, title: 'Отчётность и коммуникация с руководством', duration: '35 мин', order: 6 },
  { id: 207, courseId: 2, title: 'Чрезвычайные ситуации', duration: '35 мин', order: 7 },

  // Курс 3 — Сервис
  { id: 301, courseId: 3, title: 'Стандарты приветствия покупателя', duration: '25 мин', order: 1 },
  { id: 302, courseId: 3, title: 'Активные продажи и консультация', duration: '35 мин', order: 2 },
  { id: 303, courseId: 3, title: 'Работа с жалобами', duration: '40 мин', order: 3 },
  { id: 304, courseId: 3, title: 'Создание лояльности покупателей', duration: '20 мин', order: 4 },

  // Курс 4 — Планограмма
  { id: 401, courseId: 4, title: 'Что такое планограмма', duration: '30 мин', order: 1 },
  { id: 402, courseId: 4, title: 'Правила выкладки по категориям', duration: '40 мин', order: 2 },
  { id: 403, courseId: 4, title: 'Контроль сроков годности', duration: '35 мин', order: 3 },
  { id: 404, courseId: 4, title: 'Ротация товаров (FIFO)', duration: '30 мин', order: 4 },
  { id: 405, courseId: 4, title: 'Оформление промо-зон', duration: '45 мин', order: 5 },

  // Курс 5 — Закуп
  { id: 501, courseId: 5, title: 'Процесс закупа в Shugyla Market', duration: '40 мин', order: 1 },
  { id: 502, courseId: 5, title: 'Работа с поставщиками', duration: '45 мин', order: 2 },
  { id: 503, courseId: 5, title: 'Контроль поставок и приёмка', duration: '40 мин', order: 3 },
  { id: 504, courseId: 5, title: 'Документооборот и учёт', duration: '35 мин', order: 4 },
  { id: 505, courseId: 5, title: 'Анализ продаж и планирование закупа', duration: '50 мин', order: 5 },
  { id: 506, courseId: 5, title: 'Работа с дефицитом и излишками', duration: '30 мин', order: 6 },

  // Курс 6 — Стандарты
  { id: 601, courseId: 6, title: 'Ценности и миссия Shugyla Market', duration: '25 мин', order: 1 },
  { id: 602, courseId: 6, title: 'Дресс-код и внешний вид', duration: '20 мин', order: 2 },
  { id: 603, courseId: 6, title: 'Правила поведения на рабочем месте', duration: '45 мин', order: 3 },

  // Курс 7 — Стажёр
  { id: 701, courseId: 7, title: 'Добро пожаловать в Shugyla Market', duration: '20 мин', order: 1 },
  { id: 702, courseId: 7, title: 'Знакомство с командой и наставником', duration: '25 мин', order: 2 },
  { id: 703, courseId: 7, title: 'Базовые процедуры магазина', duration: '35 мин', order: 3 },
  { id: 704, courseId: 7, title: 'Первые рабочие задачи', duration: '40 мин', order: 4 },
]
