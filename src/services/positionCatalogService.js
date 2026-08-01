import { isCloudMode } from '../lib/dataMode'
import * as supabaseAdapter from './positionCatalogSupabaseAdapter'

let cache = null
let loadPromise = null

function sortByOrderThenName(a, b) {
  const orderA = Number(a.sortOrder ?? 100)
  const orderB = Number(b.sortOrder ?? 100)
  if (orderA !== orderB) return orderA - orderB
  return String(a.name || '').localeCompare(String(b.name || ''), 'ru')
}

export function getPositionCatalogCache() {
  return cache
}

export async function ensurePositionCatalogLoaded(force = false) {
  if (!isCloudMode()) {
    cache = cache || { groups: [], positions: [] }
    return cache
  }
  if (cache && !force) return cache
  if (loadPromise && !force) return loadPromise

  loadPromise = supabaseAdapter
    .loadPositionCatalog()
    .then((snapshot) => {
      cache = snapshot
      loadPromise = null
      return snapshot
    })
    .catch((error) => {
      loadPromise = null
      throw error
    })

  return loadPromise
}

export async function reloadPositionCatalog() {
  cache = null
  return ensurePositionCatalogLoaded(true)
}

export function getPositionById(positionId) {
  if (!positionId || !cache) return null
  return cache.positions.find((row) => row.id === positionId) || null
}

export function getPositionGroupById(groupId) {
  if (!groupId || !cache) return null
  return cache.groups.find((row) => row.id === groupId) || null
}

export function getFlatPositions({ includeArchived = true } = {}) {
  if (!cache) return []
  const rows = includeArchived
    ? cache.positions
    : cache.positions.filter((row) => row.isActive && row.groupIsActive !== false)
  return [...rows].sort((a, b) => {
    const groupCmp = Number(a.groupSortOrder ?? 100) - Number(b.groupSortOrder ?? 100)
    if (groupCmp !== 0) return groupCmp
    return sortByOrderThenName(a, b)
  })
}

export function getPositionsForGroup(groupId, { includeArchived = true } = {}) {
  return getFlatPositions({ includeArchived }).filter((row) => row.groupId === groupId)
}

export function buildPositionFieldsFromCatalog(positionId, legacyPosition = '') {
  const catalog = getPositionById(positionId)
  if (catalog) {
    return {
      positionId: catalog.id,
      positionName: catalog.name,
      position: catalog.name,
      positionGroupId: catalog.groupId,
      positionGroupName: catalog.groupName,
      positionSortOrder: catalog.sortOrder,
      positionGroupSortOrder: catalog.groupSortOrder,
      positionIsActive: catalog.isActive,
      positionGroupIsActive: catalog.groupIsActive,
    }
  }

  return {
    positionId: positionId || null,
    positionName: legacyPosition || null,
    position: legacyPosition || '',
    positionGroupId: null,
    positionGroupName: null,
    positionSortOrder: null,
    positionGroupSortOrder: null,
    positionIsActive: null,
    positionGroupIsActive: null,
  }
}
