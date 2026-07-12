import { useState } from 'react'
import VacanciesSection from './VacanciesSection'
import CandidatesSection from './CandidatesSection'
import '../admin-shared.css'

const TABS = [
  { id: 'vacancies', label: 'Вакансии' },
  { id: 'candidates', label: 'Кандидаты' },
]

/** Раздел «Найм» с вкладками — legacy /admin */
export default function RecruitmentSection() {
  const [tab, setTab] = useState('vacancies')

  return (
    <>
      <div className="admin-filter-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`admin-filter-tab ${tab === item.id ? 'admin-filter-tab--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'vacancies' && <VacanciesSection />}
      {tab === 'candidates' && <CandidatesSection />}
    </>
  )
}
