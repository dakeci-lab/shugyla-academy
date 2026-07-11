import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { signOut } from '../services/authService'
import PlatformUserMenu from '../components/platform/PlatformUserMenu'
import PlatformMobileHeader from '../components/platform/PlatformMobileHeader'
import AppInstallBanner from '../components/platform/AppInstallBanner'
import PlatformSidebar from '../components/platform/PlatformSidebar'
import PullToRefresh from '../components/platform/PullToRefresh'
import { PullToRefreshProvider } from '../context/PullToRefreshContext'
import { useAcademyData } from '../context/AcademyDataContext'
import { useProcurementRealtime } from '../hooks/useProcurementRealtime'
import { getPlatformSection } from '../platform/platformNav'
import { useSession } from '../context/SessionContext'
import './PlatformLayout.css'

/** Оболочка Shugyla Platform — sidebar + контент */
export default function PlatformLayout() {
  const { user, logout } = useSession()
  const { reload } = useAcademyData()
  useProcurementRealtime(Boolean(user))
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

  async function handleLogout() {
    try {
      await signOut()
    } catch (err) {
      console.warn('Supabase signOut failed:', err)
    }
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

      <PullToRefreshProvider onGlobalRefresh={reload}>
        <PullToRefresh disabled={drawerOpen} className="platform-layout__main">
          <AppInstallBanner />

          <PlatformMobileHeader
            user={user}
            onMenuOpen={() => setDrawerOpen(true)}
            onLogout={handleLogout}
          />

          <header className="platform-layout__topbar">
            <div className="platform-layout__topbar-info">
              <h1 className="platform-layout__title">{section.title}</h1>
              <p className="platform-layout__desc">{section.description}</p>
            </div>
            <PlatformUserMenu user={user} onLogout={handleLogout} />
          </header>

          <div className="platform-layout__mobile-head">
            <h1 className="platform-layout__title">{section.title}</h1>
            <p className="platform-layout__desc">{section.description}</p>
          </div>

          <div className="platform-layout__content">
            <Outlet />
          </div>
        </PullToRefresh>
      </PullToRefreshProvider>
    </div>
  )
}
