import { USERS } from '../data/users'
import { ROLES } from '../data/roles'
import { COURSES } from '../data/courses'
import { saveUser } from './storage'

/**
 * Попытка входа по логину и паролю
 * Возвращает объект пользователя или null
 */
export function login(login, password) {
  const user = USERS.find(
    (u) => u.login === login && u.password === password
  )
  if (!user) return null

  // Сохраняем без пароля в localStorage
  const sessionUser = {
    id: user.id,
    login: user.login,
    name: user.name,
    role: user.role,
    roleName: ROLES[user.role]?.name || user.role,
  }
  saveUser(sessionUser)
  return sessionUser
}

/**
 * Получить курсы, доступные для роли пользователя
 * admin видит все курсы, остальные — свои + «для всех»
 */
export function getCoursesForRole(role) {
  if (role === 'admin') return COURSES

  const roleCategory = ROLES[role]?.category
  return COURSES.filter(
    (course) =>
      course.category === 'for_all' || course.category === roleCategory
  )
}

/**
 * Проверить, имеет ли пользователь доступ к курсу
 */
export function canAccessCourse(role, courseCategory) {
  if (role === 'admin') return true
  if (courseCategory === 'for_all') return true
  const roleCategory = ROLES[role]?.category
  return courseCategory === roleCategory
}
