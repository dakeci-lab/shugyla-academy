import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { getRouterBasename } from './router/basename'
import { LanguageProvider } from './context/LanguageContext'
import { SessionProvider } from './context/SessionContext'
import { ToastProvider } from './context/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import InternalPlatformProviders from './components/platform/InternalPlatformProviders'
import PlatformRoute from './components/platform/PlatformRoute'
import PlatformNotFound from './components/platform/PlatformNotFound'
import { LOGIN_PATH } from './router/authRoutes'
import { ROUTE_KEYS } from './config/permissions'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import CorporateHome from './pages/CorporateHome'
import AuthLoadingScreen from './components/AuthLoadingScreen'
import AppLaunchGate from './components/AppLaunchGate'
import { getHostSurface, HOST_SURFACE } from './router/hostSurface'
import { CareersRetiredRedirect, PlatformExternalRedirect } from './router/SurfaceRedirect'

/**
 * Internal platform pages — lazy so public /apply does not download HR UI.
 */
const PlatformLayout = lazy(() => import('./layouts/PlatformLayout'))
const Profile = lazy(() => import('./pages/Profile'))
const PlatformIndex = lazy(() => import('./pages/platform/PlatformIndex'))
const PlatformSettings = lazy(() => import('./pages/platform/PlatformSettings'))
const PlatformSettingsRoles = lazy(() => import('./pages/platform/PlatformSettingsRoles'))
const PlatformSettingsPaymentAccounts = lazy(
  () => import('./pages/platform/PlatformSettingsPaymentAccounts')
)
const PlatformEmployees = lazy(() => import('./pages/platform/PlatformEmployees'))
const SupplierFinancePage = lazy(
  () => import('./pages/platform/supplier-finance/SupplierFinancePage')
)
const SalesPage = lazy(() => import('./pages/platform/sales/SalesPage'))
const ProcurementPage = lazy(() => import('./pages/platform/procurement/ProcurementPage'))
const AnalyticsProcurementPage = lazy(
  () => import('./pages/platform/procurement/AnalyticsProcurementPage')
)
const PurchaseDetailPage = lazy(
  () => import('./pages/platform/procurement/PurchaseDetailPage')
)
const OrdersPage = lazy(() => import('./pages/platform/orders/OrdersPage'))
const ReceivingDocumentRedirect = lazy(
  () => import('./pages/platform/receiving/ReceivingDocumentRedirect')
)
/**
 * Маршрутизация Shugyla Platform
 */

function PlatformSuspense({ children }) {
  return <Suspense fallback={<AuthLoadingScreen />}>{children}</Suspense>
}

/**
 * /platform/suppliers and /platform/suppliers/:id → supplier-finance's
 * «Поставщики» tab (2026-09-19 merge). Preserves location.state so
 * SupplierPaymentsPanel's "open payment terms" deep link
 * (openEditId/focusSection/returnTo) still opens the edit modal there.
 */
/** Old /platform/procurement/:id order links → the «Заказы» section. */
function ProcurementOrderRedirect() {
  const { id } = useParams()
  return <Navigate to={`/platform/orders/${id}`} replace />
}

function SupplierDirectoryRedirect() {
  const location = useLocation()
  const { id } = useParams()
  const state = id ? { ...(location.state || {}), openEditId: id } : location.state
  return <Navigate to="/platform/supplier-finance?tab=settlements" replace state={state} />
}

