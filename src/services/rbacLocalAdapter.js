import { buildDefaultRbacSnapshot } from '../utils/rbacData'
import { slugifyRoleCode } from '../config/permissionCatalog'
import { getRoleLabel } from '../data/roles'
import { getAllEmployeesLocal } from '../utils/employeeData'

const STORAGE_KEY = 'shugyla_rbac_snapshot_v2'

function readSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeSnapshot(snapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
}

function attachEmployeeCounts(snapshot) {
  const employees = getAllEmployeesLocal()
  const counts = new Map()
  employees.forEach((emp) => {
    const roleId = emp.roleId || snapshot.roles.find((r) => r.code === emp.role)?.id
    if (!roleId) return
    counts.set(roleId, (counts.get(roleId) || 0) + 1)
  })
  return {
    ...snapshot,
    roles: snapshot.roles.map((role) => ({
      ...role,
      employeeCount: counts.get(role.id) || 0,
    })),
  }
}

function ensureEmployeeRoles(snapshot) {
  const knownCodes = new Set(snapshot.roles.map((role) => role.code))
  const extraRoles = []

  getAllEmployeesLocal().forEach((employee) => {
    const code = employee.role?.trim()
    if (!code || knownCodes.has(code)) return
    knownCodes.add(code)
    extraRoles.push({
      id: `role-${code}`,
      code,
      slug: code,
      name: getRoleLabel(code) !== code ? getRoleLabel(code) : code.replace(/_/g, ' '),
      description: '',
      isSystem: false,
      isActive: true,
      employeeCount: 0,
    })
  })

  if (extraRoles.length === 0) return snapshot
  return { ...snapshot, roles: [...snapshot.roles, ...extraRoles] }
}

function ensureSnapshot() {
  const existing = readSnapshot()
  if (existing?.roles?.length && existing?.permissions?.length) {
    return attachEmployeeCounts(ensureEmployeeRoles(existing))
  }
  const seeded = ensureEmployeeRoles(buildDefaultRbacSnapshot())
  writeSnapshot(seeded)
  return attachEmployeeCounts(seeded)
}

export async function loadRbacSnapshot() {
  return ensureSnapshot()
}

export async function saveRolePermissions(roleId, permissionIds) {
  const snapshot = ensureSnapshot()
  const nextRolePermissions = snapshot.rolePermissions.filter((rp) => rp.roleId !== roleId)
  permissionIds.forEach((permissionId) => {
    nextRolePermissions.push({ roleId, permissionId })
  })
  const next = { ...snapshot, rolePermissions: nextRolePermissions }
  writeSnapshot(next)
  return attachEmployeeCounts(next)
}

export async function updateRole(roleId, patch) {
  const snapshot = ensureSnapshot()
  const roles = snapshot.roles.map((role) =>
    role.id === roleId
      ? {
          ...role,
          ...(patch.name != null ? { name: patch.name } : {}),
          ...(patch.description != null ? { description: patch.description } : {}),
          ...(patch.code != null ? { code: patch.code, slug: patch.code } : {}),
          ...(patch.isActive != null ? { isActive: patch.isActive } : {}),
        }
      : role
  )
  const next = { ...snapshot, roles }
  writeSnapshot(next)
  return roles.find((role) => role.id === roleId)
}

export async function createRole({ code, name, description = '', permissionIds = [] }) {
  const snapshot = ensureSnapshot()
  if (snapshot.roles.some((role) => role.code === code)) {
    throw new Error('Роль с таким кодом уже существует')
  }
  const id = `role-${code}-${Date.now()}`
  const role = {
    id,
    code,
    slug: code,
    name,
    description,
    isSystem: false,
    isActive: true,
    employeeCount: 0,
  }
  const rolePermissions = [...snapshot.rolePermissions]
  permissionIds.forEach((permissionId) => {
    rolePermissions.push({ roleId: id, permissionId })
  })
  const next = { ...snapshot, roles: [...snapshot.roles, role], rolePermissions }
  writeSnapshot(next)
  return role
}

export async function duplicateRole(sourceRoleId, { code, name }) {
  const snapshot = ensureSnapshot()
  const source = snapshot.roles.find((role) => role.id === sourceRoleId)
  if (!source) throw new Error('Исходная роль не найдена')
  const permissionIds = snapshot.rolePermissions
    .filter((rp) => rp.roleId === sourceRoleId)
    .map((rp) => rp.permissionId)
  return createRole({
    code: code || `${source.code}_copy`,
    name: name || `${source.name} (копия)`,
    description: source.description,
    permissionIds,
  })
}

export async function setRoleActive(roleId, isActive) {
  const snapshot = ensureSnapshot()
  const role = snapshot.roles.find((item) => item.id === roleId)
  if (!role) throw new Error('Роль не найдена')
  if (role.isSystem && !isActive) throw new Error('Системную роль нельзя деактивировать')
  return updateRole(roleId, { isActive })
}

export async function syncUserRoleId(userId, roleCode) {
  void userId
  void roleCode
  return null
}

export async function resolveRoleIdByCode(roleCode) {
  const snapshot = ensureSnapshot()
  return snapshot.roles.find((role) => role.code === roleCode)?.id || null
}

export async function getActiveRolesForAssignment() {
  const snapshot = await loadRbacSnapshot()
  return snapshot.roles
    .filter((role) => role.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function getRolesForEmployeeForm(currentRoleCode, currentRoleId) {
  const snapshot = await loadRbacSnapshot()
  const active = snapshot.roles
    .filter((role) => role.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const current =
    snapshot.roles.find((role) => role.id === currentRoleId) ||
    snapshot.roles.find((role) => role.code === currentRoleCode)

  if (current && !current.isActive && !active.some((role) => role.id === current.id)) {
    return [...active, current].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  return active
}

export async function upsertRole(roleId, { name, description = '', isActive = true, permissionIds = [] }) {
  await updateRole(roleId, { name, description, isActive })
  return saveRolePermissions(roleId, permissionIds)
}

export function resetRbacLocalSnapshot() {
  localStorage.removeItem(STORAGE_KEY)
}

export function suggestRoleCode(name) {
  return slugifyRoleCode(name)
}
