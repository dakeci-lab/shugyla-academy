/** Инициалы для аватарки сотрудника */
export function getEmployeeInitials({ firstName, lastName, name, fullName } = {}) {
  const displayName = name || fullName || `${firstName || ''} ${lastName || ''}`.trim()
  if (!displayName) return '?'
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

export function resolveEmployeeDisplayName({ firstName, lastName, name, fullName } = {}) {
  return name || fullName || `${firstName || ''} ${lastName || ''}`.trim() || 'Сотрудник'
}

export function resolveAvatarUrl({ imageUrl, avatarUrl, photoUrl } = {}) {
  return imageUrl || avatarUrl || photoUrl || null
}
