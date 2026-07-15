import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from '../services/academyDataService'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { getEmployeeById } from '../utils/employeeData'
import { getRoleDisplayName } from '../config/permissions'
import { formatPhoneDisplay } from '../utils/phoneUtils'
import { validateContactEmail } from '../utils/profileValidation'
import { LOGIN_PATH } from '../router/authRoutes'
import ProfileAvatarEditor from '../components/ProfileAvatarEditor'
import ProfilePasswordModal from '../components/profile/ProfilePasswordModal'
import ProfileNotificationsModal from '../components/profile/ProfileNotificationsModal'
import { ChevronRightIcon } from '../components/icons/PlatformIcons'
import './Profile.css'

function getInitialForm(user, employee) {
  return {
    firstName: employee?.firstName || user?.name?.split(/\s+/)[0] || '',
    lastName: employee?.lastName || user?.name?.split(/\s+/).slice(1).join(' ') || '',
    contactEmail: employee?.contactEmail || '',
  }
}

/** Страница профиля — внутри PlatformLayout */
export default function Profile() {
  const navigate = useNavigate()
  const { user, updateSessionUser, logout } = useSession()
  const { success: showSuccess, error: showError } = useToast()
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const passwordTriggerRef = useRef(null)
  const notificationsTriggerRef = useRef(null)

  const employee = useMemo(() => {
    void avatarVersion
    return user?.id ? getEmployeeById(user.id) : null
  }, [user?.id, avatarVersion])

  const initialForm = useMemo(() => getInitialForm(user, employee), [user, employee])
  const [firstName, setFirstName] = useState(initialForm.firstName)
  const [lastName, setLastName] = useState(initialForm.lastName)
  const [contactEmail, setContactEmail] = useState(initialForm.contactEmail)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFirstName(initialForm.firstName)
    setLastName(initialForm.lastName)
    setContactEmail(initialForm.contactEmail)
  }, [initialForm.firstName, initialForm.lastName, initialForm.contactEmail])

  if (!user) return null

  const roleLabel = user.position || getRoleDisplayName(user) || '—'
  const phoneLabel = formatPhoneDisplay(user.phone) || user.phone || 'Телефон не указан'

  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()
  const trimmedEmail = contactEmail.trim()
  const emailError = trimmedEmail ? validateContactEmail(trimmedEmail) : ''
  const hasChanges =
    trimmedFirst !== initialForm.firstName.trim() ||
    trimmedLast !== initialForm.lastName.trim() ||
    trimmedEmail !== (initialForm.contactEmail || '').trim()
  const canSave = hasChanges && trimmedFirst && !emailError && !saving

  async function handleSave(event) {
    event.preventDefault()
    if (!canSave) return

    setSaving(true)
    try {
      await updateProfile(user.id, {
        firstName: trimmedFirst,
        lastName: trimmedLast,
        contactEmail: trimmedEmail,
      })
      const fullName = `${trimmedFirst} ${trimmedLast}`.trim()
      updateSessionUser({ name: fullName })
      showSuccess('Профиль сохранён')
    } catch (err) {
      showError(err.message || 'Не удалось сохранить профиль')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate(LOGIN_PATH)
  }

  return (
    <div className="profile-page">
      <section className="profile-page__hero">
        <ProfileAvatarEditor
          employeeId={user.id}
          employee={employee || user}
          layout="centered"
          onAvatarChange={() => setAvatarVersion((value) => value + 1)}
        />

        <p className="profile-page__role">{roleLabel}</p>
        <p className="profile-page__phone">{phoneLabel}</p>
      </section>

      <form className="profile-page__card profile-page__form" onSubmit={handleSave}>
        <label className="profile-page__label">
          Имя
          <input
            className="profile-page__input"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            required
          />
        </label>

        <label className="profile-page__label">
          Фамилия
          <input
            className="profile-page__input"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
        </label>

        <label className="profile-page__label">
          Электронная почта
          <input
            className="profile-page__input"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            placeholder="example@mail.com"
          />
        </label>

        {emailError && (
          <p className="profile-page__error" role="alert">
            {emailError}
          </p>
        )}

        <button type="submit" className="btn btn--primary profile-page__save" disabled={!canSave}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </form>

      <div className="profile-page__actions">
        <button
          ref={notificationsTriggerRef}
          type="button"
          className="profile-page__action-row"
          onClick={() => setNotificationsOpen(true)}
        >
          <span>Уведомления</span>
          <ChevronRightIcon size={18} />
        </button>

        <button
          ref={passwordTriggerRef}
          type="button"
          className="profile-page__action-row"
          onClick={() => setPasswordOpen(true)}
        >
          <span>Сменить пароль</span>
          <ChevronRightIcon size={18} />
        </button>
      </div>

      <button type="button" className="profile-page__logout" onClick={() => void handleLogout()}>
        Выйти
      </button>

      <ProfilePasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        userLogin={user.login}
        returnFocusRef={passwordTriggerRef}
      />

      <ProfileNotificationsModal
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        returnFocusRef={notificationsTriggerRef}
      />
    </div>
  )
}
