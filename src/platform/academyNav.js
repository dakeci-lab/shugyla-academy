/** Метаданные подразделов Academy внутри платформы */

export const ACADEMY_HUB_SECTION = {
  title: 'Academy',
  description: 'Обучение, курсы, тесты и аттестация сотрудников.',
}

export const ACADEMY_CABINET_SECTION = {
  title: 'Мой кабинет',
  description: 'Прогресс обучения, назначенные курсы, маршруты и стандарты.',
}

export const ACADEMY_CATALOG_SECTION = {
  title: 'Каталог курсов',
  description: 'Доступные обучающие материалы Shugyla Academy.',
}

export const ACADEMY_STANDARDS_SECTION = {
  title: 'Стандарты компании',
  description: 'База стандартов Shugyla Market — правила и регламенты работы.',
}

export const ACADEMY_MANAGE_HUB_SECTION = {
  title: 'Управление Academy',
  description: 'Курсы, тесты, маршруты, найм и прогресс сотрудников.',
}

export const ACADEMY_MANAGE_SECTIONS = {
  courses: {
    title: 'Курсы',
    description: 'Создание и редактирование учебных курсов.',
  },
  tests: {
    title: 'Тесты',
    description: 'Управление тестами и вопросами для аттестации.',
  },
  attestation: {
    title: 'Аттестация',
    description: 'Результаты аттестации и выдача сертификатов.',
  },
  routes: {
    title: 'Обучающие маршруты',
    description: 'Маршруты по должностям и порядок курсов.',
  },
  standards: {
    title: 'Стандарты обучения',
    description: 'База стандартов — статьи и ознакомление сотрудников.',
  },
  progress: {
    title: 'Прогресс сотрудников',
    description: 'Отслеживание прогресса обучения по сотрудникам.',
  },
  hiring: {
    title: 'Найм / кандидаты',
    description: 'Вакансии, фильтр-вопросы и кандидаты на должности.',
  },
}

export const ACADEMY_MANAGE_NAV = [
  { id: 'courses', label: 'Курсы' },
  { id: 'tests', label: 'Тесты' },
  { id: 'attestation', label: 'Аттестация' },
  { id: 'routes', label: 'Маршруты' },
  { id: 'standards', label: 'Стандарты' },
  { id: 'progress', label: 'Прогресс' },
  { id: 'hiring', label: 'Найм' },
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
  if (pathname.startsWith('/platform/academy/standards')) {
    return ACADEMY_STANDARDS_SECTION
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
