/**
 * Защита от одноимённых ролей.
 *
 * Две роли с одинаковым названием — это не косметическая проблема. Админ не
 * может отличить их в выпадающем списке, назначает сотруднику не ту, и человек
 * теряет доступ. Раньше интерфейс при совпадении молча добавлял к коду суффикс
 * `_2` и создавал вторую роль; теперь совпадение — ошибка с внятным текстом.
 *
 * Сравнение по нормализованному названию: регистр и крайние пробелы не считаются
 * различием, потому что для человека «Финансист» и «финансист » — одно и то же.
 */

export function normalizeRoleName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Роль с таким же названием (кроме указанной) или null. */
export function findRoleByName(roles = [], name, { exceptRoleId = null } = {}) {
  const target = normalizeRoleName(name)
  if (!target) return null
  return (
    roles.find(
      (role) => role?.id !== exceptRoleId && normalizeRoleName(role?.name) === target
    ) || null
  )
}

export function describeRoleNameConflict(role) {
  if (!role) return ''
  if (role.isActive === false) {
    return `Роль «${role.name}» уже существует, но отключена. Включите её вместо создания новой.`
  }
  return `Роль «${role.name}» уже существует. Выберите другое название.`
}

/** Ошибка уникальности из базы → тот же понятный текст. */
export function isRoleNameUniqueViolation(error) {
  const raw = [error?.message, error?.details, error?.code].filter(Boolean).join(' ')
  return /roles_name_norm_uidx/i.test(raw)
}
