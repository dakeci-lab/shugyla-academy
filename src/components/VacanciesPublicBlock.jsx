import { Link } from 'react-router-dom'
import { getPublishedVacancies } from '../services/academyDataService'
import { getVacancyRoleLabel } from '../utils/recruitmentData'
import '../pages/Apply.css'

/** Блок вакансий на главной странице */
export default function VacanciesPublicBlock() {
  const vacancies = getPublishedVacancies()

  if (!vacancies.length) return null

  return (
    <section className="vacancies-public container">
      <h2 className="academy-page__heading">Работа в Shugyla Market</h2>
      <p className="academy-page__subheading">Открытые вакансии — заполните анкету онлайн</p>
      <div className="vacancies-public__list">
        {vacancies.map((vacancy) => (
          <Link key={vacancy.id} to={`/vacancies/${vacancy.slug}`} className="vacancies-public__link">
            <strong>{vacancy.title}</strong>
            <span> · {getVacancyRoleLabel(vacancy.role)}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
