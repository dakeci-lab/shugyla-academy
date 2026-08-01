import { useEffect, useId, useRef, useState } from 'react'
import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import { isProtectedAdminRole } from './teamManagementUtils'

export default function RoleActionsMenu({
  role,
  onEdit,
  onDuplicate,
  onDeactivate,
  onRestore,
  align = 'right',
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    function handlePointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  if (!role) return null

  const protectedAdmin = isProtectedAdminRole(role)

  return (
    <div className={`team-role-menu${align === 'left' ? ' team-role-menu--left' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="team-role-menu__trigger"
        aria-label={`Действия для роли «${role.name}»`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((prev) => !prev)
        }}
      >
        ⋯
      </button>
      {open ? (
        <div className="team-role-menu__dropdown" role="menu" id={menuId}>
          <Can anyOf={[PERMISSION_CODES.ROLES_EDIT, PERMISSION_CODES.ROLES_ASSIGN_PERMISSIONS]}>
            <button
              type="button"
              role="menuitem"
              className="team-role-menu__item"
              onClick={(event) => {
                event.stopPropagation()
                setOpen(false)
                onEdit?.(role)
              }}
            >
              Редактировать
            </button>
          </Can>
          <Can permission={PERMISSION_CODES.ROLES_CREATE}>
            <button
              type="button"
              role="menuitem"
              className="team-role-menu__item"
              onClick={(event) => {
                event.stopPropagation()
                setOpen(false)
                onDuplicate?.(role)
              }}
            >
              Дублировать
            </button>
          </Can>
          {role.isActive && !protectedAdmin ? (
            <Can permission={PERMISSION_CODES.ROLES_EDIT}>
              <button
                type="button"
                role="menuitem"
                className="team-role-menu__item team-role-menu__item--danger"
                onClick={(event) => {
                  event.stopPropagation()
                  setOpen(false)
                  onDeactivate?.(role)
                }}
              >
                Деактивировать
              </button>
            </Can>
          ) : null}
          {!role.isActive ? (
            <Can permission={PERMISSION_CODES.ROLES_EDIT}>
              <button
                type="button"
                role="menuitem"
                className="team-role-menu__item"
                onClick={(event) => {
                  event.stopPropagation()
                  setOpen(false)
                  onRestore?.(role)
                }}
              >
                Восстановить
              </button>
            </Can>
          ) : null}
          {protectedAdmin && role.isActive ? (
            <div className="team-role-menu__hint" role="note">
              Системную роль администратора нельзя деактивировать
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
