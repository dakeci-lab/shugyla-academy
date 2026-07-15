import { useNavigate } from 'react-router-dom'
import EmployeeAvatar from '../EmployeeAvatar'
import { getRoleDisplayName } from '../../config/permissions'
import { PencilIcon } from '../icons/PlatformIcons'
import './PlatformSidebar.css'

/** Верхний блок профиля в мобильном drawer */
export default function PlatformSidebarMobileProfile({ user, onNavigate }) {
  const navigate = useNavigate()
  const roleLabel = user?.position || getRoleDisplayName(user)

  function openProfile() {
    onNavigate?.()
    navigate('/platform/profile')
  }

  return (
    <button
      type="button"
      className="platform-sidebar__profile-card"
      onClick={openProfile}
      aria-label="Открыть профиль"
    >
      <EmployeeAvatar
        name={user?.name}
        avatarUrl={user?.avatarUrl}
        size="sm"
        alt=""
      />

      <span className="platform-sidebar__profile-main">
        <span className="platform-sidebar__profile-name">{user?.name || 'Профиль'}</span>
        <span className="platform-sidebar__profile-role">{roleLabel}</span>
      </span>

      <span className="platform-sidebar__profile-edit" aria-hidden="true">
        <PencilIcon size={18} />
      </span>
    </button>
  )
}
