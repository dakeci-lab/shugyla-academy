import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { login, getPostLoginPath } from '../utils/auth'
import { getAllEmployees } from '../utils/employeeData'
import { getRole } from '../data/roles'
import './Login.css'

/**
 * Страница входа — /login
 * Поддерживает ?redirect=/courses/:id для возврата после авторизации
 */
export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')

  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const user = login(loginValue, password)
    if (!user) {
      setError('Неверный логин или пароль')
      return
    }

    navigate(getPostLoginPath(user, redirect), { replace: true })
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

          <button type="submit" className="btn btn--primary btn--full">
            Войти
          </button>
        </form>

        <div className="login-page__demo">
          <p className="login-page__demo-title">Демо-аккаунты (mock data):</p>
          <ul className="login-page__demo-list">
            {getAllEmployees().map((u) => {
              const role = getRole(u.role)
              return (
                <li key={u.id}>
                  <code>{u.login}</code> / <code>{u.password}</code>
                  {' — '}
                  {role?.label || u.role}
                </li>
              )
            })}
          </ul>
        </div>

        <Link to="/academy" className="login-page__back">
          ← На главную
        </Link>
      </div>
    </div>
  )
}
