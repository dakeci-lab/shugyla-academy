import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import PlatformHeaderActions from '../components/platform/PlatformHeaderActions'
import PlatformMobileHeader from '../components/platform/PlatformMobileHeader'
import AppInstallBanner from '../components/platform/AppInstallBanner'
import PlatformDesktopNav, {
  PlatformDesktopLogo,
} from '../components/platform/PlatformDesktopNav'
import PlatformSidebar from '../components/platform/PlatformSidebar'
import PullToRefresh from '../components/platform/PullToRefresh'
import PlatformErrorBoundary from '../components/platform/PlatformErrorBoundary'
import PlatformSessionGate from '../components/platform/PlatformSessionGate'
import { PullToRefreshProvider } from '../context/PullToRefreshContext'
import { PlatformPageTitleProvider, usePlatformPageTitleContext } from '../context/PlatformPageTitleContext'
import { useAcademyData } from '../context/AcademyDataContext'
import { useProcurementRealtime } from '../hooks/useProcurementRealtime'
import useMediaQuery from '../hooks/useMediaQuery'
import useBlockMobileBrowserBack from '../hooks/useBlockMobileBrowserBack'
import useMobileDrawerEdgeSwipe from '../hooks/useMobileDrawerEdgeSwipe'
import { getPlatformSection } from '../platform/platformNav'
import { useSession } from '../context/SessionContext'
import { LOGIN_PATH } from '../router/authRoutes'
import { lockModalScroll, unlockModalScroll } from '../utils/modalScrollLock'
import './PlatformLayout.css'

const MOBILE_LAYOUT_QUERY = '(max-width: 900px)'

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
  const isMobile = useMediaQuery(MOBILE_LAYOUT_QUERY)
  const layoutRef = useRef(null)
  const sidebarRef = useRef(null)
  const overlayRef = useRef(null)
  const edgeRef = useRef(null)
  /** Не закрывать drawer на pathname, пока откатываем системный Back */
  const suppressPathCloseRef = useRef(false)

  const handleBlockedBrowserBack = useCallback(() => {
    suppressPathCloseRef.current = true
    // Системный Back поглощён: toggle drawer вместо ухода со страницы.
    setDrawerOpen((open) => !open)
    window.setTimeout(() => {
      suppressPathCloseRef.current = false
    }, 400)
  }, [])

  const { allowNextBack } = useBlockMobileBrowserBack({
    enabled: isMobile,
    onBlockedBack: handleBlockedBrowserBack,
  })

  const { isDragging: drawerDragging } = useMobileDrawerEdgeSwipe({
    enabled: isMobile,
    isOpen: drawerOpen,
    onOpenChange: setDrawerOpen,
    layoutRef,
    sidebarRef,
    overlayRef,
    edgeRef,
  })

  const handleMobileBack = useCallback(() => {
    const historyIdx = window.history.state?.idx
    if (typeof historyIdx === 'number' && historyIdx > 0) {
      allowNextBack()
      navigate(-1)
      return
    }
    navigate(mobileBackFallback)
  }, [allowNextBack, navigate, mobileBackFallback])

  useEffect(() => {
    if (suppressPathCloseRef.current) return
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

  const layoutClassName = [
    'platform-layout',
    drawerOpen ? 'platform-layout--drawer-open' : '',
    drawerDragging ? 'platform-layout--drawer-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={layoutRef} className={layoutClassName}>
      {(drawerOpen || isMobile) && (
        <button
          ref={overlayRef}
          type="button"
          className={`platform-layout__overlay${drawerOpen ? ' platform-layout__overlay--visible' : ''}`}
          onClick={closeDrawer}
          aria-label="Закрыть меню"
          tabIndex={drawerOpen ? 0 : -1}
        />
      )}

      {isMobile && (
        <div
          ref={edgeRef}
          className="platform-layout__edge-swipe"
          aria-hidden="true"
          style={{
            pointerEvents: drawerOpen || drawerDragging ? 'none' : 'auto',
          }}
        />
      )}

      {isMobile && (
        <PlatformSidebar
          isOpen={drawerOpen}
          onNavigate={closeDrawer}
          panelRef={sidebarRef}
        />
      )}

      <PullToRefreshProvider onGlobalRefresh={reload}>
        <div className="platform-layout__main">
          <AppInstallBanner />

          {/* Header stays outside PullToRefresh so it never translates/unmounts. */}
          <PlatformMobileHeader
            title={pageTitle}
            onMenuOpen={() => setDrawerOpen(true)}
            showBack={showMobileBack}
            onBack={handleMobileBack}
            actions={titleContext?.override?.actions ?? null}
          />

          {!isMobile && (
            <header className="platform-layout__topbar">
              <PlatformDesktopLogo />
              <PlatformDesktopNav />
              <PlatformHeaderActions user={user} onLogout={onLogout} bellVariant="desktop" />
            </header>
          )}

          <PullToRefresh disabled={drawerOpen || drawerDragging} className="platform-layout__refresh">
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

/** Оболочка Shugyla Platform — desktop top nav / mobile drawer + контент */
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
