/** Локальные подписи для кодов ролей (roles.code не меняется) */
const ROLE_CODE_DISPLAY_OVERRIDES = {
  trainee: 'Стажёр',
}

/** Базовое отображаемое название роли без уточнений по дублям */
export function getRoleBaseDisplayName(role) {
  if (!role) return ''
  const code = role.code
  if (code && ROLE_CODE_DISPLAY_OVERRIDES[code]) {
    return ROLE_CODE_DISPLAY_OVERRIDES[code]
  }
  return role.name || code || ''
}

function countRolesWithSameBaseName(role, roles = []) {
  const base = getRoleBaseDisplayName(role)
  if (!base) return 0
  return roles.filter((item) => getRoleBaseDisplayName(item) === base).length
}

/**
 * Подпись роли для UI: русские названия и различие дублей по числу сотрудников.
 * Не используется при сохранении в academy_users.role.
 */
export function formatRoleDisplayLabel(role, roles = []) {
  if (!role) return ''
  const base = getRoleBaseDisplayName(role)
  if (countRolesWithSameBaseName(role, roles) <= 1) {
    return base
  }

  const count = Number(role.employeeCount) || 0
  if (count > 0) {
    return `${base} — используется сотрудниками (${count})`
  }
  return `${base} — без сотрудников`
}
