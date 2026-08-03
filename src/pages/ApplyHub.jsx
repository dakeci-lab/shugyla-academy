import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Header from '../components/Header'
import { fetchPublishedVacanciesForApply } from '../services/publicApplyVacanciesService'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import './Apply.css'
import './ApplyHub.css'

/** Единая публичная страница трудоустройства — /apply */
export default function ApplyHubPage() {
  const location = useLocation()
  const [vacancies, setVacancies] = useState([])
  const [loadState, setLoadState] = useState('loading')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoadState('loading')
    setError('')
    try {
      const rows = await fetchPublishedVacanciesForApply()
      setVacancies(rows)
      setLoadState('loaded')
    } catch (err) {
      setVacancies([])
      setError(
        toUserErrorMessage(
          err,
          'Не удалось загрузить вакансии. Проверьте интернет и попробуйте ещё раз.'
        )
      )
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function applyPathForSlug(slug) {
    const search = location.search || ''
    return `/apply/${encodeURIComponent(slug)}${search}`
  }

  return (
    <div className="apply-hub-page">
      <Header variant="landing" />

      <main className="apply-hub-page__main container">
        <header className="apply-hub-page__header">
          <p className="apply-hub-page__brand">Shugyla Market</p>
          <h1 className="apply-hub-page__title">Работа в Shugyla</h1>
          <p className="apply-hub-page__lead">
            Выберите вакансию, на которую хотите подать анкету.
          </p>
        </header>

        {loadState === 'loading' && (
          <div className="apply-hub-page__state" aria-busy="true" aria-live="polite">
            <div className="apply-hub-page__skeleton" />
            <div className="apply-hub-page__skeleton" />
            <p className="apply-hub-page__state-text">Загрузка вакансий…</p>
          </div>
        )}

        {loadState === 'error' && (
          <div className="apply-hub-page__state" role="alert">
            <h2 className="apply-hub-page__state-title">Не удалось загрузить вакансии</h2>
            <p className="apply-hub-page__state-text">
              {error ||
                'Не удалось загрузить вакансии. Проверьте интернет и попробуйте ещё раз.'}
            </p>
            <button type="button" className="btn btn--primary" onClick={load}>
              Повторить
            </button>
          </div>
        )}

        {loadState === 'loaded' && vacancies.length === 0 && (
          <div className="apply-hub-page__state" role="status">
            <h2 className="apply-hub-page__state-title">Сейчас открытых вакансий нет</h2>
            <p className="apply-hub-page__state-text">
              Следите за нашими объявлениями. Новые вакансии появятся на этой странице.
            </p>
          </div>
        )}

        {loadState === 'loaded' && vacancies.length > 0 && (
          <ul className="apply-hub-page__list">
            {vacancies.map((vacancy) => (
              <li key={vacancy.id} className="apply-hub-card">
                <div className="apply-hub-card__body">
                  <h2 className="apply-hub-card__title">{vacancy.title}</h2>
                  {vacancy.positionName ? (
                    <p className="apply-hub-card__position">{vacancy.positionName}</p>
                  ) : null}
                  {vacancy.description ? (
                    <p className="apply-hub-card__desc">{vacancy.description}</p>
                  ) : null}
                </div>
                <Link
                  className="btn btn--primary apply-hub-card__cta"
                  to={applyPathForSlug(vacancy.slug)}
                >
                  Заполнить анкету
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
