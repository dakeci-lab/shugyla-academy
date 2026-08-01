import { supabase } from '../lib/supabaseClient'

function sortByOrderThenName(a, b) {
  const orderA = Number(a.sortOrder ?? 100)
  const orderB = Number(b.sortOrder ?? 100)
  if (orderA !== orderB) return orderA - orderB
  return String(a.name || '').localeCompare(String(b.name || ''), 'ru')
}

function mapGroup(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    sortOrder: row.sort_order ?? 100,
    isActive: row.is_active !== false,
    archivedAt: row.archived_at ?? null,
  }
}

function mapPosition(row) {
  const group = Array.isArray(row.position_groups)
    ? row.position_groups[0]
    : row.position_groups
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    description: row.description ?? null,
    sortOrder: row.sort_order ?? 100,
    isActive: row.is_active !== false,
    archivedAt: row.archived_at ?? null,
    groupName: group?.name ?? null,
    groupSortOrder: group?.sort_order ?? null,
    groupIsActive: group ? group.is_active !== false : null,
  }
}

export async function loadPositionCatalog() {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }

  const [groupsRes, positionsRes] = await Promise.all([
    supabase
      .from('position_groups')
      .select('id, name, description, sort_order, is_active, archived_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('positions')
      .select(
        'id, group_id, name, description, sort_order, is_active, archived_at, position_groups(id, name, sort_order, is_active)',
      )
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])

  if (groupsRes.error) throw groupsRes.error
  if (positionsRes.error) throw positionsRes.error

  const groups = (groupsRes.data || []).map(mapGroup).sort(sortByOrderThenName)
  const positions = (positionsRes.data || []).map(mapPosition).sort((a, b) => {
    const groupCmp = Number(a.groupSortOrder ?? 100) - Number(b.groupSortOrder ?? 100)
    if (groupCmp !== 0) return groupCmp
    return sortByOrderThenName(a, b)
  })

  return { groups, positions }
}
