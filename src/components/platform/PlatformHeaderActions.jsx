import PlatformUserMenu from './PlatformUserMenu'

/** Действия шапки платформы: меню пользователя (колокольчик убран: уведомления были только у тайм-трекера) */
export default function PlatformHeaderActions({
  user,
  onLogout,
  compact = false,
  showUserMenu = true,
}) {
  return (
    <div className={`platform-header-actions${compact ? ' platform-header-actions--compact' : ''}`}>
      {showUserMenu && (
        <PlatformUserMenu user={user} onLogout={onLogout} compact={compact} />
      )}
    </div>
  )
}
