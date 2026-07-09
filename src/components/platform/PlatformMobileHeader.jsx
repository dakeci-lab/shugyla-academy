import { Link } from 'react-router-dom'
import './PlatformMobileHeader.css'

/** Компактный header для mobile/PWA */
export default function PlatformMobileHeader({ user, onMenuOpen }) {
  const shortName = user?.name?.split(' ')[0] || 'Профиль'

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

      <Link to="/platform/profile" className="platform-mobile-header__profile">
        {shortName}
      </Link>
    </header>
  )
}
