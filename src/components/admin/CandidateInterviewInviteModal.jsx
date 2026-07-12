import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { DEFAULT_INTERVIEW_ADDRESS } from '../../utils/recruitmentConstants'
import { getTodayLocalDateString } from '../../utils/candidateDisplayUtils'
import {
  INTERVIEW_SALUTATION_OPTIONS,
  buildInterviewInvitationText,
  validateInterviewInviteForm,
} from '../../utils/recruitmentData'
import { toastSuccess } from '../../services/notificationService'
import { CloseIcon } from '../icons/PlatformIcons'
import './CandidateInterviewInviteModal.css'
import './admin-shared.css'

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  }
}

function buildInitialForm(candidate) {
  const savedAddress = candidate?.interviewAddress?.trim()
  return {
    salutation: candidate?.interviewSalutation || 'neutral',
    candidateName: candidate?.firstName || candidate?.fullName || '',
    date: candidate?.interviewDate || '',
    time: candidate?.interviewTime || '',
    address: savedAddress || DEFAULT_INTERVIEW_ADDRESS,
    comment: candidate?.interviewComment || '',
  }
}

function validateFormWithDate(form) {
  const errors = validateInterviewInviteForm(form)
  const today = getTodayLocalDateString()
  if (form.date?.trim() && form.date < today) {
    errors.date = 'Нельзя выбрать прошедшую дату'
  }
  return errors
}

/** Модальное окно приглашения кандидата на собеседование */
export default function CandidateInterviewInviteModal({
  candidate,
  onClose,
  onSubmit,
  submitting = false,
}) {
  const [form, setForm] = useState(() => buildInitialForm(candidate))
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [copying, setCopying] = useState(false)

  useBodyScrollLock(Boolean(candidate))

  useEffect(() => {
    setForm(buildInitialForm(candidate))
    setErrors({})
    setSubmitError('')
  }, [candidate])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const previewText = useMemo(
    () =>
      buildInterviewInvitationText({
        salutation: form.salutation,
        candidateName: form.candidateName || 'кандидат',
        date: form.date,
        time: form.time,
        address: form.address || '—',
        comment: form.comment,
      }),
    [form]
  )

  async function handleCopyOnly() {
    setCopying(true)
    setSubmitError('')
    try {
      const copied = await copyTextToClipboard(previewText)
      if (!copied) throw new Error('Не удалось скопировать текст в буфер обмена')
      toastSuccess('Приглашение скопировано')
    } catch (err) {
      setSubmitError(err.message || 'Не удалось скопировать текст')
    } finally {
      setCopying(false)
    }
  }

  async function handleInvite() {
    const validationErrors = validateFormWithDate(form)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setSubmitError('')
    try {
      const copied = await copyTextToClipboard(previewText)
      if (!copied) throw new Error('Не удалось скопировать текст в буфер обмена')

      await onSubmit({
        salutation: form.salutation,
        date: form.date,
        time: form.time,
        address: form.address,
        comment: form.comment,
        message: previewText,
      })
    } catch (err) {
      setSubmitError(err.message || 'Не удалось сохранить приглашение')
    }
  }

  if (!candidate) return null

  const todayMin = getTodayLocalDateString()
  const busy = submitting || copying

  return createPortal(
    <div className="interview-invite-overlay" onClick={onClose} role="presentation">
      <div
        className="interview-invite-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="interview-invite-title"
      >
        <div className="interview-invite-modal__header">
          <h2 id="interview-invite-title" className="interview-invite-modal__title">
            Приглашение на собеседование
          </h2>
          <button
            type="button"
            className="interview-invite-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="interview-invite-modal__body">
          <label className="admin-form__label">
            Обращение
            <select
              className="admin-form__select"
              value={form.salutation}
              onChange={(e) => setForm({ ...form, salutation: e.target.value })}
            >
              {INTERVIEW_SALUTATION_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-form__label">
            Имя кандидата
            <input className="admin-form__input" value={form.candidateName} readOnly />
          </label>

          <div className="admin-form__row">
            <label className="admin-form__label">
              Дата собеседования *
              <input
                type="date"
                className="admin-form__input"
                value={form.date}
                min={todayMin}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
              {errors.date && <span className="admin-form__error">{errors.date}</span>}
            </label>
            <label className="admin-form__label">
              Время собеседования *
              <input
                type="time"
                className="admin-form__input"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                required
              />
              {errors.time && <span className="admin-form__error">{errors.time}</span>}
            </label>
          </div>

          <label className="admin-form__label">
            Адрес *
            <textarea
              className="admin-form__input interview-invite-modal__address"
              rows={2}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Адрес магазина или места встречи"
              required
            />
            {errors.address && <span className="admin-form__error">{errors.address}</span>}
          </label>

          <label className="admin-form__label">
            Дополнительный комментарий
            <textarea
              className="admin-form__input"
              rows={3}
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              placeholder="Например: возьмите удостоверение личности"
            />
          </label>

          <div className="interview-invite-preview-card">
            <p className="interview-invite-preview-card__label">Предпросмотр текста приглашения</p>
            <div className="interview-invite-preview">{previewText}</div>
          </div>

          {submitError && <p className="admin-form__error">{submitError}</p>}
        </div>

        <div className="interview-invite-modal__footer">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--outline"
            onClick={handleCopyOnly}
            disabled={busy}
          >
            {copying ? 'Копирование…' : 'Скопировать приглашение'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleInvite}
            disabled={busy}
          >
            {submitting ? 'Сохранение…' : 'Пригласить'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export { copyTextToClipboard }
