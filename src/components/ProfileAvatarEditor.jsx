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
import './EmployeeAvatar.css'

/** Блок загрузки и управления фото профиля */
export default function ProfileAvatarEditor({
  employeeId,
  employee,
  onAvatarChange,
}) {
  const { user, updateSessionUser } = useSession()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const canEdit = canEditEmployeeAvatar(user, employeeId)
  const avatarUrl = employee?.avatarUrl || null
  const displayName = employee?.name || user?.name

  if (!canEdit) {
    return (
      <section className="profile-avatar-editor">
        <h2 className="profile-avatar-editor__title">Фото профиля</h2>
        <EmployeeAvatar name={displayName} avatarUrl={avatarUrl} size="lg" />
      </section>
    )
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const validationError = validateEmployeeAvatarFile(file)
    if (validationError) {
      setError(validationError)
      setMessage('')
      return
    }

    setUploading(true)
    setError('')
    setMessage('')
    try {
      const uploaded = await uploadEmployeeAvatarFile(employeeId, file)
      await updateEmployeeAvatar(employeeId, uploaded.avatarUrl, {
        previousAvatarUrl: avatarUrl,
      })

      if (Number(user?.id) === Number(employeeId)) {
        updateSessionUser({ avatarUrl: uploaded.avatarUrl })
      }

      onAvatarChange?.(uploaded.avatarUrl)
      setMessage('Фото профиля обновлено')
    } catch (err) {
      setError(err.message || 'Не удалось загрузить изображение')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    if (!avatarUrl) return
    setUploading(true)
    setError('')
    setMessage('')
    try {
      await deleteEmployeeAvatarFile(avatarUrl)
      await removeEmployeeAvatar(employeeId)

      if (Number(user?.id) === Number(employeeId)) {
        updateSessionUser({ avatarUrl: null })
      }

      onAvatarChange?.(null)
      setMessage('Фото профиля удалено')
    } catch (err) {
      setError(err.message || 'Не удалось удалить изображение')
    } finally {
      setUploading(false)
    }
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
        accept="image/jpeg,image/png,image/webp"
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
            onClick={handleRemove}
          >
            Удалить фото
          </button>
        )}
      </div>

      {message && <p className="profile-page__success">{message}</p>}
      {error && <p className="profile-page__error">{error}</p>}
    </section>
  )
}
