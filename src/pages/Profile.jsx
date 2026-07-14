import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfileName } from '../services/academyDataService'
import { useSession } from '../context/SessionContext'
import { getEmployeeById } from '../utils/employeeData'
import ProfileAvatarEditor from '../components/ProfileAvatarEditor'
import ProfileChangePasswordForm from '../components/ProfileChangePasswordForm'
import PushNotificationSettings from '../components/platform/notifications/PushNotificationSettings'
import './Profile.css'

/** Страница профиля — внутри PlatformLayout */
export default function Profile() {
  const navigate = useNavigate()
  const { user, updateSessionUser } = useSession()
  const [fullName, setFullName] = useState(user?.name || '')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [avatarVersion, setAvatarVersion] = useState(0)

  const employee = useMemo(() => {
    void avatarVersion
    return user?.id ? getEmployeeById(user.id) : null
  }, [user?.id, avatarVersion])

  if (!user) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const trimmed = fullName.trim()
    if (!trimmed) {
      setError('Укажите ФИО')
      return
    }
    if (trimmed.length < 2) {
      setError('ФИО должно содержать минимум 2 символа')
      return
    }

    setSaving(true)
    try {
      await updateProfileName(user.id, trimmed)
      updateSessionUser({ name: trimmed })
      setSuccess('Профиль сохранён')
    } catch (err) {
      setError(
        err.message?.includes('fetch') || err.message?.includes('network')
          ? 'Не удалось сохранить профиль. Проверьте подключение к интернету.'
          : err.message || 'Не удалось сохранить профиль. Попробуйте позже.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile-page">
      <section className="profile-page__card profile-page__card--avatar">
        <ProfileAvatarEditor
          employeeId={user.id}
          employee={employee || user}
          onAvatarChange={() => setAvatarVersion((value) => value + 1)}
        />
      </section>

      <section className="profile-page__card">
        <p className="profile-page__hint">
          Вы можете изменить только своё ФИО. Остальные данные редактирует администратор.
        </p>

        <form className="profile-page__form" onSubmit={handleSubmit}>
          <label className="profile-page__label">
            ФИО
            <input
              className="profile-page__input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Введите имя и фамилию"
              required
              minLength={2}
            />
          </label>

          {error && <p className="profile-page__error">{error}</p>}
          {success && <p className="profile-page__success">{success}</p>}

          <div className="profile-page__actions">
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => navigate(-1)}
            >
              Назад
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </section>

      <section className="profile-page__card">
        <ProfileChangePasswordForm userLogin={user.login} />
      </section>

      <PushNotificationSettings />
    </div>
  )
}
