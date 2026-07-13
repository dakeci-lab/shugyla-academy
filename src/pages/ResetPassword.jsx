import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { updatePassword, mapAuthError, usesSupabaseAuth } from '../services/authService'
import { LOGIN_PATH } from '../router/authRoutes'
import './Login.css'

/** Сброс пароля — /reset-password (card-layout, не форма входа) */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!usesSupabaseAuth() || !supabase) {
      setChecking(false)
      setError('Сброс пароля доступен только в облачном режиме с Supabase Auth.')
      return
    }

    let cancelled = false

    async function verifyRecoverySession() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          if (!cancelled) setError(mapAuthError(sessionError))
          return
        }
        if (!data.session) {
          if (!cancelled) {
            setError('Ссылка восстановления устарела или недействительна')
          }
          return
        }
        if (!cancelled) setReady(true)
      } catch (err) {
        if (!cancelled) setError(mapAuthError(err))
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    verifyRecoverySession()

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true)
        setError('')
        setChecking(false)
      }
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Пароль слишком простой. Используйте не менее 6 символов.')
      return
    }

    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }

    setLoading(true)
    try {
      await updatePassword(password)
      navigate(LOGIN_PATH, {
        replace: true,
        state: { passwordUpdated: true },
      })
    } catch (err) {
      setError(err.message || 'Не удалось обновить пароль')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="login-page">
        <div className="login-page__card">
          <p className="login-page__subtitle">Проверка ссылки восстановления…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-page__card">
        <div className="login-page__logo">
          <span className="login-page__logo-icon">S</span>
          <div>
            <h1 className="login-page__title">Новый пароль</h1>
            <p className="login-page__brand-sub">Shugyla Platform</p>
          </div>
        </div>

        {!ready ? (
          <>
            <p className="login-page__error">{error || 'Ссылка восстановления недействительна'}</p>
            <Link to="/forgot-password" className="login-page__back">
              Запросить новую ссылку
            </Link>
          </>
        ) : (
          <form className="login-page__form" onSubmit={handleSubmit}>
            <label className="login-page__label">
              Новый пароль
              <input
                type="password"
                className="login-page__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </label>

            <label className="login-page__label">
              Повторите новый пароль
              <input
                type="password"
                className="login-page__input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </label>

            {error && <p className="login-page__error">{error}</p>}

            <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
              {loading ? 'Сохранение…' : 'Сохранить новый пароль'}
            </button>
          </form>
        )}

        <Link to={LOGIN_PATH} className="login-page__back">
          ← Вернуться ко входу
        </Link>
      </div>
    </div>
  )
}
