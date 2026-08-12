import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { submitPublicCandidateApplication } from '../services/publicApplySubmitService'
import { fetchPublicVacancyApplicationForm } from '../services/publicApplyFormService'
import {
  validateCandidatePhotoFile,
  prepareCandidatePhotoForSubmit,
  cancelCandidatePhotoUploadSession,
} from '../services/candidatePhotoService'
import { isCloudMode } from '../lib/dataMode'
import { APPLICATION_QUESTION_TYPES, mapApplicationFormRpcError } from '../utils/applicationForm'
import { getPublicVacancyDisplay } from '../utils/careersVacancyDisplay'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import { kzPhoneTailToDisplay, validateKzPhoneTail } from '../utils/kzPhone'
import {
  getOrCreateApplicationSubmissionKey,
  clearApplicationSubmissionKey,
} from '../utils/applicationSubmissionKey'
import { useLanguage } from '../context/LanguageContext'
import DynamicApplicationForm from '../components/apply/DynamicApplicationForm'
import { getCareersHomePath } from '../router/hostSurface'
import '../components/admin/admin-shared.css'
import '../components/CandidateAvatar.css'
import './Apply.css'

function emptyValues(questions) {
  const values = {}
  for (const q of questions || []) {
    values[q.id] = q.questionType === 'multi_choice' ? [] : q.questionType === 'yes_no' ? null : ''
  }
  return values
}

