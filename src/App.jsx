import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { AcademyDataProvider } from './context/AcademyDataContext'
import { SessionProvider } from './context/SessionContext'
import ProtectedRoute from './components/ProtectedRoute'
import PlatformRoute from './components/platform/PlatformRoute'
import { ACCESS } from './platform/platformAccess'
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
import PlatformIndex from './pages/platform/PlatformIndex'
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
        <Route path="/" element={<Navigate to="/login" replace />} />
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
                <ModulePlaceholder
                  title="Закуп"
                  description="Закупочные заявки и заказы."
                />
              </PlatformRoute>
            }
          />
          <Route
            path="receiving"
            element={
              <PlatformRoute access={ACCESS.PROCUREMENT}>
                <ModulePlaceholder
                  title="Приёмка"
                  description="Приёмка товара и сверка с накладными."
                />
              </PlatformRoute>
            }
          />
          <Route
            path="suppliers"
            element={
              <PlatformRoute access={ACCESS.PROCUREMENT}>
                <SuppliersPage />
              </PlatformRoute>
            }
          />
          <Route
            path="suppliers/:id"
            element={
              <PlatformRoute access={ACCESS.PROCUREMENT}>
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

          <Route path="academy" element={<PlatformAcademy />} />
          <Route
            path="settings"
            element={
              <PlatformRoute access={ACCESS.ADMIN}>
                <PlatformSettings />
              </PlatformRoute>
            }
          />
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

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </SessionProvider>
      </BrowserRouter>
      </AcademyDataProvider>
    </LanguageProvider>
  )
}
