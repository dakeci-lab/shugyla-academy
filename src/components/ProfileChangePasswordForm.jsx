import { useState } from 'react'
import {
  changePasswordWithVerification,
  usesSupabaseAuth,
} from '../services/authService'
import { validatePasswordChangeForm } from '../utils/passwordValidation'
import './ProfileChangePasswordForm.css'

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

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  show,
  onToggleShow,
}) {
  return (
    <label className="profile-password__label" htmlFor={id}>
      {label}
      <div className="profile-password__wrap">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className="profile-password__input"
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="profile-password__toggle"
          onClick={onToggleShow}
          aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
          tabIndex={-1}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error && (
        <span className="profile-password__field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  )
}

/** Форма смены пароля в личном кабинете */
export default function ProfileChangePasswordForm({ userLogin }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const supabaseAuthEnabled = usesSupabaseAuth()

  function clearForm() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowCurrent(false)
    setShowNew(false)
    setShowConfirm(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setSuccess('')

    const errors = validatePasswordChangeForm({
      currentPassword,
      newPassword,
      confirmPassword,
    })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setLoading(true)
    try {
      await changePasswordWithVerification({
        currentPassword,
        newPassword,
        fallbackLogin: userLogin,
      })
      clearForm()
      setFieldErrors({})
      setSuccess('Пароль успешно изменён')
    } catch (err) {
      setFormError(err.message || 'Произошла ошибка. Попробуйте ещё раз')
    } finally {
      setLoading(false)
    }
  }

  if (!supabaseAuthEnabled) {
    return (
      <section className="profile-password">
        <h2 className="profile-password__title">Изменение пароля</h2>
        <p className="profile-page__hint">
          Смена пароля доступна в облачном режиме с Supabase Auth.
        </p>
      </section>
    )
  }

  return (
    <section className="profile-password">
      <h2 className="profile-password__title">Изменение пароля</h2>
      <p className="profile-page__hint">
        Для безопасности сначала подтвердите текущий пароль.
      </p>

      <form className="profile-password__form" onSubmit={handleSubmit} autoComplete="off">
        <PasswordField
          id="profile-current-password"
          label="Текущий пароль"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          error={fieldErrors.currentPassword}
          show={showCurrent}
          onToggleShow={() => setShowCurrent((value) => !value)}
        />

        <PasswordField
          id="profile-new-password"
          label="Новый пароль"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          error={fieldErrors.newPassword}
          show={showNew}
          onToggleShow={() => setShowNew((value) => !value)}
        />

        <PasswordField
          id="profile-confirm-password"
          label="Повторите новый пароль"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          show={showConfirm}
          onToggleShow={() => setShowConfirm((value) => !value)}
        />

        {formError && (
          <p className="profile-page__error" role="alert">
            {formError}
          </p>
        )}

        {success && (
          <div className="profile-password__success" role="status">
            <p className="profile-page__success">{success}</p>
            <p className="profile-page__hint">
              Пароль изменён. Используйте новый пароль при следующем входе
            </p>
          </div>
        )}

        <div className="profile-password__actions">
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? 'Изменение…' : 'Изменить пароль'}
          </button>
        </div>
      </form>
    </section>
  )
}
