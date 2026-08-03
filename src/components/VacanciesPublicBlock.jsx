import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublishedVacanciesForApply } from '../services/publicApplyVacanciesService'

/** Блок опубликованных вакансий для публичных поверхностей */
export default function VacanciesPublicBlock() {
  const [vacancies, setVacancies] = useState([])

  const load = useCallback(async () => {
    try {
      const rows = await fetchPublishedVacanciesForApply()
      setVacancies(rows)
    } catch {
      setVacancies([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (vacancies.length === 0) return null

  return (
    <section className="vacancies-public-block">
      <h2>Открытые вакансии</h2>
      <ul>
        {vacancies.map((v) => (
          <li key={v.id}>
            <Link to={`/apply/${v.slug}`}>{v.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
