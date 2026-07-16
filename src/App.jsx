import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { getRouterBasename } from './router/basename'
import { LanguageProvider } from './context/LanguageContext'
import { AcademyDataProvider } from './context/AcademyDataContext'
import { SessionProvider } from './context/SessionContext'
import { PermissionProvider } from './context/PermissionContext'
import { ToastProvider } from './context/ToastContext'
import { NotificationInboxProvider } from './context/NotificationInboxContext'
import ProtectedRoute from './components/ProtectedRoute'
import PlatformRoute from './components/platform/PlatformRoute'
import PlatformNotFound from './components/platform/PlatformNotFound'
import { LOGIN_PATH } from './router/authRoutes'
import { ROUTE_KEYS } from './config/permissions'
import PlatformLayout from './layouts/PlatformLayout'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VacanciesPage from './pages/VacanciesPage'
import VacancyDetailPage from './pages/VacancyDetailPage'
import ApplyPage from './pages/Apply'
import Profile from './pages/Profile'
import CoursePage from './pages/CoursePage'
import StandardsPage from './pages/Standards'
import PlatformIndex from './pages/platform/PlatformIndex'
import PlatformAcademy from './pages/platform/PlatformAcademy'
import PlatformSettings from './pages/platform/PlatformSettings'
import PlatformSettingsGeneral from './pages/platform/PlatformSettingsGeneral'
import PlatformSettingsRoles from './pages/platform/PlatformSettingsRoles'
import PlatformSettingsNotifications from './pages/platform/PlatformSettingsNotifications'
import PlatformEmployees from './pages/platform/PlatformEmployees'
import PlatformEmployeesRedirect from './pages/platform/PlatformEmployeesRedirect'
import PlatformWorkSchedule from './pages/platform/PlatformWorkSchedule'
import PlatformEmployeeSchedule from './pages/platform/PlatformEmployeeSchedule'
import PlatformEmployeeRating from './pages/platform/PlatformEmployeeRating'
import PlatformTimeTracker from './pages/platform/PlatformTimeTracker'
import PlatformHrVacancies from './pages/platform/PlatformHrVacancies'
import PlatformHrCandidates from './pages/platform/PlatformHrCandidates'
import HrPlatformRoute from './components/platform/HrPlatformRoute'
import PlatformStandardsManage from './pages/platform/PlatformStandardsManage'
import SuppliersPage, { SupplierDetailPage } from './pages/platform/suppliers/SuppliersPage'
import ProcurementPage from './pages/platform/procurement/ProcurementPage'
import AnalyticsProcurementPage from './pages/platform/procurement/AnalyticsProcurementPage'
import PurchaseDetailPage from './pages/platform/procurement/PurchaseDetailPage'
import ReceivingPage from './pages/platform/receiving/ReceivingPage'
import ReceivingDetailPage from './pages/platform/receiving/ReceivingDetailPage'
import ModulePlaceholder from './pages/platform/ModulePlaceholder'
import AcademyCabinetContent from './components/academy/AcademyCabinetContent'
import AcademyCatalogContent from './components/academy/AcademyCatalogContent'
import AcademyAssignmentContent from './components/academy/AcademyAssignmentContent'
import {
  PlatformAcademyManageHub,
  PlatformAcademyManageLayout,
  PlatformAcademyManageSection,
} from './pages/platform/academy/PlatformAcademyManage'

/**
 * Маршрутизация Shugyla Platform
 */

function LegacyCourseRedirect() {
  const { id } = useParams()
  return <Navigate to={`/platform/courses/${id}`} replace />
}

function LegacyStandardRedirect() {
  const { slug } = useParams()
  return <Navigate to={`/platform/standards/${slug}`} replace />
}

