import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import PlatformHeaderActions from '../components/platform/PlatformHeaderActions'
import PlatformMobileHeader from '../components/platform/PlatformMobileHeader'
import AppInstallBanner from '../components/platform/AppInstallBanner'
import PlatformSidebar from '../components/platform/PlatformSidebar'
import PullToRefresh from '../components/platform/PullToRefresh'
import { PullToRefreshProvider } from '../context/PullToRefreshContext'
import { PlatformPageTitleProvider, usePlatformPageTitleContext } from '../context/PlatformPageTitleContext'
import { useAcademyData } from '../context/AcademyDataContext'
import { useProcurementRealtime } from '../hooks/useProcurementRealtime'
import { getPlatformSection } from '../platform/platformNav'
import { useSession } from '../context/SessionContext'
import { LOGIN_PATH } from '../router/authRoutes'
import './PlatformLayout.css'

function PlatformLayoutShell() {
  const { user, logout } = useSession()
  const { reload } = useAcademyData()
  useProcurementRealtime(Boolean(user))
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const titleContext = usePlatformPageTitleContext()
  const section = useMemo(() => getPlatformSection(pathname), [pathname])
  const pageTitle = titleContext?.override?.title || section.title || 'Shugyla Platform'
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

    function handleEscape(event) {
      if (event.key === 'Escape') setDrawerOpen(false)
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  async function handleLogout() {
    await logout()
    navigate(LOGIN_PATH)
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
        onNavigate={closeDrawer}
      />

      <PullToRefreshProvider onGlobalRefresh={reload}>
        <PullToRefresh disabled={drawerOpen} className="platform-layout__main">
          <AppInstallBanner />

          <PlatformMobileHeader
            title={pageTitle}
            onMenuOpen={() => setDrawerOpen(true)}
          />

          <header className="platform-layout__topbar">
            <div className="platform-layout__topbar-info">
              <h1 className="platform-layout__title">{section.title}</h1>
              <p className="platform-layout__desc">{section.description}</p>
            </div>
            <PlatformHeaderActions user={user} onLogout={handleLogout} bellVariant="desktop" />
          </header>

          <div className="platform-layout__content">
            <Outlet />
          </div>
        </PullToRefresh>
      </PullToRefreshProvider>
    </div>
  )
}

/** Оболочка Shugyla Platform — sidebar + контент */
export default function PlatformLayout() {
  return (
    <PlatformPageTitleProvider>
      <PlatformLayoutShell />
    </PlatformPageTitleProvider>
  )
}
