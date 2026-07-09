import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { AcademyDataProvider } from './context/AcademyDataContext'
import { SessionProvider } from './context/SessionContext'
import ProtectedRoute from './components/ProtectedRoute'
import PlatformRoute from './components/platform/PlatformRoute'
import { ACCESS } from './platform/platformAccess'
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
import PlatformEmployees from './pages/platform/PlatformEmployees'
import SuppliersPage, { SupplierDetailPage } from './pages/platform/suppliers/SuppliersPage'
import ModulePlaceholder from './pages/platform/ModulePlaceholder'
import AcademyCabinetContent from './components/academy/AcademyCabinetContent'
import AcademyCatalogContent from './components/academy/AcademyCatalogContent'
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
  return <Navigate to={`/platform/academy/standards/${slug}`} replace />
}

export default function App() {
  return (
    <LanguageProvider>
      <AcademyDataProvider>
      <BrowserRouter basename="/shugyla-academy">
      <SessionProvider>
      <Routes>
        {/* Публичные маршруты */}
        <Route path="/" element={<Navigate to="/login" replace />} />
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
          <Route index element={<PlatformIndex />} />

          <Route path="employees" element={<Navigate to="/platform/employees/list" replace />} />
          <Route
            path="employees/list"
            element={
              <PlatformRoute access={ACCESS.ADMIN}>
                <PlatformEmployees />
              </PlatformRoute>
            }
          />
          <Route
            path="employees/schedule"
            element={
              <PlatformRoute access={ACCESS.ADMIN}>
                <ModulePlaceholder
                  title="График работы"
                  description="Настройки графика персонала магазина."
                />
              </PlatformRoute>
            }
          />
          <Route
            path="employees/rating"
            element={
              <PlatformRoute access={ACCESS.ALL}>
                <ModulePlaceholder
                  title="Рейтинг"
                  description="Рейтинг сотрудников по дисциплине, приходу вовремя и уходу не раньше времени."
                />
              </PlatformRoute>
            }
          />
          <Route
            path="employees/payroll"
            element={
              <PlatformRoute access={ACCESS.ADMIN}>
                <ModulePlaceholder
                  title="Подсчёт зарплаты"
                  description="Расчёт заработной платы сотрудников."
                />
              </PlatformRoute>
            }
          />

          <Route
            path="procurement"
            element={
              <PlatformRoute access={ACCESS.PROCUREMENT}>
                <ModulePlaceholder title="Закуп" description="Закупочные заявки и заказы." />
              </PlatformRoute>
            }
          />
          <Route
            path="receiving"
            element={
              <PlatformRoute access={ACCESS.PROCUREMENT}>
                <ModulePlaceholder title="Приёмка" description="Приёмка товара и сверка с накладными." />
              </PlatformRoute>
            }
          />
          <Route
            path="suppliers"
            element={
              <PlatformRoute access={ACCESS.SUPPLIERS_VIEW}>
                <SuppliersPage />
              </PlatformRoute>
            }
          />
          <Route
            path="suppliers/:id"
            element={
              <PlatformRoute access={ACCESS.SUPPLIERS_VIEW}>
                <SupplierDetailPage />
              </PlatformRoute>
            }
          />
          <Route
            path="price-tags"
            element={
              <PlatformRoute access={ACCESS.PROCUREMENT}>
                <ModulePlaceholder
                  title="Ценники"
                  description="Настройки печати ценников и виды ценников."
                />
              </PlatformRoute>
            }
          />

          {/* Academy — внутри платформы */}
          <Route path="academy">
            <Route index element={<PlatformAcademy />} />
            <Route path="cabinet" element={<AcademyCabinetContent />} />
            <Route path="catalog" element={<AcademyCatalogContent />} />
            <Route
              path="standards"
              element={
                <StandardsPage embedded basePath="/platform/academy/standards" />
              }
            />
            <Route
              path="standards/:slug"
              element={
                <StandardsPage embedded basePath="/platform/academy/standards" />
              }
            />
            <Route
              path="manage"
              element={
                <PlatformRoute access={ACCESS.ADMIN}>
                  <PlatformAcademyManageLayout />
                </PlatformRoute>
              }
            >
              <Route index element={<PlatformAcademyManageHub />} />
              <Route path=":section" element={<PlatformAcademyManageSection />} />
            </Route>
          </Route>

          <Route path="courses/:id" element={<CoursePage embedded />} />

          <Route
            path="settings"
            element={
              <PlatformRoute access={ACCESS.ADMIN}>
                <PlatformSettings />
              </PlatformRoute>
            }
          />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Редиректы со старых маршрутов */}
        <Route path="/profile" element={<Navigate to="/platform/profile" replace />} />
        <Route path="/dashboard" element={<Navigate to="/platform/academy/cabinet" replace />} />
        <Route path="/academy" element={<Navigate to="/platform/academy/catalog" replace />} />
        <Route path="/admin" element={<Navigate to="/platform/academy/manage" replace />} />
        <Route path="/admin/employees" element={<Navigate to="/platform/employees/list" replace />} />
        <Route path="/admin/courses" element={<Navigate to="/platform/academy/manage/courses" replace />} />
        <Route path="/admin/routes" element={<Navigate to="/platform/academy/manage/routes" replace />} />
        <Route path="/admin/standards" element={<Navigate to="/platform/academy/manage/standards" replace />} />
        <Route path="/admin/hiring" element={<Navigate to="/platform/academy/manage/hiring" replace />} />
        <Route path="/admin/tests" element={<Navigate to="/platform/academy/manage/tests" replace />} />
        <Route path="/admin/attestation" element={<Navigate to="/platform/academy/manage/attestation" replace />} />
        <Route path="/admin/progress" element={<Navigate to="/platform/academy/manage/progress" replace />} />
        <Route path="/courses/:id" element={<LegacyCourseRedirect />} />
        <Route path="/standards" element={<Navigate to="/platform/academy/standards" replace />} />
        <Route path="/standards/:slug" element={<LegacyStandardRedirect />} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </SessionProvider>
      </BrowserRouter>
      </AcademyDataProvider>
    </LanguageProvider>
  )
}