export default function App() {
  return (
    <LanguageProvider>
      <SessionProvider>
      <BrowserRouter basename={getRouterBasename()}>
      <AcademyDataProvider>
      <PermissionProvider>
      <ToastProvider>
      <NotificationInboxProvider>
      <Routes>
        {/* Публичные маршруты */}
        <Route path="/" element={<Navigate to={LOGIN_PATH} replace />} />
        <Route path="/vacancies" element={<VacanciesPage />} />
        <Route path="/vacancies/:slug" element={<VacancyDetailPage />} />
        <Route path="/apply/:slug" element={<ApplyPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Shugyla Platform — единая оболочка для всех внутренних разделов */}
        <Route
          path="/platform"
          element={
            <ProtectedRoute>
              <PlatformLayout />
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
            path="employees/:employeeId/schedule"
            element={
              <PlatformRoute routeKey={ROUTE_KEYS.EMPLOYEES_SCHEDULE}>
                <PlatformEmployeeSchedule />
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
                <ModulePlaceholder
                  title="Подсчёт зарплаты"
                  description="Расчёт заработной платы сотрудников."
                />
              </PlatformRoute>
            }
          />
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
            path="price-tags"
            element={
              <PlatformRoute routeKey={ROUTE_KEYS.PRICE_TAGS}>
                <ModulePlaceholder
                  title="Ценники"
                  description="Настройки печати ценников и виды ценников."
                />
              </PlatformRoute>
            }
          />

          {/* База стандартов */}
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

          {/* Academy — внутри платформы */}
          <Route path="academy">
            <Route
              index
              element={
                <PlatformRoute routeKey={ROUTE_KEYS.ACADEMY}>
                  <PlatformAcademy />
                </PlatformRoute>
              }
            />
            <Route path="cabinet" element={<AcademyCabinetContent />} />
            <Route path="catalog" element={<AcademyCatalogContent />} />
            <Route
              path="assignment"
              element={
                <PlatformRoute routeKey={ROUTE_KEYS.ACADEMY_MANAGE}>
                  <AcademyAssignmentContent />
                </PlatformRoute>
              }
            />
            <Route
              path="standards"
              element={<Navigate to="/platform/standards" replace />}
            />
            <Route
              path="standards/:slug"
              element={<LegacyStandardRedirect />}
            />
            <Route
              path="manage"
              element={
                <PlatformRoute routeKey={ROUTE_KEYS.ACADEMY_MANAGE}>
                  <PlatformAcademyManageLayout />
                </PlatformRoute>
              }
            >
              <Route index element={<PlatformAcademyManageHub />} />
              <Route path="hiring" element={<Navigate to="/platform/hr/vacancies" replace />} />
              <Route path="standards" element={<Navigate to="/platform/standards/manage" replace />} />
              <Route path=":section" element={<PlatformAcademyManageSection />} />
            </Route>
          </Route>

          <Route path="courses/:id" element={<CoursePage embedded />} />

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
        <Route path="/dashboard" element={<Navigate to="/platform/academy/cabinet" replace />} />
        <Route path="/academy" element={<Navigate to="/platform/academy/catalog" replace />} />
        <Route path="/admin" element={<Navigate to="/platform/academy/manage" replace />} />
        <Route path="/admin/employees" element={<Navigate to="/platform/employees/list" replace />} />
        <Route path="/admin/courses" element={<Navigate to="/platform/academy/manage/courses" replace />} />
        <Route path="/admin/routes" element={<Navigate to="/platform/academy/manage/courses" replace />} />
        <Route path="/admin/standards" element={<Navigate to="/platform/standards/manage" replace />} />
        <Route path="/admin/hiring" element={<Navigate to="/platform/hr/vacancies" replace />} />
        <Route path="/hiring" element={<Navigate to="/platform/hr/vacancies" replace />} />
        <Route path="/recruitment" element={<Navigate to="/platform/hr/vacancies" replace />} />
        <Route path="/employees/hiring" element={<Navigate to="/platform/hr/vacancies" replace />} />
        <Route path="/employees/recruitment" element={<Navigate to="/platform/hr/vacancies" replace />} />
        <Route path="/admin/tests" element={<Navigate to="/platform/academy/manage/tests" replace />} />
        <Route path="/admin/attestation" element={<Navigate to="/platform/academy/manage/courses" replace />} />
        <Route path="/admin/progress" element={<Navigate to="/platform/academy/manage/progress" replace />} />
        <Route path="/courses/:id" element={<LegacyCourseRedirect />} />
        <Route path="/standards" element={<Navigate to="/platform/standards" replace />} />
        <Route path="/standards/:slug" element={<LegacyStandardRedirect />} />

        <Route path="*" element={<Navigate to={LOGIN_PATH} replace />} />
      </Routes>
      </NotificationInboxProvider>
      </ToastProvider>
      </PermissionProvider>
      </AcademyDataProvider>
      </BrowserRouter>
      </SessionProvider>
    </LanguageProvider>
  )
}
