import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  INTERVIEW_SALUTATION_OPTIONS,
  buildInterviewInvitationText,
  validateInterviewInviteForm,
} from '../../utils/recruitmentData'
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
  return {
    salutation: candidate?.interviewSalutation || 'neutral',
    candidateName: candidate?.firstName || candidate?.fullName || '',
    date: candidate?.interviewDate || '',
    time: candidate?.interviewTime || '',
    address: candidate?.interviewAddress || '',
    comment: candidate?.interviewComment || '',
  }
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

  useEffect(() => {
    setForm(buildInitialForm(candidate))
    setErrors({})
    setSubmitError('')
  }, [candidate])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
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

  async function handleSubmit() {
    const validationErrors = validateInterviewInviteForm(form)
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
            ×
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
            <input
              className="admin-form__input"
              value={form.candidateName}
              readOnly
            />
          </label>

          <div className="admin-form__row">
            <label className="admin-form__label">
              Дата собеседования *
              <input
                type="date"
                className="admin-form__input"
                value={form.date}
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
            <input
              className="admin-form__input"
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

          <div>
            <p className="admin-form__hint" style={{ marginBottom: '0.5rem' }}>
              Текст сообщения для WhatsApp
            </p>
            <pre className="interview-invite-preview">{previewText}</pre>
          </div>

          {submitError && <p className="admin-form__error">{submitError}</p>}
        </div>

        <div className="interview-invite-modal__footer">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={submitting}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Сохранение…' : 'Скопировать и отметить приглашённым'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export { copyTextToClipboard }
