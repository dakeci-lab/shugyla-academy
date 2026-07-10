import PlatformUserMenu from './PlatformUserMenu'
import './PlatformMobileHeader.css'

/** Компактный header для mobile/PWA */
export default function PlatformMobileHeader({ user, onMenuOpen, onLogout }) {
  return (
    <header className="platform-mobile-header">
      <button
        type="button"
        className="platform-mobile-header__burger"
        onClick={onMenuOpen}
        aria-label="Открыть меню"
      >
        <span />
        <span />
        <span />
      </button>

      <div className="platform-mobile-header__brand">
        <span className="platform-mobile-header__logo">S</span>
        <span className="platform-mobile-header__name">Shugyla Platform</span>
      </div>

      <PlatformUserMenu user={user} onLogout={onLogout} compact />
    </header>
  )
}
