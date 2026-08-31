import {
  getPermissionActionLabel,
  groupModulePermissionsIntoRows,
  parsePermissionAction,
} from '../../../config/permissionCatalog'

const ACTION_ORDER_PRIORITY = ['view', 'create', 'edit', 'delete', 'manage']

function sortActionsUsed(actions) {
  return [...actions].sort((a, b) => {
    const ai = ACTION_ORDER_PRIORITY.indexOf(a)
    const bi = ACTION_ORDER_PRIORITY.indexOf(b)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

/**
 * Permission editor for one role — module tabs across the top (Закупки/
 * Поставщики/...), a CRUD-style table below for whichever module is active.
 * Replaces the old vertical stack of collapsible module cards with a flat
 * checkbox per permission: same underlying catalog (groupPermissionsForMatrix),
 * just presented as one row per resource with one column per action, so
 * related permissions (view/create/edit/delete) read as a single line
 * instead of four separately-worded checkboxes.
 */
export default function PermissionMatrixPanel({
  groups,
  activeModuleId,
  onModuleChange,
  selectedIds,
  onTogglePermission,
  disabled,
}) {
  const activeGroup = groups.find((group) => group.module === activeModuleId) || groups[0]

  if (!activeGroup) {
    return <div className="team-mgmt__empty"><p>Разрешения не загрузились</p></div>
  }

  const selectedSet = new Set(selectedIds)
  const rows = groupModulePermissionsIntoRows(activeGroup)

  const actionsEncountered = []
  rows.forEach((row) => {
    row.items.forEach((permission) => {
      const action = parsePermissionAction(permission.code)
      if (!actionsEncountered.includes(action)) actionsEncountered.push(action)
    })
  })
  const actionsUsed = sortActionsUsed(actionsEncountered)

  return (
    <>
      <div className="team-matrix-tabs" role="tablist" aria-label="Модуль">
        {groups.map((group) => {
          const total = group.items.length
          const checked = group.items.filter((item) => selectedSet.has(item.id)).length
          return (
            <button
              key={group.module}
              type="button"
              className="team-matrix-tab"
              role="tab"
              aria-selected={group.module === activeGroup.module}
              onClick={() => onModuleChange(group.module)}
            >
              {group.label}
              <span className="team-matrix-tab__count">{checked}/{total}</span>
            </button>
          )
        })}
      </div>

      <div className="team-matrix-wrap">
        <table className="team-matrix">
          <thead>
            <tr>
              <th>Раздел</th>
              {actionsUsed.map((action) => (
                <th key={action}>{getPermissionActionLabel(action)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const byAction = new Map(
                row.items.map((permission) => [parsePermissionAction(permission.code), permission]),
              )
              return (
                <tr key={row.resourceKey || row.label}>
                  <td className="team-matrix__row-name">{row.label}</td>
                  {actionsUsed.map((action) => {
                    const permission = byAction.get(action)
                    if (!permission) {
                      return (
                        <td key={action} className="team-matrix__dash-cell">
                          <span aria-hidden="true">—</span>
                        </td>
                      )
                    }
                    return (
                      <td key={action}>
                        <input
                          type="checkbox"
                          className="team-matrix__checkbox"
                          checked={selectedSet.has(permission.id)}
                          disabled={disabled}
                          onChange={() => onTogglePermission(permission.id)}
                          aria-label={`${row.label} — ${getPermissionActionLabel(action)}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
