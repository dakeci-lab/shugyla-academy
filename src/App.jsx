import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { AcademyDataProvider } from './context/AcademyDataContext'
import { SessionProvider } from './context/SessionContext'
import ProtectedRoute from './components/ProtectedRoute'
import Academy from './pages/Academy'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import CoursePage from './pages/CoursePage'
import Profile from './pages/Profile'
import Standards from './pages/Standards'

/**
 * Маршрутизация приложения Shugyla Academy
 */
export default function App() {
  return (
    <LanguageProvider>
      <AcademyDataProvider>
      <BrowserRouter basename="/shugyla-academy">
      <SessionProvider>
      <Routes>
        {/* Главная — доступна и по /, и по /academy */}
        <Route path="/" element={<Academy />} />
        <Route path="/academy" element={<Academy />} />
        <Route path="/login" element={<Login />} />

        {/* Защищённые маршруты — нужна авторизация */}
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

        <Route path="/courses/:id" element={<CoursePage />} />

        {/* 404 — на главную */}
        <Route path="*" element={<Navigate to="/academy" replace />} />
      </Routes>
      </SessionProvider>
      </BrowserRouter>
      </AcademyDataProvider>
    </LanguageProvider>
  )
}
