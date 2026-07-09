import { Link } from 'react-router-dom'
import { getPublishedVacancies } from '../services/academyDataService'
import { getVacancyRoleLabel } from '../utils/recruitmentData'
import Header from '../components/Header'
import './Vacancies.css'
import './Apply.css'

/** Публичный список вакансий — /vacancies */
export default function VacanciesPage() {
  const vacancies = getPublishedVacancies()

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

        {vacancies.length === 0 ? (
          <div className="vacancies-page__empty">Сейчас нет открытых вакансий</div>
        ) : (
          <div className="vacancies-page__list">
            {vacancies.map((vacancy) => (
              <Link
                key={vacancy.id}
                to={`/vacancies/${vacancy.slug}`}
                className="vacancies-page__card"
              >
                <h2>{vacancy.title}</h2>
                <p>{getVacancyRoleLabel(vacancy.role)}</p>
                {vacancy.description && <p className="vacancies-page__desc">{vacancy.description}</p>}
                <span className="vacancies-page__cta">Подробнее →</span>
              </Link>
            ))}
          </div>
        )}

        <p className="vacancies-page__login-hint">
          Сотрудникам:{' '}
          <Link to="/login" className="vacancies-page__login-link">
            войти в Shugyla Platform
          </Link>
        </p>
      </main>
    </div>
  )
}
