import { useRef, useState } from 'react'
import EmployeeAvatar from './EmployeeAvatar'
import {
  uploadEmployeeAvatarFile,
  deleteEmployeeAvatarFile,
  validateEmployeeAvatarFile,
} from '../services/employeeAvatarService'
import { updateEmployeeAvatar, removeEmployeeAvatar } from '../services/academyDataService'
import { canEditEmployeeAvatar } from '../config/permissions'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import './EmployeeAvatar.css'

/** Блок загрузки и управления фото профиля */
export default function ProfileAvatarEditor({
  employeeId,
  employee,
  onAvatarChange,
  layout = 'default',
}) {
  const { user, updateSessionUser } = useSession()
  const { success: showSuccess, error: showError } = useToast()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const canEdit = canEditEmployeeAvatar(user, employeeId)
  const avatarUrl = employee?.avatarUrl || null
  const displayName = employee?.name || user?.name
  const centered = layout === 'centered'

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const validationError = validateEmployeeAvatarFile(file)
    if (validationError) {
      showError(validationError)
      return
    }

    setUploading(true)
    try {
      const uploaded = await uploadEmployeeAvatarFile(employeeId, file)
      await updateEmployeeAvatar(employeeId, uploaded.avatarUrl, {
        previousAvatarUrl: avatarUrl,
      })

      if (Number(user?.id) === Number(employeeId)) {
        updateSessionUser({ avatarUrl: uploaded.avatarUrl })
      }

      onAvatarChange?.(uploaded.avatarUrl)
      showSuccess('Фото профиля обновлено')
    } catch (err) {
      showError(err.message || 'Не удалось загрузить изображение')
    } finally {
      setUploading(false)
    }
  }

  if (!canEdit && centered) {
    return (
      <div className="profile-avatar-editor profile-avatar-editor--centered">
        <EmployeeAvatar name={displayName} avatarUrl={avatarUrl} size="lg" />
      </div>
    )
  }

  if (!canEdit) {
    return (
      <section className="profile-avatar-editor">
        <h2 className="profile-avatar-editor__title">Фото профиля</h2>
        <EmployeeAvatar name={displayName} avatarUrl={avatarUrl} size="lg" />
      </section>
    )
  }

  if (centered) {
    return (
      <div className="profile-avatar-editor profile-avatar-editor--centered">
        <EmployeeAvatar name={displayName} avatarUrl={avatarUrl} size="lg" />

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          hidden
          onChange={handleFileChange}
        />

        <button
          type="button"
          className="profile-avatar-editor__change-link"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Сохранение…' : 'Изменить фотографию'}
        </button>
      </div>
    )
  }

  return (
    <section className="profile-avatar-editor">
      <h2 className="profile-avatar-editor__title">Фото профиля</h2>

      <div className="profile-avatar-editor__preview">
        <EmployeeAvatar name={displayName} avatarUrl={avatarUrl} size="lg" />
        {uploading && <span className="profile-avatar-editor__loading">Загрузка…</span>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        hidden
        onChange={handleFileChange}
      />

      <div className="profile-avatar-editor__actions">
        <button
          type="button"
          className="btn btn--outline btn--sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {avatarUrl ? 'Изменить фото' : 'Загрузить фото'}
        </button>
        {avatarUrl && (
          <button
            type="button"
            className="btn btn--outline btn--sm admin-table__danger"
            disabled={uploading}
            onClick={async () => {
              setUploading(true)
              try {
                await deleteEmployeeAvatarFile(avatarUrl)
                await removeEmployeeAvatar(employeeId)
                if (Number(user?.id) === Number(employeeId)) {
                  updateSessionUser({ avatarUrl: null })
                }
                onAvatarChange?.(null)
                showSuccess('Фото профиля удалено')
              } catch (err) {
                showError(err.message || 'Не удалось удалить изображение')
              } finally {
                setUploading(false)
              }
            }}
          >
            Удалить фото
          </button>
        )}
      </div>
    </section>
  )
}
