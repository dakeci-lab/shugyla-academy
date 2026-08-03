import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { getRouterBasename } from './router/basename'
import { LanguageProvider } from './context/LanguageContext'
import { SessionProvider } from './context/SessionContext'
import { ToastProvider } from './context/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import InternalPlatformProviders from './components/platform/InternalPlatformProviders'
import PlatformRoute from './components/platform/PlatformRoute'
import PlatformNotFound from './components/platform/PlatformNotFound'
import HrPlatformRoute from './components/platform/HrPlatformRoute'
import { LOGIN_PATH } from './router/authRoutes'
import { ROUTE_KEYS } from './config/permissions'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VacanciesPage from './pages/VacanciesPage'
import VacancyDetailPage from './pages/VacancyDetailPage'
import ApplyPage from './pages/Apply'
import ApplyHubPage from './pages/ApplyHub'
import CareersPublicLayout from './layouts/CareersPublicLayout'
import AuthLoadingScreen from './components/AuthLoadingScreen'

/**
 * Internal platform pages — lazy so public /apply does not download HR UI.
 */
const PlatformLayout = lazy(() => import('./layouts/PlatformLayout'))
const Profile = lazy(() => import('./pages/Profile'))
const StandardsPage = lazy(() => import('./pages/Standards'))
const PlatformIndex = lazy(() => import('./pages/platform/PlatformIndex'))
const PlatformSettings = lazy(() => import('./pages/platform/PlatformSettings'))
const PlatformSettingsGeneral = lazy(() => import('./pages/platform/PlatformSettingsGeneral'))
const PlatformSettingsRoles = lazy(() => import('./pages/platform/PlatformSettingsRoles'))
const PlatformSettingsNotifications = lazy(
  () => import('./pages/platform/PlatformSettingsNotifications')
)
const PlatformNotificationsInbox = lazy(
  () => import('./pages/platform/PlatformNotificationsInbox')
)
const PlatformEmployeeDocuments = lazy(
  () => import('./pages/platform/PlatformEmployeeDocuments')
)
const PlatformEmployees = lazy(() => import('./pages/platform/PlatformEmployees'))
const PlatformEmployeesRedirect = lazy(
  () => import('./pages/platform/PlatformEmployeesRedirect')
)
const PlatformWorkSchedule = lazy(() => import('./pages/platform/PlatformWorkSchedule'))
const PlatformEmployeeSchedule = lazy(
  () => import('./pages/platform/PlatformEmployeeSchedule')
)
const PlatformEmployeeProfile = lazy(
  () => import('./pages/platform/PlatformEmployeeProfile')
)
const PlatformEmployeeRating = lazy(
  () => import('./pages/platform/PlatformEmployeeRating')
)
const PlatformPayroll = lazy(() => import('./pages/platform/PlatformPayroll'))
const PlatformPayrollRecord = lazy(() => import('./pages/platform/PlatformPayrollRecord'))
const PlatformTimeTracker = lazy(() => import('./pages/platform/PlatformTimeTracker'))
const PlatformHrVacancies = lazy(() => import('./pages/platform/PlatformHrVacancies'))
const PlatformHrCandidates = lazy(() => import('./pages/platform/PlatformHrCandidates'))
const PlatformStandardsManage = lazy(
  () => import('./pages/platform/PlatformStandardsManage')
)
const SuppliersPage = lazy(() =>
  import('./pages/platform/suppliers/SuppliersPage').then((m) => ({ default: m.default }))
)
const SupplierDetailPage = lazy(() =>
  import('./pages/platform/suppliers/SuppliersPage').then((m) => ({
    default: m.SupplierDetailPage,
  }))
)
const SettlementsPage = lazy(() => import('./pages/platform/settlements/SettlementsPage'))
const SupplierPaymentsPage = lazy(
  () => import('./pages/platform/supplier-payments/SupplierPaymentsPage')
)
const ProcurementPage = lazy(() => import('./pages/platform/procurement/ProcurementPage'))
const AnalyticsProcurementPage = lazy(
  () => import('./pages/platform/procurement/AnalyticsProcurementPage')
)
const PurchaseDetailPage = lazy(
  () => import('./pages/platform/procurement/PurchaseDetailPage')
)
const ReceivingPage = lazy(() => import('./pages/platform/receiving/ReceivingPage'))
const ReceivingDetailPage = lazy(
  () => import('./pages/platform/receiving/ReceivingDetailPage')
)
const PriceTagsPage = lazy(() => import('./pages/platform/price-tags/PriceTagsPage'))
const PriceCheckerPage = lazy(() => import('./pages/platform/products/PriceCheckerPage'))

/**
 * Маршрутизация Shugyla Platform
 */

function LegacyStandardRedirect() {
  const { slug } = useParams()
  return <Navigate to={`/platform/standards/${slug}`} replace />
}

function PlatformSuspense({ children }) {
  return <Suspense fallback={<AuthLoadingScreen />}>{children}</Suspense>
}

