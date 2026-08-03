import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchPublishedVacanciesForApply } from '../services/publicApplyVacanciesService'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import Header from '../components/Header'
import './Vacancies.css'

/** Публичная детальная страница вакансии — /vacancies/:slug */
export default function VacancyDetailPage() {
  const { slug } = useParams()
  const [vacancy, setVacancy] = useState(null)
  const [loadState, setLoadState] = useState('loading')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!slug) {
      setVacancy(null)
      setLoadState('loaded')
      return
    }
    setLoadState('loading')
    setError('')
    try {
      const rows = await fetchPublishedVacanciesForApply()
      const match = rows.find((row) => row.slug === slug) || null
      setVacancy(match)
      setLoadState('loaded')
    } catch (err) {
      setVacancy(null)
      setError(
        toUserErrorMessage(
          err,
          'Не удалось загрузить вакансию. Проверьте интернет и попробуйте ещё раз.'
        )
      )
      setLoadState('error')
    }
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="vacancies-page">
      <Header variant="landing" />

      <main className="vacancies-page__main container">
        {loadState === 'loading' && (
          <div className="vacancies-page__empty" aria-busy="true">
            Загрузка…
          </div>
        )}

        {loadState === 'error' && (
          <div className="vacancies-page__empty" role="alert">
            <p>{error || 'Не удалось загрузить вакансию.'}</p>
            <button type="button" className="btn btn--primary" onClick={load}>
              Повторить
            </button>
          </div>
        )}

        {loadState === 'loaded' && !vacancy ? (
          <div className="vacancies-page__empty">
            <h1>Вакансия недоступна или закрыта</h1>
            <Link to="/vacancies" className="btn btn--outline">
              ← К списку вакансий
            </Link>
          </div>
        ) : null}

        {loadState === 'loaded' && vacancy ? (
          <article className="vacancy-detail">
            <Link to="/vacancies" className="vacancy-detail__back">
              ← Все вакансии
            </Link>
            <h1 className="vacancy-detail__title">{vacancy.title}</h1>
            <p className="vacancy-detail__role">{vacancy.positionName}</p>
            {vacancy.description && (
              <div className="vacancy-detail__description">{vacancy.description}</div>
            )}
            <Link to={`/apply/${vacancy.slug}`} className="btn btn--primary btn--lg">
              Заполнить анкету
            </Link>
          </article>
        ) : null}
      </main>
    </div>
  )
}
