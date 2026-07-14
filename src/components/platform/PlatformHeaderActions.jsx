import PlatformUserMenu from './PlatformUserMenu'
import NotificationBell from './notifications/NotificationBell'

/** Действия шапки платформы: колокольчик + меню пользователя */
export default function PlatformHeaderActions({ user, onLogout, compact = false, bellVariant = 'desktop' }) {
  return (
    <div className={`platform-header-actions${compact ? ' platform-header-actions--compact' : ''}`}>
      <NotificationBell variant={bellVariant} />
      <PlatformUserMenu user={user} onLogout={onLogout} compact={compact} />
    </div>
  )
}
