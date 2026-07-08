import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getPublishedVacancyBySlug,
  getCandidateQuestions,
  submitCandidateApplication,
} from '../services/academyDataService'
import { getVacancyRoleLabel } from '../utils/recruitmentData'
import { isCloudMode } from '../lib/dataMode'
import {
  validateCandidatePhotoFile,
  ALLOWED_CANDIDATE_PHOTO_TYPES,
} from '../services/candidatePhotoService'
import '../components/admin/admin-shared.css'
import '../components/CandidateAvatar.css'
import './Apply.css'

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  phone: '',
  age: '',
  city: '',
  experience: '',
  previousWork: '',
  expectedSalary: '',
  availableFrom: '',
  about: '',
}

/** Публичная анкета кандидата — /apply/:slug */
export default function ApplyPage() {
  const { slug } = useParams()
  const vacancy = slug ? getPublishedVacancyBySlug(slug) : null
  const questions = vacancy ? getCandidateQuestions(vacancy.id) : []

  const [form, setForm] = useState(EMPTY_FORM)
  const [answers, setAnswers] = useState({})
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoWarning, setPhotoWarning] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview)
      }
    }
  }, [photoPreview])

  if (!slug || !vacancy) {
    return (
      <div className="apply-page">
        <div className="apply-page__card apply-page__closed">
          <h1>Вакансия недоступна или закрыта.</h1>
          <p>
            <Link to="/academy">← На главную Shugyla Academy</Link>
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
            <Link to="/academy">← На главную</Link>
          </p>
        </div>
      </div>
    )
  }

  function handlePhotoChange(e) {
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

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!form.firstName.trim()) {
      setError('Укажите имя')
      return
    }
    if (!form.phone.trim()) {
      setError('Укажите телефон')
      return
    }
    if (form.age && Number.isNaN(Number(form.age))) {
      setError('Возраст должен быть числом')
      return
    }

    for (const q of questions) {
      if (q.required && (answers[q.id] === undefined || answers[q.id] === '')) {
        setError(`Ответьте на обязательный вопрос: «${q.questionText}»`)
        return
      }
    }

    setSubmitting(true)
    try {
      const result = await submitCandidateApplication({
        vacancyId: vacancy.id,
        vacancySlug: vacancy.slug,
        ...form,
        answers,
        photoFile,
      })
      setSuccessMessage(result.message)
      if (result.localPhotoWarning) {
        setSuccessMessage(`${result.message} ${result.localPhotoWarning}`)
      }
      setSubmitted(true)
    } catch (err) {
      setError(err.message || 'Не удалось отправить анкету')
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
        </div>

        <section>
          <h2 className="apply-page__vacancy-title">{vacancy.title}</h2>
          <p className="apply-page__vacancy-desc">
            {getVacancyRoleLabel(vacancy.role)}
            {vacancy.description ? ` · ${vacancy.description}` : ''}
          </p>
        </section>

        <form className="admin-form" onSubmit={handleSubmit}>
          <section className="apply-form__section">
            <h3 className="apply-form__section-title">Данные кандидата</h3>
            <div className="admin-form__row">
              <label className="admin-form__label">
                Имя *
                <input className="admin-form__input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              </label>
              <label className="admin-form__label">
                Фамилия
                <input className="admin-form__input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </label>
            </div>
            <div className="admin-form__row">
              <label className="admin-form__label">
                Телефон *
                <input className="admin-form__input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              </label>
              <label className="admin-form__label">
                Возраст
                <input className="admin-form__input" type="number" min={16} max={99} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
              </label>
            </div>

            <div className="apply-photo-field">
              <label className="admin-form__label">
                Ваша фотография
                <input
                  className="admin-form__input"
                  type="file"
                  accept={ALLOWED_CANDIDATE_PHOTO_TYPES.join(',')}
                  onChange={handlePhotoChange}
                />
              </label>
              <p className="apply-photo-hint">
                Загрузите фото, чтобы мы могли быстрее узнать вас на собеседовании.
                JPEG, PNG или WebP, до 5 MB.
              </p>
              {photoWarning && <p className="apply-photo-warning">{photoWarning}</p>}
              {photoPreview && (
                <div className="apply-photo-preview">
                  <img src={photoPreview} alt="Превью фото" />
                </div>
              )}
            </div>

            <label className="admin-form__label">
              Город / район
              <input className="admin-form__input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </label>
            <label className="admin-form__label">
              Опыт работы
              <input className="admin-form__input" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} />
            </label>
            <label className="admin-form__label">
              Где раньше работал
              <input className="admin-form__input" value={form.previousWork} onChange={(e) => setForm({ ...form, previousWork: e.target.value })} />
            </label>
            <div className="admin-form__row">
              <label className="admin-form__label">
                Ожидаемая зарплата
                <input className="admin-form__input" value={form.expectedSalary} onChange={(e) => setForm({ ...form, expectedSalary: e.target.value })} />
              </label>
              <label className="admin-form__label">
                Когда готов выйти
                <input className="admin-form__input" value={form.availableFrom} onChange={(e) => setForm({ ...form, availableFrom: e.target.value })} />
              </label>
            </div>
            <label className="admin-form__label">
              О себе
              <textarea className="admin-form__input" rows={3} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} />
            </label>
          </section>

          {questions.length > 0 && (
            <section className="apply-form__section">
              <h3 className="apply-form__section-title">Фильтр-вопросы</h3>
              {questions.map((q, index) => (
                <div key={q.id} className="apply-form__question">
                  <p className="apply-form__question-text">
                    {index + 1}. {q.questionText}
                    {q.required && ' *'}
                  </p>
                  <div className="apply-form__options">
                    {q.options.map((option, optionIndex) => (
                      <label key={optionIndex} className="apply-form__option">
                        <input
                          type="radio"
                          name={`question-${q.id}`}
                          value={optionIndex}
                          checked={String(answers[q.id]) === String(optionIndex)}
                          onChange={() => setAnswers({ ...answers, [q.id]: optionIndex })}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {error && <p className="admin-form__error">{error}</p>}

          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Отправка…' : 'Отправить анкету'}
          </button>
        </form>
      </div>
    </div>
  )
}
