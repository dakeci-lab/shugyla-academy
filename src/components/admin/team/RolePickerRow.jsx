import { useEffect, useRef, useState } from 'react'
import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import { formatRoleDisplayLabel } from '../../../utils/roleDisplay'
import RoleActionsMenu from './RoleActionsMenu'
import { sortRolesForSidebar } from './teamManagementUtils'

/**
 * Replaces the old always-visible role list (RolesSidebar) with a single
 * dropdown — roles are a short, curated list (owner: «можно посчитать по
 * пальцам»), so a search/filter sidebar was more chrome than the list
 * needed. All roles stay reachable (including inactive ones, dimmed) so
 * nothing that RolesSidebar's «Неактивные» filter reached is now hidden.
 */
export default function RolePickerRow({
  roles,
  selectedRoleId,
  selectedRole,
  onSelect,
  onCreate,
  onEdit,
  onDuplicate,
  onDeactivate,
  onRestore,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const sorted = sortRolesForSidebar(roles)

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div className="team-role-picker-row">
      <div className={`team-role-select${open ? ' team-role-select--open' : ''}`} ref={rootRef}>
        <button
          type="button"
          className="team-role-select__control"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="team-role-select__label">
            {selectedRole ? formatRoleDisplayLabel(selectedRole, roles) : 'Выберите роль'}
          </span>
          <svg
            className="team-role-select__chevron"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {open ? (
          <div className="team-role-select__panel" role="listbox">
            {sorted.map((role) => (
              <div
                key={role.id}
                role="option"
                aria-selected={role.id === selectedRoleId}
                className={`team-role-select__option${role.isActive ? '' : ' team-role-select__option--inactive'}`}
                onClick={() => {
                  setOpen(false)
                  onSelect(role.id)
                }}
              >
                {formatRoleDisplayLabel(role, roles)}
                {!role.isActive ? <span className="team-role-select__badge">неактивна</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <Can anyOf={[PERMISSION_CODES.ROLES_CREATE, PERMISSION_CODES.ROLES_EDIT]}>
        <button type="button" className="btn btn--primary" onClick={onCreate}>
          + Создать роль
        </button>
      </Can>

      {selectedRole ? (
        <RoleActionsMenu
          role={selectedRole}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDeactivate={onDeactivate}
          onRestore={onRestore}
        />
      ) : null}
    </div>
  )
}
