import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import PlatformHeaderActions from '../components/platform/PlatformHeaderActions'
import PlatformMobileHeader from '../components/platform/PlatformMobileHeader'
import AppInstallBanner from '../components/platform/AppInstallBanner'
import PlatformSidebar from '../components/platform/PlatformSidebar'
import PullToRefresh from '../components/platform/PullToRefresh'
import PlatformErrorBoundary from '../components/platform/PlatformErrorBoundary'
import PlatformSessionGate from '../components/platform/PlatformSessionGate'
import { PullToRefreshProvider } from '../context/PullToRefreshContext'
import { PlatformPageTitleProvider, usePlatformPageTitleContext } from '../context/PlatformPageTitleContext'
import { useAcademyData } from '../context/AcademyDataContext'
import { useProcurementRealtime } from '../hooks/useProcurementRealtime'
import { getPlatformSection } from '../platform/platformNav'
import { useSession } from '../context/SessionContext'
import { LOGIN_PATH } from '../router/authRoutes'
import { lockModalScroll, unlockModalScroll } from '../utils/modalScrollLock'
import './PlatformLayout.css'

function PlatformLayoutShell({ onLogout }) {
  const { user } = useSession()
  const { reload } = useAcademyData()
  const { pathname } = useLocation()
  const procurementRealtimeEnabled = useMemo(() => {
    if (!user) return false
    return (
      pathname.includes('/platform/procurement') ||
      pathname.includes('/platform/receiving')
    )
  }, [user, pathname])
  useProcurementRealtime(procurementRealtimeEnabled)
  const navigate = useNavigate()
  const titleContext = usePlatformPageTitleContext()
  const section = useMemo(() => getPlatformSection(pathname), [pathname])
  const pageTitle = titleContext?.override?.title || section.title || 'Shugyla Platform'
  const showMobileBack = titleContext?.override?.showBack === true
  const mobileBackFallback = titleContext?.override?.backFallback || '/platform'
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleMobileBack = useCallback(() => {
    const historyIdx = window.history.state?.idx
    if (typeof historyIdx === 'number' && historyIdx > 0) {
      navigate(-1)
      return
    }
    navigate(mobileBackFallback)
  }, [navigate, mobileBackFallback])

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!drawerOpen) return undefined

    lockModalScroll()

    function handleEscape(event) {
      if (event.key === 'Escape') setDrawerOpen(false)
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      unlockModalScroll()
    }
  }, [drawerOpen])

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
        <div className="platform-layout__main">
          <AppInstallBanner />

          {/* Header stays outside PullToRefresh so it never translates/unmounts. */}
          <PlatformMobileHeader
            title={pageTitle}
            onMenuOpen={() => setDrawerOpen(true)}
            showBack={showMobileBack}
            onBack={handleMobileBack}
          />

          <header className="platform-layout__topbar">
            <div className="platform-layout__topbar-info">
              <h1 className="platform-layout__title">{section.title}</h1>
              <p className="platform-layout__desc">{section.description}</p>
            </div>
            <PlatformHeaderActions user={user} onLogout={onLogout} bellVariant="desktop" />
          </header>

          <PullToRefresh disabled={drawerOpen} className="platform-layout__refresh">
            <div className="platform-layout__content">
              <PlatformErrorBoundary onLogout={onLogout}>
                <Outlet />
              </PlatformErrorBoundary>
            </div>
          </PullToRefresh>
        </div>
      </PullToRefreshProvider>
    </div>
  )
}

/** Оболочка Shugyla Platform — sidebar + контент */
function PlatformLayoutRoot() {
  const { logout } = useSession()
  const navigate = useNavigate()

  const handleLogout = useCallback(async () => {
    await logout()
    navigate(LOGIN_PATH, { replace: true })
  }, [logout, navigate])

  return (
    <PlatformErrorBoundary onLogout={handleLogout}>
      <PlatformLayoutShell onLogout={handleLogout} />
    </PlatformErrorBoundary>
  )
}

export default function PlatformLayout() {
  return (
    <PlatformPageTitleProvider>
      <PlatformSessionGate>
        <PlatformLayoutRoot />
      </PlatformSessionGate>
    </PlatformPageTitleProvider>
  )
}