export default function App() {
  return (
    <LanguageProvider>
      <SessionProvider>
        <BrowserRouter basename={getRouterBasename()}>
          <ToastProvider>
            <Routes>
              {/* Публичные маршруты — без PlatformData / Permission / NotificationInbox */}
              <Route path="/" element={<Navigate to={LOGIN_PATH} replace />} />
              <Route element={<CareersPublicLayout />}>
                <Route path="/vacancies" element={<VacanciesPage />} />
                <Route path="/vacancies/:slug" element={<VacancyDetailPage />} />
                {/* Exact /apply before /apply/:slug so hub is never treated as a slug */}
                <Route path="/apply" element={<ApplyHubPage />} />
                <Route path="/apply/:slug" element={<ApplyPage />} />
              </Route>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Shugyla Platform — providers mounted once for all /platform/* */}
              <Route
                path="/platform"
                element={
                  <ProtectedRoute>
                    <InternalPlatformProviders>
                      <PlatformSuspense>
                        <PlatformLayout />
                      </PlatformSuspense>
                    </InternalPlatformProviders>
                  </ProtectedRoute>
                }
              >
                <Route
                  index
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.HOME}>
                      <PlatformIndex />
                    </PlatformRoute>
                  }
                />

                <Route path="notifications" element={<PlatformNotificationsInbox />} />

                <Route path="employees" element={<PlatformEmployeesRedirect />} />
                <Route
                  path="employees/list"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.EMPLOYEES_LIST}>
                      <PlatformEmployees />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="employees/schedule"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.EMPLOYEES_SCHEDULE}>
                      <PlatformWorkSchedule />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="employees/rating"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.EMPLOYEES_RATING}>
                      <PlatformEmployeeRating />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="time-tracker"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.EMPLOYEES_RATING}>
                      <PlatformTimeTracker />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="employees/payroll"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.EMPLOYEES_PAYROLL}>
                      <PlatformPayroll />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="employees/payroll/records/:recordId"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.EMPLOYEES_PAYROLL}>
                      <PlatformPayrollRecord />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="employees/:employeeId/schedule"
                  element={<PlatformEmployeeSchedule />}
                />
                <Route
                  path="employees/:employeeId/documents"
                  element={<PlatformEmployeeDocuments />}
                />
                <Route path="employees/:employeeId" element={<PlatformEmployeeProfile />} />
                <Route
                  path="employees/hiring"
                  element={<Navigate to="/platform/hr/vacancies" replace />}
                />
                <Route
                  path="employees/recruitment"
                  element={<Navigate to="/platform/hr/vacancies" replace />}
                />

                <Route path="hr" element={<Navigate to="/platform/hr/vacancies" replace />} />
                <Route
                  path="hr/vacancies"
                  element={
                    <HrPlatformRoute routeKey={ROUTE_KEYS.HR_VACANCIES}>
                      <PlatformHrVacancies />
                    </HrPlatformRoute>
                  }
                />
                <Route
                  path="hr/candidates"
                  element={
                    <HrPlatformRoute routeKey={ROUTE_KEYS.HR_CANDIDATES}>
                      <PlatformHrCandidates />
                    </HrPlatformRoute>
                  }
                />

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
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.PROCUREMENT}>
                      <PurchaseDetailPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="receiving"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.RECEIVING}>
                      <ReceivingPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="receiving/:id"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.RECEIVING}>
                      <ReceivingDetailPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="suppliers"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SUPPLIERS}>
                      <SuppliersPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="suppliers/:id"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SUPPLIERS}>
                      <SupplierDetailPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="settlements"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SETTLEMENTS}>
                      <SettlementsPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="supplier-payments"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SUPPLIER_PAYMENTS}>
                      <SupplierPaymentsPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="price-tags"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.PRICE_TAGS}>
                      <PriceTagsPage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="products/price-checker"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.PRICE_CHECKER}>
                      <PriceCheckerPage />
                    </PlatformRoute>
                  }
                />

                <Route
                  path="standards"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.STANDARDS}>
                      <StandardsPage embedded basePath="/platform/standards" />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="standards/manage"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.STANDARDS_MANAGE}>
                      <PlatformStandardsManage />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="standards/:slug"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.STANDARDS}>
                      <StandardsPage embedded basePath="/platform/standards" />
                    </PlatformRoute>
                  }
                />

                <Route path="academy/*" element={<Navigate to="/platform" replace />} />
                <Route path="courses/:id" element={<Navigate to="/platform" replace />} />

                <Route path="settings" element={<PlatformSettings />} />
                <Route
                  path="settings/general"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SETTINGS_GENERAL}>
                      <PlatformSettingsGeneral />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="settings/roles"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SETTINGS_ROLES}>
                      <PlatformSettingsRoles />
                    </PlatformRoute>
                  }
                />
                <Route
                  path="settings/notifications"
                  element={
                    <PlatformRoute routeKey={ROUTE_KEYS.SETTINGS_NOTIFICATIONS}>
                      <PlatformSettingsNotifications />
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
                path="/admin/standards"
                element={<Navigate to="/platform/standards/manage" replace />}
              />
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
              <Route path="/standards" element={<Navigate to="/platform/standards" replace />} />
              <Route path="/standards/:slug" element={<LegacyStandardRedirect />} />

              <Route path="*" element={<Navigate to={LOGIN_PATH} replace />} />
            </Routes>
          </ToastProvider>
        </BrowserRouter>
      </SessionProvider>
    </LanguageProvider>
  )
}
