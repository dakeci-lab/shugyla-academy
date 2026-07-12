import { isCloudMode } from '../lib/dataMode'
import { getUser, saveUser } from '../utils/storage'
import { getUserPermissionCodes } from '../config/permissions'
import {
  getPermissionCodesForRole,
  getPermissionCodesForRoleCode,
  resolveRoleIdByCode as resolveRoleIdByCodeFromList,
} from '../utils/rbacData'
import * as localAdapter from './rbacLocalAdapter'
import * as supabaseAdapter from './rbacSupabaseAdapter'

function getAdapter() {
  return isCloudMode() ? supabaseAdapter : localAdapter
}

let cache = null
let loadPromise = null

export function getRbacCache() {
  return cache
}

function refreshStoredUserPermissions() {
  const user = getUser()
  if (!user) return
  const permissionCodes = [...getUserPermissionCodes({ ...user, permissionCodes: [], permissionSlugs: [] })]
  saveUser({
    ...user,
    permissionCodes,
    permissionSlugs: permissionCodes,
  })
}

export async function ensureRbacLoaded(force = false) {
  if (cache && !force) return cache
  if (loadPromise && !force) return loadPromise

  loadPromise = getAdapter()
    .loadRbacSnapshot()
    .then((snapshot) => {
      cache = snapshot
      loadPromise = null
      return snapshot
    })
    .catch((err) => {
      loadPromise = null
      throw err
    })

  return loadPromise
}

export async function reloadRbac() {
  cache = null
  const snapshot = await ensureRbacLoaded(true)
  refreshStoredUserPermissions()
  return snapshot
}

export async function getRoles() {
  const snapshot = await ensureRbacLoaded()
  return snapshot.roles
}

export async function getActiveRolesForAssignment() {
  return getAdapter().getActiveRolesForAssignment()
}

export async function getRolesForEmployeeForm(currentRoleCode, currentRoleId) {
  if (getAdapter().getRolesForEmployeeForm) {
    return getAdapter().getRolesForEmployeeForm(currentRoleCode, currentRoleId)
  }
  const snapshot = await ensureRbacLoaded()
  return snapshot.roles.filter((role) => role.isActive)
}

export async function getPermissions() {
  const snapshot = await ensureRbacLoaded()
  return snapshot.permissions
}

export async function getRolePermissionIds(roleId) {
  const snapshot = await ensureRbacLoaded()
  return snapshot.rolePermissions
    .filter((rp) => rp.roleId === roleId)
    .map((rp) => rp.permissionId)
}

export function getPermissionCodesForUserRole(user) {
  if (!cache) return []
  const roleCode = user?.role
  const roleId = user?.roleId

  if (roleId) {
    return getPermissionCodesForRole(roleId, cache.roles, cache.rolePermissions, cache.permissions)
  }
  if (roleCode) {
    return getPermissionCodesForRoleCode(
      roleCode,
      cache.roles,
      cache.rolePermissions,
      cache.permissions
    )
  }
  return []
}

/** @deprecated */
export function getPermissionSlugsForUserRole(user) {
  return getPermissionCodesForUserRole(user)
}

export async function saveRolePermissions(roleId, permissionIds) {
  const snapshot = await getAdapter().saveRolePermissions(roleId, permissionIds)
  cache = snapshot
  refreshStoredUserPermissions()
  return snapshot
}

export async function upsertRole(roleId, payload) {
  const adapter = getAdapter()
  if (adapter.upsertRole) {
    const snapshot = await adapter.upsertRole(roleId, payload)
    cache = snapshot
    refreshStoredUserPermissions()
    return snapshot
  }
  await adapter.updateRole(roleId, payload)
  await adapter.saveRolePermissions(roleId, payload.permissionIds || [])
  return reloadRbac()
}

export async function updateRole(roleId, patch) {
  const role = await getAdapter().updateRole(roleId, patch)
  await reloadRbac()
  return role
}

export async function createRole(payload) {
  const role = await getAdapter().createRole(payload)
  await reloadRbac()
  return role
}

export async function duplicateRole(sourceRoleId, payload) {
  const role = await getAdapter().duplicateRole(sourceRoleId, payload)
  await reloadRbac()
  return role
}

export async function setRoleActive(roleId, isActive) {
  const snapshot = await getAdapter().setRoleActive(roleId, isActive)
  cache = snapshot
  refreshStoredUserPermissions()
  return snapshot
}

export async function syncUserRoleId(userId, roleCode) {
  return getAdapter().syncUserRoleId(userId, roleCode)
}

export async function resolveRoleIdByCode(roleCode) {
  const snapshot = await ensureRbacLoaded()
  return resolveRoleIdByCodeFromList(snapshot.roles, roleCode)
}

/** @deprecated */
export async function resolveRoleIdBySlug(roleSlug) {
  return resolveRoleIdByCode(roleSlug)
}

export function invalidateRbacCache() {
  cache = null
  loadPromise = null
}

export function getRoleById(roleId) {
  return cache?.roles?.find((role) => role.id === roleId) || null
}

export function getRoleByCode(code) {
  return cache?.roles?.find((role) => role.code === code) || null
}

export const RBAC_MIGRATION_MESSAGE =
  'Таблицы системы ролей ещё не созданы в Supabase. Необходимо применить миграцию RBAC.'
