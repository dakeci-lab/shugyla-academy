/** Метаданные раздела «База стандартов» */

export const STANDARDS_GROUP_SECTION = {
  title: 'База стандартов',
  description: 'База знаний Shugyla Market — правила и регламенты работы.',
}

export const STANDARDS_LIST_SECTION = {
  title: 'Стандарты',
  description: 'Опубликованные стандарты компании для ознакомления.',
}

export const STANDARDS_MANAGE_SECTION = {
  title: 'Управление стандартами',
  description: 'Создание, редактирование и архивация стандартов.',
}

export const STANDARDS_DETAIL_SECTION = {
  title: 'Стандарт',
  description: 'Просмотр стандарта компании.',
}

export function getStandardsSection(pathname) {
  if (pathname === '/platform/standards/manage') {
    return STANDARDS_MANAGE_SECTION
  }
  if (pathname.startsWith('/platform/standards/') && pathname !== '/platform/standards/manage') {
    return STANDARDS_DETAIL_SECTION
  }
  if (pathname === '/platform/standards' || pathname === '/platform/standards/') {
    return STANDARDS_LIST_SECTION
  }
  return null
}
