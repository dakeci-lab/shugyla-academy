import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmployeeAvatar from '../EmployeeAvatar'
import './PlatformUserMenu.css'

/** Блок пользователя с выпадающим меню (desktop) или переходом в профиль (mobile) */
export default function PlatformUserMenu({ user, onLogout, compact = false }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (compact) return undefined

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [compact])

  async function handleLogout() {
    setOpen(false)
    if (onLogout) {
      await onLogout()
    }
  }

  function goProfile() {
    setOpen(false)
    navigate('/platform/profile')
  }

  function handleTriggerClick() {
    if (compact) {
      navigate('/platform/profile')
      return
    }
    setOpen((value) => !value)
  }

  const avatar = (
    <EmployeeAvatar
      name={user?.name}
      avatarUrl={user?.avatarUrl}
      size="xs"
      asButton={compact}
      onClick={compact ? handleTriggerClick : undefined}
      alt={compact ? 'Открыть профиль' : undefined}
    />
  )

  return (
    <div className={`platform-user-menu ${compact ? 'platform-user-menu--compact' : ''}`} ref={rootRef}>
      {compact ? (
        avatar
      ) : (
        <button
          type="button"
          className="platform-user-menu__trigger"
          onClick={handleTriggerClick}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Меню профиля"
        >
          {avatar}
          <span className="platform-user-menu__name">{user?.name}</span>
        </button>
      )}

      {!compact && open && (
        <div className="platform-user-menu__dropdown" role="menu">
          <button type="button" className="platform-user-menu__item" role="menuitem" onClick={goProfile}>
            Профиль
          </button>
          <button
            type="button"
            className="platform-user-menu__item platform-user-menu__item--danger"
            role="menuitem"
            onClick={handleLogout}
          >
            Выйти
          </button>
        </div>
      )}
    </div>
  )
}
