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
import {
  getPublicVacancyDisplay,
  getPublicVacancyFacts,
} from '../utils/careersVacancyDisplay'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import { kzPhoneTailToDisplay, validateKzPhoneTail } from '../utils/kzPhone'
import {
  getOrCreateApplicationSubmissionKey,
  clearApplicationSubmissionKey,
} from '../utils/applicationSubmissionKey'
import { useLanguage } from '../context/LanguageContext'
import DynamicApplicationForm from '../components/apply/DynamicApplicationForm'
import { getCareersHomePath } from '../router/hostSurface'
import iconSunmark from '../assets/brand/logo/icon-sunmark-on-white.png'
import patternTile from '../assets/brand/pattern/pattern-tile.svg'
import photoStoreFacade from '../assets/brand/photos/photo-store-facade.jpg'
import CareersPhoto from '../components/careers/CareersPhoto'
import '../components/careers/CareersPhoto.css'
import '../components/admin/admin-shared.css'
import '../components/CandidateAvatar.css'
import './Apply.css'

const APPLY_FORM_ID = 'careers-apply-form'

function emptyValues(questions) {
  const values = {}
  for (const q of questions || []) {
    values[q.id] = q.questionType === 'multi_choice' ? [] : q.questionType === 'yes_no' ? null : ''
  }
  return values
}

function BackChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

function GalleryPlaceholder({ label }) {
  return (
    <div className="apply-success__ph" aria-hidden="true">
      <span
        className="apply-success__ph-pattern"
        style={{ backgroundImage: `url(${patternTile})` }}
      />
      <div className="apply-success__ph-inner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <circle cx="9" cy="10" r="2" />
          <path d="M21 16.5l-5.2-5.2a2 2 0 0 0-2.8 0L4 20" />
        </svg>
        <span>{label}</span>
      </div>
    </div>
  )
}

/** Публичная анкета кандидата — /apply/:slug */
export default function ApplyPage() {
  const { slug } = useParams()
  const location = useLocation()
  const { t, lang } = useLanguage()
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
  const sideFacts = useMemo(
    () =>
      getPublicVacancyFacts(vacancy || {}, t, lang).filter((fact) =>
        ['city', 'employment', 'schedule', 'salary', 'store'].includes(fact.key)
      ),
    [vacancy, t, lang]
  )

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
        <div className="apply-page__state">
          <p className="apply-page__brand-title">Shugyla Market</p>
          <h1>{t.careersLoading}</h1>
        </div>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="apply-page">
        <div className="apply-page__state">
          <p className="apply-page__brand-title">Shugyla Market</p>
          <h1>{t.careersLoadErrorTitle}</h1>
          <p>{t.careersLoadError}</p>
          <Link to={hubPath} className="apply-page__btn apply-page__btn--outline">
            {t.careersAllVacanciesLink}
          </Link>
        </div>
      </div>
    )
  }

  if (loadState === 'missing' || !slug || !vacancy) {
    return (
      <div className="apply-page">
        <div className="apply-page__state">
          <p className="apply-page__brand-title">Shugyla Market</p>
          <h1>{t.careersClosedTitle}</h1>
          <Link to={hubPath} className="apply-page__btn">
            {t.careersClosedCta}
          </Link>
        </div>
      </div>
    )
  }

  if (submitted) {
    const gallery = [
      t.careersSuccessGalleryHall,
      t.careersSuccessGalleryFacade,
      t.careersSuccessGalleryShelves,
      t.careersSuccessGalleryTeam,
    ]
    return (
      <div className="apply-page apply-page--success">
        <div className="apply-success">
          <div className="apply-success__hero">
            <div className="apply-success__icon" aria-hidden="true">
              <span className="apply-success__ring" />
              <img className="apply-success__sun" src={iconSunmark} alt="" width={72} height={72} />
              <span className="apply-success__check">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M4 12.5l5 5L20 6.5" />
                </svg>
              </span>
            </div>
            <h1 className="apply-success__heading">{t.careersSuccessHeading}</h1>
            <p className="apply-success__lead">{successMessage || t.careersSuccessLead}</p>
            <Link to={hubPath} className="apply-page__btn">
              {t.careersSuccessBack}
            </Link>
          </div>
          <div className="apply-success__gallery" aria-hidden="true">
            {gallery.map((label) => (
              <GalleryPlaceholder key={label} label={label} />
            ))}
          </div>
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
          t.careersSuccessLead
      )
      if (result.localPhotoWarning) {
        setSuccessMessage(
          `${result.message || t.careersSuccessTitle}. ${result.localPhotoWarning}`
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

  const submitDisabled = submitting || photoUploading || hasUnknownType || !consentGiven
  const submitLabel = photoUploading
    ? t.careersPhotoUploading
    : submitting
      ? t.careersSubmitting
      : t.careersSubmit

  return (
    <div className="apply-page">
      <div className="apply-page__shell">
        <Link to={hubPath} className="apply-page__back">
          <BackChevron />
          {t.careersAllVacanciesLink}
        </Link>

        <div className="apply-page__grid">
          <div className="apply-page__primary">
            <header className="apply-page__intro">
              <h1 className="apply-page__vacancy-title">{display.title}</h1>
              <p className="apply-page__lead">{t.careersFormLead}</p>
            </header>

            <form id={APPLY_FORM_ID} className="careers-apply-form" onSubmit={handleSubmit}>
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

              <div className="apply-page__trust">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
                  <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                </svg>
                <span>{t.careersFormTrust}</span>
              </div>

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
                className="apply-page__btn careers-apply-form__submit apply-page__submit--desktop"
                disabled={submitDisabled}
              >
                {submitLabel}
              </button>
            </form>
          </div>

          <aside className="apply-page__aside">
            {(display.positionName || display.title || sideFacts.length > 0) && (
              <div className="apply-page__side-card">
                <h2 className="apply-page__side-title">{t.careersVacancyAboutTitle}</h2>
                <ul>
                  <li>{display.positionName || display.title}</li>
                  {sideFacts.map((fact) => (
                    <li key={fact.key}>
                      <span className="apply-page__side-label">{fact.label}</span>
                      {fact.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <CareersPhoto
              src={photoStoreFacade}
              alt={t.careersVacancyStorePhotoLabel}
              className="apply-page__aside-ph"
            />
          </aside>
        </div>
      </div>

      <div className="apply-page__sticky-cta sticky-cta">
        <button
          type="submit"
          form={APPLY_FORM_ID}
          className="apply-page__btn apply-page__btn--block"
          disabled={submitDisabled}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