export default function App() {
  const surface = getHostSurface()
  const internalEnabled =
    surface === HOST_SURFACE.PLATFORM || surface === HOST_SURFACE.COMBINED

  function internalElement(element) {
    if (internalEnabled) return element
    if (surface === HOST_SURFACE.CAREERS) {
      return <CareersRetiredRedirect />
    }
    return <PlatformExternalRedirect />
  }

  return (
    <LanguageProvider>
      <SessionProvider>
        <BrowserRouter basename={getRouterBasename()}>
          <ToastProvider>
            <AppLaunchGate />
            <Routes>
              {/* Публичные маршруты — без PlatformData / Permission / NotificationInbox */}
              <Route
                path="/"
                element={
                  surface === HOST_SURFACE.CAREERS ? (
                    <CareersRetiredRedirect />
                  ) : surface === HOST_SURFACE.CORPORATE ? (
                    <CorporateHome />
                  ) : (
                    <Navigate to={LOGIN_PATH} replace />
                  )
                }
              />
              {/* Сайт вакансий закрыт (stage 12): всё ведёт на корпоративный сайт. */}
              <Route path="/vacancies" element={<CareersRetiredRedirect />} />
              <Route path="/vacancies/:slug" element={<CareersRetiredRedirect />} />
              <Route path="/apply" element={<CareersRetiredRedirect />} />
              <Route path="/apply/:slug" element={<CareersRetiredRedirect />} />
              <Route path="/login" element={internalElement(<Login />)} />
              <Route path="/forgot-password" element={internalElement(<ForgotPassword />)} />
              <Route path="/reset-password" element={internalElement(<ResetPassword />)} />

              {/* Shugyla Platform — providers mounted once for all /platform/* */}
              <Route
                path="/platform"
                element={internalElement(
                  <ProtectedRoute>
                    <InternalPlatformProviders>
                      <PlatformSuspense>
                        <PlatformLayout />
                      </PlatformSuspense>
                    </InternalPlatformProviders>
                  </ProtectedRoute>
                )}
              >
                <Route
                  index
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.HOME}>
                      <PlatformIndex />
                    </PlatformRoute>
                  }
                />

                {/*
                  Personnel modules are hidden (stage 12, docs/platform/stage-12-hide-personnel-modules.md):
                  time tracker, schedule, payroll, HR/recruiting, employee profiles and the
                  notification inbox. Old links land on the entry page. Code and data are kept.
                */}
                <Route path="notifications" element={<Navigate to="/platform" replace />} />
                <Route path="time-tracker" element={<Navigate to="/platform" replace />} />
                <Route path="employees" element={<Navigate to="/platform/settings/users" replace />} />
                <Route
                  path="employees/list"
                  element={<Navigate to="/platform/settings/users" replace />}
                />
                <Route path="employees/*" element={<Navigate to="/platform" replace />} />
                <Route path="hr/*" element={<Navigate to="/platform" replace />} />

                <Route
                  path="procurement"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.PROCUREMENT}>
                      <ProcurementPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="procurement/analytics"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.PROCUREMENT}>
                      <AnalyticsProcurementPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="procurement/analytics/:id"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.PROCUREMENT}>
                      <PurchaseDetailPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="procurement/:id"
                  element={<ProcurementOrderRedirect />}
                />
                <Route
                  path="orders"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.ORDERS}>
                      <OrdersPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="orders/:id"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.ORDERS}>
                      <PurchaseDetailPage />
                    </PlatformRoute>
                  }
                />
                {/* «Приёмка» merged into «Заказы» (2026-09-20): old links keep working. */}
                <Route path="receiving" element={<Navigate to="/platform/orders" replace />} />
                <Route path="receiving/:id" element={<ReceivingDocumentRedirect />} />
                {/* 2026-09-19: the standalone directory was merged into
                    supplier-finance's «Поставщики» tab (formerly
                    «Взаиморасчёты» — see UmagSettlementsPanel). These two
                    routes are kept only as redirects for old links/bookmarks
                    and for SupplierPaymentsPanel's "open payment terms"
                    deep link, which relies on location.state surviving the
                    hop (openEditId/focusSection/returnTo). */}
                <Route
                  path="suppliers"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SUPPLIERS}>
                      <SupplierDirectoryRedirect />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="suppliers/:id"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SUPPLIERS}>
                      <SupplierDirectoryRedirect />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="sales"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SALES}>
                      <SalesPage />
                    </PlatformRoute>
                  }
                />
                {/* Both old standalone pages are replaced by supplier-finance's tabs (same
                    UmagSettlementsPanel/SupplierPaymentsPanel, now tabbed together). Neither
                    was in platformNav.js or linked from anywhere in the app — kept as
                    redirects only so a stale bookmark/tab still lands somewhere. */}
                <Route
                  path="settlements"
                  element={<Navigate to="/platform/supplier-finance?tab=settlements" replace />}
                />
                <Route
                  path="supplier-payments"
                  element={<Navigate to="/platform/supplier-finance?tab=payments" replace />}
                />
                <Route
                  path="supplier-finance"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SUPPLIER_FINANCE}>
                      <SupplierFinancePage />
                    </PlatformRoute>
                  }
                />
                <Route path="academy/*" element={<Navigate to="/platform" replace />} />
                <Route path="courses/:id" element={<Navigate to="/platform" replace />} />

                <Route path="settings" element={<PlatformSettings />} />
                <Route
                  path="settings/users"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.EMPLOYEES_LIST}>
                      <PlatformEmployees />
                    </PlatformRoute>
                  }
                />
                <Route path="settings/general" element={<Navigate to="/platform" replace />} />
                <Route
                  path="settings/roles"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SETTINGS_ROLES}>
                      <PlatformSettingsRoles />
                    </PlatformRoute>
                  }
                />
                <Route path="settings/notifications" element={<Navigate to="/platform" replace />} />
                <Route
                  path="settings/payment-accounts"
                  element={<Navigate to="/platform/finance/payment-accounts" replace />}
                />
                <Route
                  path="finance/payment-accounts"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SETTINGS_PAYMENT_ACCOUNTS}>
                      <PlatformSettingsPaymentAccounts />
                    </PlatformRoute>
                  }
                />
                <Route path="profile" element={<Profile />} />
                <Route path="*" element={<PlatformNotFound />} />
              </Route>

              {/* Редиректы со старых маршрутов */}
              <Route path="/profile" element={<Navigate to="/platform/profile" replace />} />
              <Route path="/dashboard" element={<Navigate to="/platform" replace />} />
              <Route path="/academy" element={<Navigate to="/platform" replace />} />
              <Route path="/academy/*" element={<Navigate to="/platform" replace />} />
              <Route path="/admin" element={<Navigate to="/platform" replace />} />
              <Route
                path="/admin/employees"
                element={<Navigate to="/platform/employees/list" replace />}
              />
              <Route path="/admin/courses" element={<Navigate to="/platform" replace />} />
              <Route path="/admin/routes" element={<Navigate to="/platform" replace />} />
              <Route
                path="/admin/hiring"
                element={<Navigate to="/platform/hr/vacancies" replace />}
              />
              <Route
                path="/hiring"
                element={<Navigate to="/platform/hr/vacancies" replace />}
              />
              <Route
                path="/recruitment"
                element={<Navigate to="/platform/hr/vacancies" replace />}
              />
              <Route
                path="/employees/hiring"
                element={<Navigate to="/platform/hr/vacancies" replace />}
              />
              <Route
                path="/employees/recruitment"
                element={<Navigate to="/platform/hr/vacancies" replace />}
              />
              <Route path="/admin/tests" element={<Navigate to="/platform" replace />} />
              <Route path="/admin/attestation" element={<Navigate to="/platform" replace />} />
              <Route path="/admin/progress" element={<Navigate to="/platform" replace />} />
              <Route path="/courses/:id" element={<Navigate to="/platform" replace />} />
              <Route path="/course/:id" element={<Navigate to="/platform" replace />} />

              <Route
                path="*"
                element={
                  surface === HOST_SURFACE.CAREERS ? (
                    <CareersRetiredRedirect />
                  ) : surface === HOST_SURFACE.CORPORATE ? (
                    <CorporateHome />
                  ) : (
                    <Navigate to={LOGIN_PATH} replace />
                  )
                }
              />
            </Routes>
          </ToastProvider>
        </BrowserRouter>
      </SessionProvider>
    </LanguageProvider>
  )
}
