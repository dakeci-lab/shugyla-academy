/**
 * Session HR position fields — never derived from access role labels.
 * Missing position stays null/empty here; UI display helpers own empty-state copy.
 */

function trimOrNull(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

/**
 * @param {object|null|undefined} employee
 * @returns {{
 *   positionId: string|number|null,
 *   position: string,
 *   positionName: string|null,
 *   positionGroupId: string|number|null,
 *   positionGroupName: string|null,
 * }}
 */
export function resolveSessionPosition(employee) {
  if (!employee) {
    return {
      positionId: null,
      position: '',
      positionName: null,
      positionGroupId: null,
      positionGroupName: null,
    }
  }

  const rawId = employee.positionId ?? employee.position_id ?? null
  const positionId = rawId == null || rawId === '' ? null : rawId

  const structured = trimOrNull(employee.positionName ?? employee.position_name)
  const legacy = trimOrNull(employee.position)
  const positionName = structured || legacy || null

  return {
    positionId,
    position: positionName || '',
    positionName,
    positionGroupId: employee.positionGroupId ?? employee.position_group_id ?? null,
    positionGroupName: employee.positionGroupName ?? employee.position_group_name ?? null,
  }
}
