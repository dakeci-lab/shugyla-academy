import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link, useLocation } from 'react-router-dom'
import { login, getPostLoginPath } from '../utils/auth'
import { useSession } from '../context/SessionContext'
import './Login.css'

/**
 * Страница входа — /login
 * Визуально «Логин», технически — email для Supabase Auth
 */
export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')
  const location = useLocation()
  const passwordUpdated = location.state?.passwordUpdated
  const { completeLogin, isAuthenticated, authLoading } = useSession()

  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(getPostLoginPath(null, redirect), { replace: true })
    }
  }, [authLoading, isAuthenticated, navigate, redirect])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(loginValue, password)
      if (!result.success) {
        setError(typeof result.error === 'string' ? result.error : 'Не удалось войти. Попробуйте позже.')
        return
      }

      completeLogin(result.user, result.session || null)
      navigate(getPostLoginPath(result.user, redirect), { replace: true })
    } catch {
      setError('Не удалось войти. Попробуйте позже.')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) return null

  return (
    <div className="login-page">
      <div className="login-page__card">
        <div className="login-page__logo">
          <span className="login-page__logo-icon">S</span>
          <div>
            <h1 className="login-page__title">Shugyla Platform</h1>
            <p className="login-page__brand-sub">Внутренняя платформа Shugyla Market</p>
          </div>
        </div>

        <p className="login-page__subtitle">Вход в систему</p>

        {passwordUpdated && (
          <p className="login-page__success">Пароль успешно обновлён. Войдите с новым паролем.</p>
        )}

        {redirect && (
          <p className="login-page__redirect-hint">
            Войдите, чтобы открыть запрошенный раздел платформы
          </p>
        )}

        <form className="login-page__form" onSubmit={handleSubmit}>
          <label className="login-page__label">
            Логин
            <input
              type="text"
              className="login-page__input"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              placeholder="Введите логин"
              required
              autoComplete="username"
            />
            <span className="login-page__hint">Логин выдаёт администратор.</span>
          </label>

          <label className="login-page__label">
            Пароль
            <input
              type="password"
              className="login-page__input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
              autoComplete="current-password"
            />
          </label>

          {error && <p className="login-page__error">{error}</p>}

          <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>

        <Link to="/forgot-password" className="login-page__forgot">
          Забыли пароль?
        </Link>

        <Link to="/vacancies" className="login-page__back">
          ← К публичным вакансиям
        </Link>
      </div>
    </div>
  )
}
