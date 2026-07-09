import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { AcademyDataProvider } from './context/AcademyDataContext'
import { SessionProvider } from './context/SessionContext'
import ProtectedRoute from './components/ProtectedRoute'
import PlatformLayout from './layouts/PlatformLayout'
import Academy from './pages/Academy'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VacanciesPage from './pages/VacanciesPage'
import VacancyDetailPage from './pages/VacancyDetailPage'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import CoursePage from './pages/CoursePage'
import Profile from './pages/Profile'
import Standards from './pages/Standards'
import ApplyPage from './pages/Apply'
import PlatformDashboard from './pages/platform/PlatformDashboard'
import PlatformAcademy from './pages/platform/PlatformAcademy'
import PlatformSettings from './pages/platform/PlatformSettings'
import PlatformEmployees from './pages/platform/PlatformEmployees'
import SuppliersPage, { SupplierDetailPage } from './pages/platform/suppliers/SuppliersPage'
import ModulePlaceholder from './pages/platform/ModulePlaceholder'

/**
 * Маршрутизация Shugyla Platform
 */
export default function App() {
  return (
    <LanguageProvider>
      <AcademyDataProvider>
      <BrowserRouter basename="/shugyla-academy">
      <SessionProvider>
      <Routes>
        {/* Публичные маршруты */}
        <Route path="/" element={<Navigate to="/vacancies" replace />} />
        <Route path="/vacancies" element={<VacanciesPage />} />
        <Route path="/vacancies/:slug" element={<VacancyDetailPage />} />
        <Route path="/apply/:slug" element={<ApplyPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Shugyla Platform — защищённая оболочка */}
        <Route
          path="/platform"
          element={
            <ProtectedRoute>
              <PlatformLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<PlatformDashboard />} />
          <Route
            path="products"
            element={
              <ModulePlaceholder
                title="Товары"
                description="Каталог товаров, остатки и номенклатура."
                icon="▦"
              />
            }
          />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="suppliers/:id" element={<SupplierDetailPage />} />
          <Route
            path="procurement"
            element={
              <ModulePlaceholder
                title="Закуп"
                description="Закупочные заявки и заказы."
                icon="⇄"
              />
            }
          />
          <Route
            path="receiving"
            element={
              <ModulePlaceholder
                title="Приёмка"
                description="Приёмка товара и сверка с накладными."
                icon="↧"
              />
            }
          />
          <Route
            path="price-tags"
            element={
              <ModulePlaceholder
                title="Ценники"
                description="Печать и обновление ценников в торговом зале."
                icon="▤"
              />
            }
          />
          <Route path="employees" element={<PlatformEmployees />} />
          <Route path="academy" element={<PlatformAcademy />} />
          <Route
            path="standards"
            element={<Standards embedded basePath="/platform/standards" />}
          />
          <Route
            path="standards/:slug"
            element={<Standards embedded basePath="/platform/standards" />}
          />
          <Route
            path="finance"
            element={
              <ModulePlaceholder
                title="Финансы"
                description="Финансовые показатели, отчёты и аналитика."
                icon="₸"
              />
            }
          />
          <Route path="settings" element={<PlatformSettings />} />
        </Route>

        {/* Academy и внутренние маршруты — только после авторизации */}
        <Route
          path="/academy"
          element={
            <ProtectedRoute>
              <Academy />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute requireAdmin>
              <Admin />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/standards"
          element={
            <ProtectedRoute>
              <Standards />
            </ProtectedRoute>
          }
        />

        <Route
          path="/standards/:slug"
          element={
            <ProtectedRoute>
              <Standards />
            </ProtectedRoute>
          }
        />

        <Route
          path="/courses/:id"
          element={
            <ProtectedRoute>
              <CoursePage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/vacancies" replace />} />
      </Routes>
      </SessionProvider>
      </BrowserRouter>
      </AcademyDataProvider>
    </LanguageProvider>
  )
}
