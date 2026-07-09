import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import PlatformSidebar from '../components/platform/PlatformSidebar'
import PlatformMobileHeader from '../components/platform/PlatformMobileHeader'
import AppInstallBanner from '../components/platform/AppInstallBanner'
import { getPlatformSection } from '../platform/platformNav'
import { useSession } from '../context/SessionContext'
import './PlatformLayout.css'

/** Оболочка Shugyla Platform — sidebar + контент */
export default function PlatformLayout() {
  const { user, logout } = useSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const section = getPlatformSection(pathname)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!drawerOpen) {
      document.body.style.overflow = ''
      return undefined
    }
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function closeDrawer() {
    setDrawerOpen(false)
  }

  return (
    <div className={`platform-layout ${drawerOpen ? 'platform-layout--drawer-open' : ''}`}>
      {drawerOpen && (
        <button
          type="button"
          className="platform-layout__overlay"
          onClick={closeDrawer}
          aria-label="Закрыть меню"
        />
      )}

      <PlatformSidebar
        isOpen={drawerOpen}
        onClose={closeDrawer}
        onNavigate={closeDrawer}
      />

      <div className="platform-layout__main">
        <AppInstallBanner />

        <PlatformMobileHeader
          user={user}
          onMenuOpen={() => setDrawerOpen(true)}
        />

        <header className="platform-layout__topbar">
          <div className="platform-layout__topbar-info">
            <h1 className="platform-layout__title">{section.title}</h1>
            <p className="platform-layout__desc">{section.description}</p>
          </div>
          <div className="platform-layout__topbar-user">
            <Link to="/platform/profile" className="platform-layout__profile-link">
              Профиль
            </Link>
            <span className="platform-layout__user-name">{user?.name}</span>
            <button type="button" className="btn btn--outline btn--sm" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </header>

        <div className="platform-layout__mobile-head">
          <h1 className="platform-layout__title">{section.title}</h1>
          <p className="platform-layout__desc">{section.description}</p>
        </div>

        <div className="platform-layout__content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
