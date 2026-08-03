import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchPublishedVacanciesForApply } from '../services/publicApplyVacanciesService'
import { getPublicVacancyDisplay } from '../utils/careersVacancyDisplay'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import { useLanguage } from '../context/LanguageContext'
import './Apply.css'
import './ApplyHub.css'

/** Публичная детальная страница вакансии — /vacancies/:slug */
export default function VacancyDetailPage() {
  const { slug } = useParams()
  const { t } = useLanguage()
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
      setVacancy(rows.find((row) => row.slug === slug) || null)
      setLoadState('loaded')
    } catch (err) {
      setVacancy(null)
      setError(toUserErrorMessage(err, t.careersLoadError))
      setLoadState('error')
    }
  }, [slug, t.careersLoadError])

  useEffect(() => {
    load()
  }, [load])

  const display = getPublicVacancyDisplay(vacancy || {})

  return (
    <div className="apply-page">
      <main className="apply-page__card">
        {loadState === 'loading' && (
          <div className="apply-page__closed" aria-busy="true">
            <p>{t.careersLoading}</p>
          </div>
        )}

        {loadState === 'error' && (
          <div className="apply-page__closed" role="alert">
            <p>{error || t.careersLoadError}</p>
            <button type="button" className="btn btn--primary" onClick={load}>
              {t.careersRetry}
            </button>
          </div>
        )}

        {loadState === 'loaded' && !vacancy ? (
          <div className="apply-page__closed">
            <h1>{t.careersClosedTitle}</h1>
            <Link to="/apply" className="btn btn--primary">
              {t.careersClosedCta}
            </Link>
          </div>
        ) : null}

        {loadState === 'loaded' && vacancy ? (
          <article>
            <p className="apply-page__brand-sub">
              <Link to="/vacancies">{t.careersBackToVacancies}</Link>
            </p>
            <h1 className="apply-page__vacancy-title">{display.title}</h1>
            {display.positionName ? (
              <p className="apply-page__vacancy-position">{display.positionName}</p>
            ) : null}
            {display.description ? (
              <p className="apply-page__vacancy-desc">{display.description}</p>
            ) : null}
            <Link to={`/apply/${vacancy.slug}`} className="btn btn--primary btn--lg">
              {t.careersApplyCta}
            </Link>
          </article>
        ) : null}
      </main>
    </div>
  )
}
