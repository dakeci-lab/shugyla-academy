import { USERS } from '../data/users'
import { ROLES, getRole, hasPermission, isAdmin, PERMISSIONS } from '../data/roles'
import { getAllCourses } from './adminData'
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

  const role = getRole(user.role)

  // Сохраняем без пароля в localStorage
  const sessionUser = {
    id: user.id,
    login: user.login,
    name: user.name,
    role: user.role,
    roleName: role?.label || user.role,
    permissions: role?.permissions || [],
  }
  saveUser(sessionUser)
  return sessionUser
}

/**
 * Получить курсы, доступные для роли пользователя
 * admin видит все курсы, остальные — только с их ролью в allowedRoles
 */
export function getCoursesForRole(roleId) {
  const courses = getAllCourses()
  if (isAdmin(roleId)) return courses

  return courses.filter((course) => course.allowedRoles.includes(roleId))
}

/**
 * Проверить, имеет ли пользователь доступ к курсу
 */
export function canAccessCourse(roleId, course) {
  if (!course) return false
  if (isAdmin(roleId)) return true
  return course.allowedRoles.includes(roleId)
}

/**
 * Проверить разрешение текущей роли
 */
export function roleHasPermission(roleId, permission) {
  return hasPermission(roleId, permission)
}

/** Может ли роль управлять админ-панелью */
export function canManageAdmin(roleId) {
  return hasPermission(roleId, PERMISSIONS.MANAGE_USERS)
}
