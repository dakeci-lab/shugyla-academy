import { useEffect, useId, useRef, useState } from 'react'

export default function PositionActionsMenu({
  position,
  canManage,
  onEdit,
  onArchive,
  onRestore,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuId = useId()
  const restoreBlocked = !position?.isActive && position?.groupIsActive === false

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

  if (!canManage || !position) return null

  return (
    <div className="team-role-menu" ref={rootRef}>
      <button
        type="button"
        className="team-role-menu__trigger"
        aria-label={`Действия для должности «${position.name}»`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((prev) => !prev)}
      >
        ⋯
      </button>
      {open ? (
        <div className="team-role-menu__dropdown" role="menu" id={menuId}>
          {position.isActive ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="team-role-menu__item"
                onClick={() => {
                  setOpen(false)
                  onEdit?.(position)
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
                  onArchive?.(position)
                }}
              >
                Архивировать
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                className="team-role-menu__item"
                disabled={restoreBlocked}
                title={
                  restoreBlocked ? 'Сначала восстановите группу должности' : undefined
                }
                onClick={() => {
                  if (restoreBlocked) return
                  setOpen(false)
                  onRestore?.(position)
                }}
              >
                Восстановить
              </button>
              {restoreBlocked ? (
                <div className="team-role-menu__hint" role="note">
                  Сначала восстановите группу должности
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
