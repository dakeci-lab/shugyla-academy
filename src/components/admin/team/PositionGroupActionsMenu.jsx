import { useEffect, useId, useRef, useState } from 'react'

export default function PositionGroupActionsMenu({
  group,
  canManage,
  onEdit,
  onArchive,
  onRestore,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    function onPointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!canManage || !group) return null

  return (
    <div className="team-role-menu" ref={rootRef}>
      <button
        type="button"
        className="team-role-menu__trigger"
        aria-label={`Действия для группы «${group.name}»`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((prev) => !prev)}
      >
        ⋯
      </button>
      {open ? (
        <div className="team-role-menu__dropdown" role="menu" id={menuId}>
          {group.isActive ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="team-role-menu__item"
                onClick={() => {
                  setOpen(false)
                  onEdit?.(group)
                }}
              >
                Редактировать
              </button>
              <button
                type="button"
                role="menuitem"
                className="team-role-menu__item team-role-menu__item--danger"
                onClick={() => {
                  setOpen(false)
                  onArchive?.(group)
                }}
              >
                Архивировать
              </button>
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="team-role-menu__item"
              onClick={() => {
                setOpen(false)
                onRestore?.(group)
              }}
            >
              Восстановить
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