/** Публичная анкета кандидата — /apply/:slug */
export default function ApplyPage() {
  const { slug } = useParams()
  const location = useLocation()
  const { t } = useLanguage()
  const hubPath = `${getCareersHomePath()}${location.search || ''}`

  const [loadState, setLoadState] = useState('loading')
  const [vacancy, setVacancy] = useState(null)
  const [questions, setQuestions] = useState([])
  const [formVersion, setFormVersion] = useState(1)
  const [values, setValues] = useState({})
  const [fieldErrors, setFieldErrors] = useState({})
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoWarning, setPhotoWarning] = useState('')
  const [photoQuestionId, setPhotoQuestionId] = useState(null)
  const [photoUploadId, setPhotoUploadId] = useState(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [consentGiven, setConsentGiven] = useState(false)

  const hasUnknownType = useMemo(
    () => (questions || []).some((q) => !APPLICATION_QUESTION_TYPES.includes(q.questionType)),
    [questions]
  )

  const display = getPublicVacancyDisplay(vacancy || {})

  useEffect(() => {
    if (!vacancy?.title) return undefined
    const prev = document.title
    document.title = `${vacancy.title} — Shugyla Market`
    return () => {
      document.title = prev
    }
  }, [vacancy?.title])

  useEffect(() => {
    if (!slug) {
      setLoadState('missing')
      return undefined
    }

    let cancelled = false
    setLoadState('loading')
    setError('')
    setSubmitted(false)
    setConsentGiven(false)

    fetchPublicVacancyApplicationForm(slug)
      .then((form) => {
        if (cancelled) return
        setVacancy(form.vacancy)
        setQuestions(form.questions)
        setFormVersion(form.formVersion)
        setValues(emptyValues(form.questions))
        setPhotoQuestionId(form.questions.find((q) => q.questionType === 'photo')?.id || null)
        setLoadState('loaded')
      })
      .catch((err) => {
        if (cancelled) return
        if (err?.code === 'vacancy_not_found' || err?.message === 'vacancy_not_found') {
          setVacancy(null)
          setLoadState('missing')
          return
        }
        console.error('[Apply] Не удалось загрузить анкету', err)
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview)
      }
    }
  }, [photoPreview])

  if (loadState === 'loading') {
    return (
      <div className="apply-page">
        <div className="apply-page__card apply-page__closed">
          <p className="apply-page__brand-title">Shugyla Market</p>
          <h1>{t.careersLoading}</h1>
        </div>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="apply-page">
        <div className="apply-page__card apply-page__closed">
          <p className="apply-page__brand-title">Shugyla Market</p>
          <h1>{t.careersLoadErrorTitle}</h1>
          <p>{t.careersLoadError}</p>
          <p>
            <Link to={hubPath} className="btn btn--outline">
              {t.careersBackToVacancies}
            </Link>
          </p>
        </div>
      </div>
    )
  }

  if (loadState === 'missing' || !slug || !vacancy) {
    return (
      <div className="apply-page">
        <div className="apply-page__card apply-page__closed">
          <p className="apply-page__brand-title">Shugyla Market</p>
          <h1>{t.careersClosedTitle}</h1>
          <p>
            <Link to={hubPath} className="btn btn--primary">
              {t.careersClosedCta}
            </Link>
          </p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="apply-page">
        <div className="apply-page__card apply-page__success">
          <p className="apply-page__brand-title">Shugyla Market</p>
          <h1 className="apply-page__success-title">{t.careersSuccessTitle}</h1>
          <p>{successMessage}</p>
          <p>
            <Link to={hubPath} className="btn btn--outline">
              {t.careersClosedCta}
            </Link>
          </p>
        </div>
      </div>
    )
  }

  function handleValueChange(questionId, value) {
    setValues((prev) => ({ ...prev, [questionId]: value }))
    setFieldErrors((prev) => {
      if (!prev[questionId]) return prev
      const next = { ...prev }
      delete next[questionId]
      return next
    })
  }

  async function clearPhotoSelection() {
    if (photoUploadId) {
      await cancelCandidatePhotoUploadSession(photoUploadId)
    }
    setPhotoUploadId(null)
    setPhotoFile(null)
    if (photoPreview && photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview)
    }
    setPhotoPreview('')
    setPhotoWarning('')
  }

  async function handlePhotoChange(_questionId, e) {
    const file = e.target.files?.[0]
    setError('')
    setPhotoWarning('')

    if (!file) {
      await clearPhotoSelection()
      return
    }

    const validationError = validateCandidatePhotoFile(file)
    if (validationError) {
      setError(validationError)
      e.target.value = ''
      return
    }

    if (photoPreview && photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview)
    }
    if (photoUploadId) {
      await cancelCandidatePhotoUploadSession(photoUploadId)
      setPhotoUploadId(null)
    }

    const nextPreview = URL.createObjectURL(file)
    setPhotoFile(file)
    setPhotoPreview(nextPreview)

    if (!isCloudMode()) {
      setPhotoWarning('В локальном режиме фото не сохраняется постоянно.')
      return
    }

    setPhotoUploading(true)
    try {
      const uploaded = await prepareCandidatePhotoForSubmit(file, {
        vacancyId: vacancy.id,
        formVersion,
      })
      setPhotoUploadId(uploaded.photoUploadId || null)
    } catch (err) {
      setPhotoFile(null)
      URL.revokeObjectURL(nextPreview)
      setPhotoPreview('')
      e.target.value = ''
      setError(
        mapApplicationFormRpcError(err) ||
          err?.message ||
          'Не удалось загрузить фото. Попробуйте ещё раз.'
      )
    } finally {
      setPhotoUploading(false)
    }
  }

  function validateClient() {
    const nextErrors = {}
    for (const q of questions) {
      if (!APPLICATION_QUESTION_TYPES.includes(q.questionType)) {
        nextErrors[q.id] = 'Неизвестный тип вопроса'
        continue
      }
      if (!q.required) continue
      const value = values[q.id]
      if (q.questionType === 'photo') {
        if (isCloudMode() ? !photoUploadId : !photoFile) {
          nextErrors[q.id] = 'Загрузите фотографию'
        }
      } else if (q.questionType === 'phone' || q.fieldBinding === 'phone') {
        const phoneError = validateKzPhoneTail(value)
        if (phoneError) nextErrors[q.id] = phoneError
      } else if (q.questionType === 'multi_choice') {
        if (!Array.isArray(value) || value.length === 0) nextErrors[q.id] = 'Выберите вариант'
      } else if (q.questionType === 'yes_no') {
        if (value !== true && value !== false) nextErrors[q.id] = 'Выберите ответ'
      } else if (value == null || String(value).trim() === '') {
        nextErrors[q.id] = 'Обязательное поле'
      }
    }
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting || photoUploading) return
    setError('')

    if (hasUnknownType) {
      setError('Анкета содержит неизвестный тип вопроса. Обновите страницу.')
      return
    }
    if (!consentGiven) {
      setError(t.careersConsentRequired)
      return
    }
    if (!validateClient()) {
      setError('Заполните обязательные поля')
      return
    }
    if (photoQuestionId && isCloudMode() && photoFile && !photoUploadId) {
      setError('Загрузка фото не завершена. Подождите или выберите файл снова.')
      return
    }

    setSubmitting(true)
    try {
      const answers = {}
      for (const q of questions) {
        if (q.questionType === 'photo') continue
        answers[q.id] =
          q.questionType === 'phone' || q.fieldBinding === 'phone'
            ? kzPhoneTailToDisplay(values[q.id])
            : values[q.id]
      }

      const submissionKey = getOrCreateApplicationSubmissionKey(vacancy.id)

      const result = await submitPublicCandidateApplication({
        vacancyId: vacancy.id,
        vacancySlug: vacancy.slug,
        formVersion,
        answers,
        photoUploadId: photoQuestionId ? photoUploadId : null,
        photoFile: null,
        submissionKey,
      })

      clearApplicationSubmissionKey(vacancy.id)

      setSuccessMessage(
        result.message ||
          'Анкета успешно отправлена. Мы свяжемся с вами после рассмотрения.'
      )
      if (result.localPhotoWarning) {
        setSuccessMessage(
          `${result.message || 'Анкета успешно отправлена.'} ${result.localPhotoWarning}`
        )
      }
      setSubmitted(true)
    } catch (err) {
      const mapped = mapApplicationFormRpcError(err) || mapApplicationFormRpcError({ message: err?.message })
      setError(mapped || toUserErrorMessage(err, 'Не удалось отправить анкету. Попробуйте ещё раз.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="apply-page">
      <div className="apply-page__card">
        <div className="apply-page__brand">
          <p className="apply-page__brand-title">Shugyla Market</p>
          <p className="apply-page__brand-sub">{t.careersFormLabel}</p>
          <p className="apply-page__brand-sub">
            <Link to={hubPath}>{t.careersBackToVacancies}</Link>
          </p>
        </div>

        <section>
          <h1 className="apply-page__vacancy-title">{display.title}</h1>
          {display.positionName ? (
            <p className="apply-page__vacancy-position">{display.positionName}</p>
          ) : null}
          {display.description ? (
            <p className="apply-page__vacancy-desc">{display.description}</p>
          ) : null}
        </section>

        <form className="careers-apply-form" onSubmit={handleSubmit}>
          <section className="apply-form__section">
            <h2 className="apply-form__section-title">{t.careersFormSection}</h2>
            <DynamicApplicationForm
              questions={questions}
              values={values}
              errors={fieldErrors}
              onChange={handleValueChange}
              onPhotoChange={handlePhotoChange}
              photoPreview={photoPreview}
              photoWarning={photoUploading ? t.careersPhotoUploading : photoWarning}
              disabled={submitting || photoUploading}
            />
          </section>

          <label className="careers-consent">
            <input
              type="checkbox"
              checked={consentGiven}
              required
              disabled={submitting || photoUploading}
              onChange={(event) => {
                setConsentGiven(event.target.checked)
                if (event.target.checked && error === t.careersConsentRequired) {
                  setError('')
                }
              }}
            />
            <span>{t.careersConsent} *</span>
          </label>

          {error && <p className="careers-apply-form__error">{error}</p>}

          <button
            type="submit"
            className="btn btn--primary careers-apply-form__submit"
            disabled={submitting || photoUploading || hasUnknownType || !consentGiven}
          >
            {photoUploading
              ? t.careersPhotoUploading
              : submitting
                ? t.careersSubmitting
                : t.careersSubmit}
          </button>
        </form>
      </div>
    </div>
  )
}
