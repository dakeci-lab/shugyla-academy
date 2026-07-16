import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AUTH_STATUS, useSession } from '../../context/SessionContext'
import AuthLoadingScreen from '../AuthLoadingScreen'
import {
  isPlatformProfileReady,
  resolvePlatformStartPath,
} from '../../platform/platformBootstrap'
import { LOGIN_PATH } from '../../router/authRoutes'
import './PlatformSessionGate.css'

function PlatformBootstrapError({ title, message, onRetry, onLogout }) {
  return (
    <div className="platform-session-gate">
      <div className="platform-session-gate__card">
        <h1 className="platform-session-gate__title">{title}</h1>
        <p className="platform-session-gate__text">{message}</p>
        <div className="platform-session-gate__actions">
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            Повторить
          </button>
          <button type="button" className="btn btn--ghost" onClick={onLogout}>
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  )
}

/** Загрузка сессии/RBAC и безопасный стартовый маршрут для платформы */
export default function PlatformSessionGate({ children }) {
  const { user, authStatus, rbacReady, refreshSession, logout } = useSession()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  if (authStatus === AUTH_STATUS.LOADING || !rbacReady) {
    return <AuthLoadingScreen />
  }

  if (!user || authStatus !== AUTH_STATUS.AUTHENTICATED) {
    return <Navigate to={LOGIN_PATH} replace />
  }

  if (!isPlatformProfileReady(user)) {
    return (
      <PlatformBootstrapError
        title="Профиль не настроен"
        message="Учётная запись не содержит активной роли. Обратитесь к администратору или выйдите и войдите снова."
        onRetry={() => refreshSession()}
        onLogout={async () => {
          await logout()
          navigate(LOGIN_PATH, { replace: true })
        }}
      />
    )
  }

  const startPath = resolvePlatformStartPath(user, pathname)
  if (startPath && startPath !== pathname.replace(/\/+$/, '') && startPath !== pathname) {
    return <Navigate to={startPath} replace />
  }

  return children
}
