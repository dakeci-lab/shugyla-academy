/**
 * Stage 3A admin API for position groups / positions.
 * Uses SECURITY DEFINER RPCs only — no direct PostgREST writes, no UI/toasts.
 */

import { supabase } from '../lib/supabaseClient'
import { reloadPositionCatalog } from './positionCatalogService'

const ERROR_MESSAGES = {
  position_structure_forbidden: 'Недостаточно прав для управления организационной структурой',
  position_group_not_found: 'Группа должностей не найдена',
  position_group_inactive: 'Группа должностей неактивна',
  position_group_duplicate_name: 'Группа с таким названием уже существует',
  position_group_has_active_positions: 'Нельзя архивировать группу с активными должностями',
  position_not_found: 'Должность не найдена',
  position_inactive: 'Должность неактивна. Сначала восстановите её',
  position_duplicate_name: 'Должность с таким названием уже существует',
  position_has_active_employees: 'Нельзя архивировать должность с действующими сотрудниками',
  position_target_group_inactive: 'Нельзя перенести должность в архивную группу',
  position_parent_group_inactive: 'Нельзя восстановить должность в архивной группе',
  invalid_position_group_id: 'Некорректный идентификатор группы',
  invalid_position_id: 'Некорректный идентификатор должности',
  invalid_position_name: 'Некорректное название должности',
  invalid_group_name: 'Некорректное название группы',
  invalid_sort_order: 'Некорректный порядок отображения',
  invalid_reorder_payload: 'Некорректные данные для изменения порядка',
  duplicate_reorder_id: 'В списке порядка есть дубликаты',
  reorder_items_missing: 'Список порядка должен включать все активные элементы',
  reorder_foreign_item: 'В списке порядка есть элемент из другой группы',
}

function extractErrorCode(error) {
  const message = String(error?.message || '')
  const details = String(error?.details || '')
  const hint = String(error?.hint || '')
  const combined = `${message}\n${details}\n${hint}`

  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (combined.includes(code)) return code
  }

  const match = combined.match(/\b(position_[a-z0-9_]+|invalid_[a-z0-9_]+|duplicate_reorder_id|reorder_[a-z0-9_]+)\b/)
  return match?.[1] || null
}

export function normalizePositionStructureError(error) {
  const code = extractErrorCode(error)
  const message = (code && ERROR_MESSAGES[code]) || 'Не удалось выполнить операцию с организационной структурой'
  const normalized = new Error(message)
  normalized.code = code || 'position_structure_error'
  normalized.cause = error
  if (error?.details != null) normalized.details = error.details
  return normalized
}

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  return supabase
}

function mapGroup(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    sortOrder: row.sort_order ?? 100,
    isActive: row.is_active !== false,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

function mapPosition(row) {
  if (!row) return null
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    description: row.description ?? null,
    sortOrder: row.sort_order ?? 100,
    isActive: row.is_active !== false,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    groupName: row.group_name ?? null,
    groupSortOrder: row.group_sort_order ?? null,
    groupIsActive: row.group_is_active == null ? null : row.group_is_active !== false,
  }
}

async function callRpc(fnName, args = {}) {
  const client = requireClient()
  const { data, error } = await client.rpc(fnName, args)
  if (error) throw normalizePositionStructureError(error)
  return data
}

async function afterMutation(result) {
  await reloadPositionCatalog().catch(() => {
    // Cache reload is best-effort; next explicit refresh will recover.
  })
  return result
}

export async function loadPositionStructure({ includeArchived = true } = {}) {
  const client = requireClient()
  const [groupsRes, positionsRes] = await Promise.all([
    client
      .from('position_groups')
      .select('id, name, description, sort_order, is_active, archived_at, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    client
      .from('positions')
      .select(
        'id, group_id, name, description, sort_order, is_active, archived_at, created_at, updated_at, position_groups(id, name, sort_order, is_active)',
      )
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])

  if (groupsRes.error) throw normalizePositionStructureError(groupsRes.error)
  if (positionsRes.error) throw normalizePositionStructureError(positionsRes.error)

  let groups = (groupsRes.data || []).map(mapGroup)
  let positions = (positionsRes.data || []).map((row) => {
    const group = Array.isArray(row.position_groups) ? row.position_groups[0] : row.position_groups
    return mapPosition({
      ...row,
      group_name: group?.name ?? null,
      group_sort_order: group?.sort_order ?? null,
      group_is_active: group ? group.is_active !== false : null,
    })
  })

  if (!includeArchived) {
    groups = groups.filter((g) => g.isActive)
    positions = positions.filter((p) => p.isActive && p.groupIsActive !== false)
  }

  return { groups, positions }
}

export async function refreshPositionStructure(options) {
  await reloadPositionCatalog()
  return loadPositionStructure(options)
}

export async function createPositionGroup({ name, description = null, sortOrder = null } = {}) {
  const data = await callRpc('position_structure_create_group', {
    p_name: name,
    p_description: description,
    p_sort_order: sortOrder,
  })
  return afterMutation(mapGroup(data))
}

export async function updatePositionGroup({
  groupId,
  name,
  description = null,
  sortOrder,
} = {}) {
  const data = await callRpc('position_structure_update_group', {
    p_group_id: groupId,
    p_name: name,
    p_description: description,
    p_sort_order: sortOrder,
  })
  return afterMutation(mapGroup(data))
}

export async function archivePositionGroup(groupId) {
  const data = await callRpc('position_structure_set_group_active', {
    p_group_id: groupId,
    p_is_active: false,
  })
  return afterMutation(mapGroup(data))
}

export async function restorePositionGroup(groupId) {
  const data = await callRpc('position_structure_set_group_active', {
    p_group_id: groupId,
    p_is_active: true,
  })
  return afterMutation(mapGroup(data))
}

export async function reorderPositionGroups(groupIds) {
  const data = await callRpc('position_structure_reorder_groups', {
    p_group_ids: groupIds,
  })
  const rows = Array.isArray(data) ? data.map(mapGroup) : []
  return afterMutation(rows)
}

export async function createPosition({
  groupId,
  name,
  description = null,
  sortOrder = null,
} = {}) {
  const data = await callRpc('position_structure_create_position', {
    p_group_id: groupId,
    p_name: name,
    p_description: description,
    p_sort_order: sortOrder,
  })
  return afterMutation(mapPosition(data))
}

export async function updatePosition({
  positionId,
  groupId,
  name,
  description = null,
  sortOrder,
} = {}) {
  const data = await callRpc('position_structure_update_position', {
    p_position_id: positionId,
    p_group_id: groupId,
    p_name: name,
    p_description: description,
    p_sort_order: sortOrder,
  })
  return afterMutation(mapPosition(data))
}

export async function archivePosition(positionId) {
  const data = await callRpc('position_structure_set_position_active', {
    p_position_id: positionId,
    p_is_active: false,
  })
  return afterMutation(mapPosition(data))
}

export async function restorePosition(positionId) {
  const data = await callRpc('position_structure_set_position_active', {
    p_position_id: positionId,
    p_is_active: true,
  })
  return afterMutation(mapPosition(data))
}

export async function reorderPositions(groupId, positionIds) {
  const data = await callRpc('position_structure_reorder_positions', {
    p_group_id: groupId,
    p_position_ids: positionIds,
  })
  const rows = Array.isArray(data) ? data.map(mapPosition) : []
  return afterMutation(rows)
}
