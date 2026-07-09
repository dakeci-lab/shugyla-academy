import { Link, useParams } from 'react-router-dom'
import { getPublishedVacancyBySlug } from '../services/academyDataService'
import { getVacancyRoleLabel } from '../utils/recruitmentData'
import Header from '../components/Header'
import './Vacancies.css'

/** Публичная детальная страница вакансии — /vacancies/:slug */
export default function VacancyDetailPage() {
  const { slug } = useParams()
  const vacancy = slug ? getPublishedVacancyBySlug(slug) : null

  return (
    <div className="vacancies-page">
      <Header variant="landing" />

      <main className="vacancies-page__main container">
        {!vacancy ? (
          <div className="vacancies-page__empty">
            <h1>Вакансия недоступна или закрыта</h1>
            <Link to="/vacancies" className="btn btn--outline">
              ← К списку вакансий
            </Link>
          </div>
        ) : (
          <article className="vacancy-detail">
            <Link to="/vacancies" className="vacancy-detail__back">
              ← Все вакансии
            </Link>
            <h1 className="vacancy-detail__title">{vacancy.title}</h1>
            <p className="vacancy-detail__role">{getVacancyRoleLabel(vacancy.role)}</p>
            {vacancy.description && (
              <div className="vacancy-detail__description">{vacancy.description}</div>
            )}
            <Link to={`/apply/${vacancy.slug}`} className="btn btn--primary btn--lg">
              Заполнить анкету
            </Link>
          </article>
        )}
      </main>
    </div>
  )
}
