import { useState } from 'react'
import { Link } from 'react-router-dom'
import { sendPasswordResetEmail, usesSupabaseAuth } from '../services/authService'
import './Login.css'

/** Восстановление пароля — /forgot-password */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setLoading(true)

    try {
      if (!usesSupabaseAuth()) {
        setError('Восстановление пароля доступно только в облачном режиме с Supabase Auth.')
        return
      }

      await sendPasswordResetEmail(email)
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Не удалось отправить письмо. Попробуйте позже.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-page__card">
        <div className="login-page__logo">
          <span className="login-page__logo-icon">S</span>
          <div>
            <h1 className="login-page__title">Восстановление пароля</h1>
            <p className="login-page__brand-sub">Shugyla Platform</p>
          </div>
        </div>

        <p className="login-page__subtitle">
          Введите email, указанный при регистрации в системе
        </p>

        {success ? (
          <p className="login-page__success">
            Если пользователь с таким email существует, ссылка для восстановления пароля
            отправлена на почту.
          </p>
        ) : (
          <form className="login-page__form" onSubmit={handleSubmit}>
            <label className="login-page__label">
              Email
              <input
                type="email"
                className="login-page__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.kz"
                required
                autoComplete="email"
              />
            </label>

            {error && <p className="login-page__error">{error}</p>}

            <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
              {loading ? 'Отправка…' : 'Отправить ссылку для восстановления'}
            </button>
          </form>
        )}

        <Link to="/login" className="login-page__back">
          ← Вернуться ко входу
        </Link>
      </div>
    </div>
  )
}
