/**
 * Роли сотрудников Shugyla Market
 * Каждая роль определяет, какие курсы доступны сотруднику
 */
export const ROLES = {
  admin: {
    id: 'admin',
    name: 'Администратор системы',
    category: null, // админ видит всё
  },
  cashier: {
    id: 'cashier',
    name: 'Кассир',
    category: 'cashier',
  },
  floor_admin: {
    id: 'floor_admin',
    name: 'Администратор торгового зала',
    category: 'floor_admin',
  },
  seller: {
    id: 'seller',
    name: 'Продавец',
    category: 'seller',
  },
  buyer: {
    id: 'buyer',
    name: 'Закупщик',
    category: 'buyer',
  },
  trainee: {
    id: 'trainee',
    name: 'Стажёр',
    category: 'trainee',
  },
}

/**
 * Категории для фильтрации курсов на главной странице
 */
export const CATEGORIES = [
  { id: 'all', label: 'Все категории' },
  { id: 'cashier', label: 'Кассир' },
  { id: 'floor_admin', label: 'Администратор' },
  { id: 'seller', label: 'Продавец' },
  { id: 'buyer', label: 'Закупщик' },
  { id: 'trainee', label: 'Стажёр' },
  { id: 'for_all', label: 'Для всех' },
]
