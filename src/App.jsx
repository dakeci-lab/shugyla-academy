import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Academy from './pages/Academy'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import CoursePage from './pages/CoursePage'

/**
 * Маршрутизация приложения Shugyla Academy
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Главная — перенаправление на /academy */}
        <Route path="/" element={<Navigate to="/academy" replace />} />

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

        <Route path="/courses/:id" element={<CoursePage />} />

        {/* 404 — на главную */}
        <Route path="*" element={<Navigate to="/academy" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
