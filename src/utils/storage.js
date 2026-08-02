/**
 * Session user persistence in localStorage.
 * Extra fields on stored payloads are ignored by callers.
 */

const STORAGE_KEYS = {
  USER: 'shugyla_user',
}

/** Сохранить текущего пользователя */
export function saveUser(user) {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user))
}

/** Получить текущего пользователя */
export function getUser() {
  const data = localStorage.getItem(STORAGE_KEYS.USER)
  return data ? JSON.parse(data) : null
}

/** Удалить данные пользователя (выход) */
export function clearUser() {
  localStorage.removeItem(STORAGE_KEYS.USER)
}
