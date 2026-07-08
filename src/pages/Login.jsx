import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { login, getPostLoginPath } from '../utils/auth'
import { useSession } from '../context/SessionContext'
import './Login.css'

const DEACTIVATED_MESSAGE = 'Аккаунт деактивирован. Обратитесь к администратору.'

/**
 * Страница входа — /login
 * Поддерживает ?redirect=/courses/:id для возврата после авторизации
 */
export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')
  const { setSessionUser } = useSession()

  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(loginValue, password)
      if (!result.success) {
        setError(
          result.error === 'deactivated'
            ? DEACTIVATED_MESSAGE
            : 'Неверный логин или пароль'
        )
        return
      }

      setSessionUser(result.user)
      navigate(getPostLoginPath(result.user, redirect), { replace: true })
    } catch {
      setError('Не удалось выполнить вход. Попробуйте позже.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-page__card">
        <div className="login-page__logo">
          <span className="login-page__logo-icon">S</span>
          <h1 className="login-page__title">Shugyla Academy</h1>
        </div>

        <p className="login-page__subtitle">Вход в систему обучения</p>

        {redirect && (
          <p className="login-page__redirect-hint">
            Войдите, чтобы продолжить просмотр курса
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

        <Link to="/academy" className="login-page__back">
          ← На главную
        </Link>
      </div>
    </div>
  )
}
