import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../utils/auth'
import './Login.css'

/**
 * Страница входа — /login
 * Демо-аккаунты: admin/admin123, kassir/123456, adminzal/123456
 */
export default function Login() {
  const navigate = useNavigate()
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

    // Админ идёт в админ-панель, остальные — в личный кабинет
    if (user.role === 'admin') {
      navigate('/admin')
    } else {
      navigate('/dashboard')
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
            />
          </label>

          {error && <p className="login-page__error">{error}</p>}

          <button type="submit" className="btn btn--primary btn--full">
            Войти
          </button>
        </form>

        <div className="login-page__demo">
          <p className="login-page__demo-title">Демо-аккаунты:</p>
          <ul className="login-page__demo-list">
            <li><code>admin</code> / <code>admin123</code> — Администратор</li>
            <li><code>kassir</code> / <code>123456</code> — Кассир</li>
            <li><code>adminzal</code> / <code>123456</code> — Админ зала</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
