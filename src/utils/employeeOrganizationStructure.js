/**
 * Pure organizational grouping for employees.
 * Contract: Group → Position → employees (sorted by FIO).
 * No React, no I/O, no UI state — reusable by list (5A) and schedule (5B).
 */

export const UNASSIGNED_GROUP_ID = '__unassigned_position_group__'
export const UNASSIGNED_POSITION_ID = '__unassigned_position__'
export const UNASSIGNED_GROUP_NAME = 'Без должности'
export const UNASSIGNED_POSITION_NAME = 'Должность не назначена'
export const UNASSIGNED_GROUP_SORT_ORDER = 1_000_000

const LOCALE = 'ru'

function toSortNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), LOCALE, {
    sensitivity: 'base',
    numeric: true,
  })
}

function employeeFullName(employee) {
  if (!employee) return ''
  const composed = `${employee.firstName || ''} ${employee.lastName || ''}`.trim()
  return composed || employee.name || employee.fullName || employee.full_name || ''
}

/**
 * Resolve organizational metadata from an employee record.
 * Pure — does not invent DB rows.
 */
export function resolveEmployeeOrganizationMeta(employee) {
  const positionId = employee?.positionId ?? employee?.position_id ?? null
  const hasPosition = Boolean(positionId)

  if (!hasPosition) {
    return {
      groupId: UNASSIGNED_GROUP_ID,
      groupName: UNASSIGNED_GROUP_NAME,
      groupSortOrder: UNASSIGNED_GROUP_SORT_ORDER,
      isGroupActive: true,
      isUnassignedGroup: true,
      positionId: UNASSIGNED_POSITION_ID,
      positionName: UNASSIGNED_POSITION_NAME,
      positionSortOrder: UNASSIGNED_GROUP_SORT_ORDER,
      isPositionActive: true,
      isUnassignedPosition: true,
      legacyPositionLabel: employee?.position || employee?.positionName || '',
    }
  }

  const groupId =
    employee.positionGroupId ?? employee.position_group_id ?? `position-group-missing:${positionId}`
  const groupName =
    employee.positionGroupName ??
    employee.position_group_name ??
    'Без группы'
  const groupSortOrder = toSortNumber(
    employee.positionGroupSortOrder ?? employee.position_group_sort_order,
    100,
  )
  const isGroupActive =
    employee.positionGroupIsActive ?? employee.position_group_is_active
  const positionName =
    employee.positionName ??
    employee.position_name ??
    employee.position ??
    'Должность'
  const positionSortOrder = toSortNumber(
    employee.positionSortOrder ?? employee.position_sort_order,
    100,
  )
  const isPositionActive = employee.positionIsActive ?? employee.position_is_active

  return {
    groupId: String(groupId),
    groupName: String(groupName),
    groupSortOrder,
    isGroupActive: isGroupActive !== false,
    isUnassignedGroup: false,
    positionId: String(positionId),
    positionName: String(positionName),
    positionSortOrder,
    isPositionActive: isPositionActive !== false,
    isUnassignedPosition: false,
    legacyPositionLabel: '',
  }
}

function sortEmployeesByName(employees) {
  return [...employees].sort((a, b) => {
    const byName = compareText(employeeFullName(a), employeeFullName(b))
    if (byName !== 0) return byName
    return compareText(String(a?.id ?? ''), String(b?.id ?? ''))
  })
}

/**
 * Group employees by position structure.
 *
 * @param {Array} employees
 * @param {{ includeEmptySections?: boolean }} [options]
 * @returns {Array<{
 *   groupId: string,
 *   groupName: string,
 *   groupSortOrder: number,
 *   isGroupActive: boolean,
 *   isUnassignedGroup: boolean,
 *   employeeCount: number,
 *   positionCount: number,
 *   positions: Array<{
 *     positionId: string,
 *     positionName: string,
 *     positionSortOrder: number,
 *     isPositionActive: boolean,
 *     isUnassignedPosition: boolean,
 *     employeeCount: number,
 *     employees: Array
 *   }>
 * }>}
 */
export function groupEmployeesByPositionStructure(employees, options = {}) {
  const { includeEmptySections = false } = options
  const source = Array.isArray(employees) ? employees : []
  const groupsMap = new Map()

  for (const employee of source) {
    const meta = resolveEmployeeOrganizationMeta(employee)
    let group = groupsMap.get(meta.groupId)
    if (!group) {
      group = {
        groupId: meta.groupId,
        groupName: meta.groupName,
        groupSortOrder: meta.groupSortOrder,
        isGroupActive: meta.isGroupActive,
        isUnassignedGroup: meta.isUnassignedGroup,
        positionsMap: new Map(),
      }
      groupsMap.set(meta.groupId, group)
    }

    let position = group.positionsMap.get(meta.positionId)
    if (!position) {
      position = {
        positionId: meta.positionId,
        positionName: meta.positionName,
        positionSortOrder: meta.positionSortOrder,
        isPositionActive: meta.isPositionActive,
        isUnassignedPosition: meta.isUnassignedPosition,
        employees: [],
      }
      group.positionsMap.set(meta.positionId, position)
    }
    position.employees.push(employee)
  }

  const groups = [...groupsMap.values()]
    .map((group) => {
      const positions = [...group.positionsMap.values()]
        .map((position) => {
          const sortedEmployees = sortEmployeesByName(position.employees)
          return {
            positionId: position.positionId,
            positionName: position.positionName,
            positionSortOrder: position.positionSortOrder,
            isPositionActive: position.isPositionActive,
            isUnassignedPosition: position.isUnassignedPosition,
            employeeCount: sortedEmployees.length,
            employees: sortedEmployees,
          }
        })
        .filter((position) => includeEmptySections || position.employeeCount > 0)
        .sort((a, b) => {
          const orderCmp = a.positionSortOrder - b.positionSortOrder
          if (orderCmp !== 0) return orderCmp
          return compareText(a.positionName, b.positionName)
        })

      const employeeCount = positions.reduce((sum, row) => sum + row.employeeCount, 0)
      return {
        groupId: group.groupId,
        groupName: group.groupName,
        groupSortOrder: group.groupSortOrder,
        isGroupActive: group.isGroupActive,
        isUnassignedGroup: group.isUnassignedGroup,
        employeeCount,
        positionCount: positions.length,
        positions,
      }
    })
    .filter((group) => includeEmptySections || group.employeeCount > 0)
    .sort((a, b) => {
      const orderCmp = a.groupSortOrder - b.groupSortOrder
      if (orderCmp !== 0) return orderCmp
      return compareText(a.groupName, b.groupName)
    })

  return groups
}

/** Aggregate counts for the current (already filtered) structure. */
export function summarizeEmployeeOrganization(groups) {
  const list = Array.isArray(groups) ? groups : []
  let employeeCount = 0
  let positionCount = 0
  for (const group of list) {
    employeeCount += Number(group.employeeCount) || 0
    positionCount += Number(group.positionCount) || 0
  }
  return {
    employeeCount,
    groupCount: list.length,
    positionCount,
  }
}

/** Flatten grouped structure back to employees in org order (stable). */
export function flattenEmployeeOrganization(groups) {
  const result = []
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const position of group.positions || []) {
      for (const employee of position.employees || []) {
        result.push(employee)
      }
    }
  }
  return result
}
