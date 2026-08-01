import type { SupabaseClient } from '@supabase/supabase-js'

export type PositionErrorCode =
  | 'invalid_position_id'
  | 'position_not_found'
  | 'position_inactive'
  | 'position_group_not_found'
  | 'position_group_inactive'
  | 'position_mapping_ambiguous'
  | 'position_unresolved'

export type PositionCatalogRow = {
  id: string
  name: string
  group_id: string
  sort_order: number
  is_active: boolean
  group_name: string | null
  group_sort_order: number | null
  group_is_active: boolean | null
}

export type StructuredPositionFields = {
  position_id: string | null
  position: string
  position_name: string | null
  position_group_id: string | null
  position_group_name: string | null
  position_sort_order: number | null
  position_group_sort_order: number | null
  position_is_active: boolean | null
  position_group_is_active: boolean | null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isPositionUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

export function normalizePositionName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function buildStructuredPosition(
  legacyPosition: string | null | undefined,
  catalog: PositionCatalogRow | null | undefined,
): StructuredPositionFields {
  const legacy = typeof legacyPosition === 'string' ? legacyPosition : ''
  if (catalog) {
    return {
      position_id: catalog.id,
      position: catalog.name || legacy,
      position_name: catalog.name,
      position_group_id: catalog.group_id,
      position_group_name: catalog.group_name,
      position_sort_order: catalog.sort_order,
      position_group_sort_order: catalog.group_sort_order,
      position_is_active: catalog.is_active,
      position_group_is_active: catalog.group_is_active,
    }
  }

  return {
    position_id: null,
    position: legacy,
    position_name: legacy || null,
    position_group_id: null,
    position_group_name: null,
    position_sort_order: null,
    position_group_sort_order: null,
    position_is_active: null,
    position_group_is_active: null,
  }
}

type PositionJoinRow = {
  id: string
  name: string
  group_id: string
  sort_order: number
  is_active: boolean
  position_groups?: {
    id: string
    name: string
    sort_order: number
    is_active: boolean
  } | null
}

function toCatalogRow(row: PositionJoinRow): PositionCatalogRow {
  const group = row.position_groups ?? null
  return {
    id: row.id,
    name: row.name,
    group_id: row.group_id,
    sort_order: row.sort_order,
    is_active: row.is_active !== false,
    group_name: group?.name ?? null,
    group_sort_order: group?.sort_order ?? null,
    group_is_active: group ? group.is_active !== false : null,
  }
}

/** Batch-load positions (+ groups) by ids. No N+1. */
export async function loadPositionCatalogByIds(
  serviceClient: SupabaseClient,
  positionIds: Array<string | null | undefined>,
): Promise<Map<string, PositionCatalogRow>> {
  const unique = [
    ...new Set(
      positionIds
        .filter((id): id is string => typeof id === 'string' && isPositionUuid(id))
        .map((id) => id.trim()),
    ),
  ]

  const map = new Map<string, PositionCatalogRow>()
  if (unique.length === 0) return map

  const { data, error } = await serviceClient
    .from('positions')
    .select('id, name, group_id, sort_order, is_active, position_groups(id, name, sort_order, is_active)')
    .in('id', unique)

  if (error) {
    console.error('position_catalog_batch_failed', { category: error.message })
    return map
  }

  for (const row of (data ?? []) as PositionJoinRow[]) {
    map.set(row.id, toCatalogRow(row))
  }
  return map
}

export type ResolvePositionResult =
  | { ok: true; position: PositionCatalogRow }
  | { ok: false; code: PositionErrorCode }

/** Resolve an explicit position for a new assignment (must be active + group active). */
export async function resolveActivePositionForAssignment(
  serviceClient: SupabaseClient,
  positionIdRaw: unknown,
): Promise<ResolvePositionResult> {
  if (!isPositionUuid(positionIdRaw)) {
    return { ok: false, code: 'invalid_position_id' }
  }
  const positionId = String(positionIdRaw).trim()

  const { data, error } = await serviceClient
    .from('positions')
    .select('id, name, group_id, sort_order, is_active, position_groups(id, name, sort_order, is_active)')
    .eq('id', positionId)
    .maybeSingle()

  if (error) {
    console.error('position_lookup_failed', { category: error.message })
    return { ok: false, code: 'position_not_found' }
  }
  if (!data?.id) {
    return { ok: false, code: 'position_not_found' }
  }

  const catalog = toCatalogRow(data as PositionJoinRow)
  if (!catalog.is_active) {
    return { ok: false, code: 'position_inactive' }
  }
  if (!catalog.group_id || catalog.group_is_active == null) {
    return { ok: false, code: 'position_group_not_found' }
  }
  if (catalog.group_is_active === false) {
    return { ok: false, code: 'position_group_inactive' }
  }

  return { ok: true, position: catalog }
}

export type RoleNameMappingResult =
  | { ok: true; position: PositionCatalogRow }
  | { ok: false; code: 'position_unresolved' | 'position_mapping_ambiguous' }

/**
 * Temporary create-path compatibility: map roles.name → exactly one active position.
 * Does not create positions. Does not use role_id as a permanent link.
 */
export async function resolvePositionByRoleName(
  serviceClient: SupabaseClient,
  roleName: unknown,
): Promise<RoleNameMappingResult> {
  const name = normalizePositionName(roleName)
  if (!name) {
    return { ok: false, code: 'position_unresolved' }
  }

  const { data, error } = await serviceClient
    .from('positions')
    .select('id, name, group_id, sort_order, is_active, position_groups(id, name, sort_order, is_active)')
    .eq('is_active', true)

  if (error) {
    console.error('position_role_name_lookup_failed', { category: error.message })
    return { ok: false, code: 'position_unresolved' }
  }

  const needle = name.toLowerCase()
  const matches = ((data ?? []) as PositionJoinRow[])
    .map(toCatalogRow)
    .filter(
      (row) =>
        row.is_active &&
        row.group_is_active !== false &&
        normalizePositionName(row.name).toLowerCase() === needle,
    )

  if (matches.length === 0) {
    return { ok: false, code: 'position_unresolved' }
  }
  if (matches.length > 1) {
    return { ok: false, code: 'position_mapping_ambiguous' }
  }
  return { ok: true, position: matches[0] }
}

export function extractPositionIdFromPayload(payload: Record<string, unknown>): unknown {
  if ('position_id' in payload) return payload.position_id
  if ('positionId' in payload) return payload.positionId
  return undefined
}
