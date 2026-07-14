import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { login, getPostLoginPath } from '../utils/auth'
import { useSession, AUTH_STATUS, SESSION_TYPE } from '../context/SessionContext'
import { isCloudMode } from '../lib/dataMode'
import AuthLoadingScreen from '../components/AuthLoadingScreen'
import './Login.css'

const DEACTIVATED_MESSAGE = 'Аккаунт деактивирован. Обратитесь к администратору.'

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12C2 12 5.5 5 12 5C18.5 5 22 12 22 12C22 12 18.5 19 12 19C5.5 19 2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3L21 21M10.58 10.58C10.21 10.95 10 11.45 10 12C10 13.1 10.9 14 12 14C12.55 14 13.05 13.79 13.42 13.42M17.94 17.94C16.23 19.24 14.21 20 12 20C5 20 1 12 1 12C2.24 9.24 4.14 6.94 6.5 5.5M9.9 4.24C10.59 4.09 11.29 4 12 4C19 4 23 12 23 12C22.43 13.45 21.55 14.74 20.41 15.82"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Страница входа — /login
 * Корпоративный split-layout: бренд слева, форма справа
 */
export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')
  const {
    setSessionUser,
    user,
    authStatus,
    supabaseAuthenticated,
    rbacReady,
  } = useSession()

  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [completingLogin, setCompletingLogin] = useState(false)

  useEffect(() => {
    if (authStatus === AUTH_STATUS.LOADING) return
    if (!user || authStatus !== AUTH_STATUS.AUTHENTICATED) return
    if (!rbacReady) return

    const needsSupabaseJwt = isCloudMode()
    if (needsSupabaseJwt && !supabaseAuthenticated) return

    navigate(getPostLoginPath(user, redirect), { replace: true })
    setCompletingLogin(false)
  }, [
    user,
    authStatus,
    supabaseAuthenticated,
    rbacReady,
    navigate,
    redirect,
  ])

  if (authStatus === AUTH_STATUS.LOADING || completingLogin) {
    return <AuthLoadingScreen />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(loginValue, password)
      if (!result.success) {
        if (result.error === 'invalid') {
          setError('Неверный логин или пароль')
        } else if (result.error === DEACTIVATED_MESSAGE) {
          setError(DEACTIVATED_MESSAGE)
        } else if (typeof result.error === 'string' && result.error) {
          setError(result.error)
        } else {
          setError('Не удалось войти. Попробуйте позже.')
        }
        return
      }

      setSessionUser(result.user, {
        sessionType: result.sessionType,
        supabaseAuthenticated: result.supabaseAuthenticated,
      })
      setCompletingLogin(true)
    } catch {
      setError('Не удалось войти. Попробуйте позже.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <aside className="login-page__brand" aria-hidden="true">
        <div className="login-page__decor login-page__decor--circle login-page__decor--1" />
        <div className="login-page__decor login-page__decor--circle login-page__decor--2" />
        <div className="login-page__decor login-page__decor--line login-page__decor--3" />
        <div className="login-page__decor login-page__decor--block login-page__decor--4" />
        <div className="login-page__decor login-page__decor--ring login-page__decor--5" />

        <div className="login-page__brand-inner">
          <div className="login-page__brand-logo">S</div>
          <h1 className="login-page__brand-title">Shugyla Platform</h1>
          <p className="login-page__brand-subtitle">
            Внутренняя система управления Shugyla Market
          </p>
        </div>
      </aside>

      <main className="login-page__panel">
        <div className="login-page__panel-inner">
          <header className="login-page__header">
            <h2 className="login-page__welcome">Добро пожаловать в Shugyla Platform</h2>
            <p className="login-page__welcome-sub">Войдите в систему для продолжения</p>
          </header>

          {redirect && (
            <p className="login-page__redirect-hint">
              Войдите, чтобы открыть запрошенный раздел платформы
            </p>
          )}

          <form className="login-page__form" onSubmit={handleSubmit}>
            <label className="login-page__label">
              Логин или телефон
              <input
                type="text"
                className="login-page__input"
                value={loginValue}
                onChange={(e) => setLoginValue(e.target.value)}
                placeholder="Введите логин или телефон"
                required
                autoComplete="username"
              />
            </label>

            <label className="login-page__label">
              Пароль
              <div className="login-page__password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="login-page__input login-page__input--password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-page__password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>

            {error && <p className="login-page__error" role="alert">{error}</p>}

            <button type="submit" className="login-page__submit" disabled={loading}>
              {loading ? 'Вход…' : 'Войти'}
            </button>
          </form>

          <p className="login-page__forgot-note">
            Если забыли пароль, обратитесь к администратору.
          </p>

          <footer className="login-page__footer">
            © 2026 Shugyla Market
          </footer>
        </div>
      </main>
    </div>
  )
}
