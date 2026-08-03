import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublishedVacanciesForApply } from '../services/publicApplyVacanciesService'
import { LOGIN_PATH } from '../router/authRoutes'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import Header from '../components/Header'
import './Vacancies.css'
import './Apply.css'

/** Публичный список вакансий — /vacancies */
export default function VacanciesPage() {
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

  return (
    <div className="vacancies-page">
      <Header variant="landing" />

      <main className="vacancies-page__main container">
        <div className="vacancies-page__header">
          <h1 className="vacancies-page__title">Вакансии Shugyla Market</h1>
          <p className="vacancies-page__subtitle">
            Открытые позиции — без авторизации можно просмотреть вакансию и заполнить анкету
          </p>
        </div>

        {loadState === 'loading' && (
          <div className="vacancies-page__empty" aria-busy="true">
            Загрузка вакансий…
          </div>
        )}

        {loadState === 'error' && (
          <div className="vacancies-page__empty" role="alert">
            <p>{error || 'Не удалось загрузить вакансии.'}</p>
            <button type="button" className="btn btn--primary" onClick={load}>
              Повторить
            </button>
          </div>
        )}

        {loadState === 'loaded' && vacancies.length === 0 ? (
          <div className="vacancies-page__empty">Сейчас нет открытых вакансий</div>
        ) : null}

        {loadState === 'loaded' && vacancies.length > 0 ? (
          <div className="vacancies-page__list">
            {vacancies.map((vacancy) => (
              <Link
                key={vacancy.id}
                to={`/vacancies/${vacancy.slug}`}
                className="vacancies-page__card"
              >
                <h2>{vacancy.title}</h2>
                <p>{vacancy.positionName}</p>
                {vacancy.description && (
                  <p className="vacancies-page__desc">{vacancy.description}</p>
                )}
                <span className="vacancies-page__cta">Подробнее →</span>
              </Link>
            ))}
          </div>
        ) : null}

        <p className="vacancies-page__login-hint">
          Сотрудникам:{' '}
          <Link to={LOGIN_PATH} className="vacancies-page__login-link">
            войти в Shugyla Platform
          </Link>
        </p>
      </main>
    </div>
  )
}
