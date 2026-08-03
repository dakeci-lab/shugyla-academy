import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { submitCandidateApplication } from '../services/platformDataService'
import { fetchPublicVacancyApplicationForm } from '../services/publicApplyFormService'
import { validateCandidatePhotoFile } from '../services/candidatePhotoService'
import { isCloudMode } from '../lib/dataMode'
import { APPLICATION_QUESTION_TYPES, mapApplicationFormRpcError } from '../utils/applicationForm'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import DynamicApplicationForm from '../components/apply/DynamicApplicationForm'
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
  const hubPath = `/apply${location.search || ''}`

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
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const hasUnknownType = useMemo(
    () => (questions || []).some((q) => !APPLICATION_QUESTION_TYPES.includes(q.questionType)),
    [questions]
  )

  useEffect(() => {
    if (!slug) {
      setLoadState('missing')
      return undefined
    }

    let cancelled = false
    setLoadState('loading')
    setError('')
    setSubmitted(false)

    fetchPublicVacancyApplicationForm(slug)
      .then((form) => {
        if (cancelled) return
        setVacancy(form.vacancy)
        setQuestions(form.questions)
        setFormVersion(form.formVersion)
        setValues(emptyValues(form.questions))
        setPhotoQuestionId(
          form.questions.find((q) => q.questionType === 'photo')?.id || null
        )
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
          <h1>Загрузка анкеты…</h1>
        </div>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="apply-page">
        <div className="apply-page__card apply-page__closed">
          <h1>Не удалось загрузить анкету</h1>
          <p>Попробуйте обновить страницу или вернитесь позже.</p>
          <p>
            <Link to={hubPath}>← Все вакансии</Link>
          </p>
        </div>
      </div>
    )
  }

  if (loadState === 'missing' || !slug || !vacancy) {
    return (
      <div className="apply-page">
        <div className="apply-page__card apply-page__closed">
          <h1>Эта вакансия больше недоступна.</h1>
          <p>Посмотрите актуальный список открытых вакансий.</p>
          <p>
            <Link to={hubPath} className="btn btn--primary">
              Посмотреть открытые вакансии
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
          <h1 className="apply-page__success-title">Анкета отправлена</h1>
          <p>{successMessage}</p>
          <p>
            <Link to={hubPath} className="btn btn--outline">
              Вернуться к вакансиям
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

  function handlePhotoChange(_questionId, e) {
    const file = e.target.files?.[0]
    setError('')
    setPhotoWarning('')

    if (!file) {
      setPhotoFile(null)
      if (photoPreview && photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview)
      }
      setPhotoPreview('')
      return
    }

    const validationError = validateCandidatePhotoFile(file)
    if (validationError) {
      setError(validationError)
      e.target.value = ''
      return
    }

    if (!isCloudMode()) {
      setPhotoWarning('В локальном режиме фото не сохраняется постоянно.')
    }

    if (photoPreview && photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview)
    }

    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
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
        if (!photoFile) nextErrors[q.id] = 'Загрузите фотографию'
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
    if (submitting) return
    setError('')

    if (hasUnknownType) {
      setError('Анкета содержит неизвестный тип вопроса. Обновите страницу.')
      return
    }
    if (!validateClient()) {
      setError('Заполните обязательные поля')
      return
    }

    setSubmitting(true)
    try {
      const answers = {}
      for (const q of questions) {
        if (q.questionType === 'photo') continue
        answers[q.id] = values[q.id]
      }

      const result = await submitCandidateApplication({
        vacancyId: vacancy.id,
        vacancySlug: vacancy.slug,
        formVersion,
        answers,
        photoFile: photoQuestionId ? photoFile : null,
      })

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
          <h1 className="apply-page__brand-title">Shugyla Market</h1>
          <p className="apply-page__brand-sub">Анкета кандидата</p>
          <p className="apply-page__brand-sub">
            <Link to={hubPath}>← Все вакансии</Link>
          </p>
        </div>

        <section>
          <h2 className="apply-page__vacancy-title">{vacancy.title}</h2>
          <p className="apply-page__vacancy-desc">
            {vacancy.positionName || ''}
            {vacancy.description ? ` · ${vacancy.description}` : ''}
          </p>
        </section>

        <form className="admin-form" onSubmit={handleSubmit}>
          <section className="apply-form__section">
            <h3 className="apply-form__section-title">Данные кандидата</h3>
            <DynamicApplicationForm
              questions={questions}
              values={values}
              errors={fieldErrors}
              onChange={handleValueChange}
              onPhotoChange={handlePhotoChange}
              photoPreview={photoPreview}
              photoWarning={photoWarning}
              disabled={submitting}
            />
          </section>

          {error && <p className="admin-form__error">{error}</p>}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={submitting || hasUnknownType}
          >
            {submitting ? 'Отправка…' : 'Отправить анкету'}
          </button>
        </form>
      </div>
    </div>
  )
}
