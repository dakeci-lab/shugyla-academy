/** Метаданные подразделов Academy внутри платформы */

export const ACADEMY_HUB_SECTION = {
  title: 'Академия',
  description: 'Обучение, курсы, тесты и прогресс сотрудников.',
}

export const ACADEMY_CABINET_SECTION = {
  title: 'Мой кабинет',
  description: 'Прогресс обучения, назначенные курсы и стандарты.',
}

export const ACADEMY_CATALOG_SECTION = {
  title: 'Каталог курсов',
  description: 'Доступные обучающие материалы Shugyla Academy.',
}

export const ACADEMY_ASSIGNMENT_SECTION = {
  title: 'Назначение обучения',
  description: 'Назначение курсов сотрудникам и группам по ролям.',
}

export const ACADEMY_MANAGE_HUB_SECTION = {
  title: 'Управление Academy',
  description: 'Курсы, тесты и прогресс сотрудников.',
}

export const ACADEMY_MANAGE_SECTIONS = {
  courses: {
    title: 'Курсы',
    description: 'Создание и редактирование учебных курсов.',
  },
  tests: {
    title: 'Тесты',
    description: 'Управление тестами и вопросами внутри курсов.',
  },
  progress: {
    title: 'Прогресс сотрудников',
    description: 'Отслеживание прогресса обучения по сотрудникам.',
  },
}

export const ACADEMY_MANAGE_NAV = [
  { id: 'courses', label: 'Курсы' },
  { id: 'tests', label: 'Тесты' },
  { id: 'progress', label: 'Прогресс' },
]

export const ACADEMY_COURSE_SECTION = {
  title: 'Курс',
  description: 'Прохождение учебного курса.',
}

export function getAcademySection(pathname) {
  if (pathname === '/platform/academy' || pathname === '/platform/academy/') {
    return ACADEMY_HUB_SECTION
  }
  if (pathname.startsWith('/platform/academy/cabinet')) {
    return ACADEMY_CABINET_SECTION
  }
  if (pathname.startsWith('/platform/academy/catalog')) {
    return ACADEMY_CATALOG_SECTION
  }
  if (pathname.startsWith('/platform/academy/assignment')) {
    return ACADEMY_ASSIGNMENT_SECTION
  }
  if (pathname === '/platform/academy/manage') {
    return ACADEMY_MANAGE_HUB_SECTION
  }
  if (pathname.startsWith('/platform/academy/manage/')) {
    const section = pathname.split('/')[4]
    return ACADEMY_MANAGE_SECTIONS[section] || ACADEMY_MANAGE_HUB_SECTION
  }
  if (pathname.startsWith('/platform/courses/')) {
    return ACADEMY_COURSE_SECTION
  }
  return null
}
