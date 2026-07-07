/** Переводы интерфейса главной страницы (RU / KZ) */
export const translations = {
  ru: {
    contact: 'Связаться',
    login: 'Войти',
    heroBadge: 'Shugyla Academy',
    heroTitle: 'Делаем сотрудников профессионалами своего дела',
    heroSubtitle: 'Внутренняя академия для обучения команды Shugyla Market',
    startLearning: 'Начать обучение',
    coursesHeading: 'Курсы обучения',
    coursesSubheading: 'Выберите программу по вашей роли или направлению',
    coursesCount: 'курсов',
    openCourse: 'Открыть курс',
    lessons: 'уроков',
    blocks: 'блоков',
    emptyCourses: 'Курсы в этой категории пока не добавлены.',
    adminPanel: 'Админ-панель',
  },
  kz: {
    contact: 'Байланысу',
    login: 'Кіру',
    heroBadge: 'Shugyla Academy',
    heroTitle: 'Қызметкерлерді өз ісінің маманы етеміз',
    heroSubtitle: 'Shugyla Market командасын оқытуға арналған ішкі академия',
    startLearning: 'Оқуды бастау',
    coursesHeading: 'Оқу курстары',
    coursesSubheading: 'Рөліңізге немесе бағытыңызға сәйкес бағдарламаны таңдаңыз',
    coursesCount: 'курс',
    openCourse: 'Курсты ашу',
    lessons: 'сабақ',
    blocks: 'блок',
    emptyCourses: 'Бұл санатта курстар әзірге жоқ.',
    adminPanel: 'Әкімші панелі',
  },
}

export function getCategoryLabel(categoryId, lang = 'ru') {
  const labels = {
    ru: {
      all: 'Все категории',
      cashier: 'Кассир',
      floor_admin: 'Администратор',
      seller: 'Продавец',
      buyer: 'Закупщик',
      trainee: 'Стажёр',
      for_all: 'Для всех',
    },
    kz: {
      all: 'Барлық санаттар',
      cashier: 'Кассир',
      floor_admin: 'Әкімші',
      seller: 'Сатушы',
      buyer: 'Сатып алушы',
      trainee: 'Стажёр',
      for_all: 'Барлығына',
    },
  }
  return labels[lang]?.[categoryId] || categoryId
}
