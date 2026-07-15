import PlatformHeaderActions from './PlatformHeaderActions'
import './PlatformMobileHeader.css'

/** Компактный header для mobile/PWA — название текущей страницы по центру */
export default function PlatformMobileHeader({ title, user, onMenuOpen, onLogout }) {
  const pageTitle = title || 'Shugyla Platform'

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

      <h1 className="platform-mobile-header__title" title={pageTitle}>
        {pageTitle}
      </h1>

      <div className="platform-mobile-header__actions">
        <PlatformHeaderActions user={user} onLogout={onLogout} compact bellVariant="mobile" />
      </div>
    </header>
  )
}
