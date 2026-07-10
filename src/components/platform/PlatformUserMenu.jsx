import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../../services/authService'
import { getRoleDisplayName } from '../../config/permissions'
import EmployeeAvatar from '../EmployeeAvatar'
import './PlatformUserMenu.css'

/** Блок пользователя с выпадающим меню */
export default function PlatformUserMenu({ user, onLogout, compact = false }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
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
  }, [])

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

  function toggleMenu() {
    setOpen((value) => !value)
  }

  const roleLabel = user?.position || getRoleDisplayName(user)

  return (
    <div className={`platform-user-menu ${compact ? 'platform-user-menu--compact' : ''}`} ref={rootRef}>
      {!compact && (
        <div className="platform-user-menu__info">
          <span className="platform-user-menu__name">{user?.name}</span>
          <span className="platform-user-menu__role">{roleLabel}</span>
        </div>
      )}

      <EmployeeAvatar
        name={user?.name}
        avatarUrl={user?.avatarUrl}
        size="xs"
        asButton
        onClick={toggleMenu}
        aria-expanded={open}
        aria-haspopup="menu"
        alt="Меню профиля"
      />

      {open && (
        <div className="platform-user-menu__dropdown" role="menu">
          <button type="button" className="platform-user-menu__item" role="menuitem" onClick={goProfile}>
            Профиль
          </button>
          <button type="button" className="platform-user-menu__item platform-user-menu__item--danger" role="menuitem" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      )}
    </div>
  )
}
