/**
 * Демо-пользователи для входа в систему
 * Пароли хранятся в открытом виде — только для MVP без реальной БД
 */
export const USERS = [
  {
    id: 1,
    login: 'admin',
    password: 'admin123',
    name: 'Айгуль Нурланова',
    role: 'admin',
  },
  {
    id: 2,
    login: 'kassir',
    password: '123456',
    name: 'Данияр Султанбаев',
    role: 'cashier',
  },
  {
    id: 3,
    login: 'adminzal',
    password: '123456',
    name: 'Мадина Касымова',
    role: 'floor_admin',
  },
  {
    id: 4,
    login: 'prodavec',
    password: '123456',
    name: 'Асхат Бекенов',
    role: 'seller',
  },
  {
    id: 5,
    login: 'zakup',
    password: '123456',
    name: 'Ерлан Толеуов',
    role: 'purchaser',
  },
  {
    id: 6,
    login: 'priemka',
    password: '123456',
    name: 'Серик Аманов',
    role: 'receiver',
  },
]
