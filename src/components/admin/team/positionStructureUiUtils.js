export const STRUCTURE_STATUS_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'archived', label: 'Архивные' },
]

export const NAME_MAX = 150
export const DESCRIPTION_MAX = 1000

export function sortGroups(groups = []) {
  return [...groups].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    const order = Number(a.sortOrder ?? 100) - Number(b.sortOrder ?? 100)
    if (order !== 0) return order
    return String(a.name || '').localeCompare(String(b.name || ''), 'ru')
  })
}

export function sortPositions(positions = []) {
  return [...positions].sort((a, b) => {
    const groupOrder = Number(a.groupSortOrder ?? 100) - Number(b.groupSortOrder ?? 100)
    if (groupOrder !== 0) return groupOrder
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    const order = Number(a.sortOrder ?? 100) - Number(b.sortOrder ?? 100)
    if (order !== 0) return order
    return String(a.name || '').localeCompare(String(b.name || ''), 'ru')
  })
}

export function countPositionsInGroup(groupId, positions = [], { activeOnly = false } = {}) {
  return positions.filter((position) => {
    if (position.groupId !== groupId) return false
    if (activeOnly && !position.isActive) return false
    return true
  }).length
}

export function positionsLabel(count) {
  const n = Number(count) || 0
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} должность`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} должности`
  return `${n} должностей`
}

export function filterGroups(groups = [], positions = [], { query = '', status = 'all' } = {}) {
  const normalized = query.trim().toLowerCase()
  return sortGroups(groups).filter((group) => {
    if (status === 'active' && !group.isActive) return false
    if (status === 'archived' && group.isActive) return false
    if (!normalized) return true
    const haystack = [group.name, group.description].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(normalized)
  })
}

export function filterPositions(
  positions = [],
  { query = '', status = 'all', groupId = 'all' } = {},
) {
  const normalized = query.trim().toLowerCase()
  return sortPositions(positions).filter((position) => {
    if (status === 'active' && !position.isActive) return false
    if (status === 'archived' && position.isActive) return false
    if (groupId !== 'all' && position.groupId !== groupId) return false
    if (!normalized) return true
    const haystack = [position.name, position.description, position.groupName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalized)
  })
}

export function groupPositionsByGroup(groups = [], positions = []) {
  const byGroup = new Map()
  groups.forEach((group) => {
    byGroup.set(group.id, {
      group,
      positions: [],
    })
  })

  sortPositions(positions).forEach((position) => {
    const bucket = byGroup.get(position.groupId)
    if (bucket) {
      bucket.positions.push(position)
    } else {
      const orphanKey = position.groupId || 'unknown'
      if (!byGroup.has(orphanKey)) {
        byGroup.set(orphanKey, {
          group: {
            id: orphanKey,
            name: position.groupName || 'Без группы',
            sortOrder: position.groupSortOrder ?? 9999,
            isActive: position.groupIsActive !== false,
          },
          positions: [],
        })
      }
      byGroup.get(orphanKey).positions.push(position)
    }
  })

  return [...byGroup.values()]
    .filter((section) => section.positions.length > 0)
    .sort((a, b) => {
      const order = Number(a.group.sortOrder ?? 100) - Number(b.group.sortOrder ?? 100)
      if (order !== 0) return order
      return String(a.group.name || '').localeCompare(String(b.group.name || ''), 'ru')
    })
}

export function validateName(value) {
  const name = String(value || '').trim()
  if (!name) return 'Укажите название'
  if (name.length > NAME_MAX) return `Максимум ${NAME_MAX} символов`
  return ''
}

export function validateDescription(value) {
  const description = String(value || '')
  if (description.trim().length > DESCRIPTION_MAX) {
    return `Максимум ${DESCRIPTION_MAX} символов`
  }
  return ''
}

export function moveIdInList(ids, id, direction) {
  const next = [...ids]
  const index = next.indexOf(id)
  if (index < 0) return next
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function idsEqual(a = [], b = []) {
  if (a.length !== b.length) return false
  return a.every((id, index) => id === b[index])
}

export function formatStructureError(error) {
  const code = error?.code
  const detail = error?.details
  const count = detail != null && String(detail).trim() !== '' ? String(detail).trim() : null

  if (code === 'position_group_has_active_positions') {
    return count
      ? `Сначала перенесите или архивируйте активные должности этой группы. Активных должностей: ${count}.`
      : 'Сначала перенесите или архивируйте активные должности этой группы.'
  }
  if (code === 'position_has_active_employees') {
    return count
      ? `Нельзя архивировать должность, пока она назначена действующим сотрудникам. Назначена: ${count}.`
      : 'Нельзя архивировать должность, пока она назначена действующим сотрудникам.'
  }
  if (code === 'position_parent_group_inactive') {
    return 'Сначала восстановите группу должности.'
  }
  return error?.message || 'Не удалось выполнить операцию'
}

export function canReorderGroups({ status, query, canManage }) {
  return Boolean(canManage) && status === 'active' && !String(query || '').trim()
}

export function canReorderPositionsInGroup({ status, query, groupFilter, canManage }) {
  return (
    Boolean(canManage) &&
    status === 'active' &&
    !String(query || '').trim() &&
    (groupFilter === 'all' || Boolean(groupFilter))
  )
}
