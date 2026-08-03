import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchPublishedVacanciesForApply } from '../services/publicApplyVacanciesService'
import { getPublicVacancyDisplay } from '../utils/careersVacancyDisplay'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import { useLanguage } from '../context/LanguageContext'
import './Apply.css'
import './ApplyHub.css'

/** Единая публичная страница трудоустройства — /apply */
export default function ApplyHubPage() {
  const location = useLocation()
  const { t } = useLanguage()
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
      setError(toUserErrorMessage(err, t.careersLoadError))
      setLoadState('error')
    }
  }, [t.careersLoadError])

  useEffect(() => {
    load()
  }, [load])

  function applyPathForSlug(slug) {
    const search = location.search || ''
    return `/apply/${encodeURIComponent(slug)}${search}`
  }

  return (
    <div className="apply-hub-page">
      <main className="apply-hub-page__main container">
        <header className="apply-hub-page__hero">
          <p className="apply-hub-page__brand">Shugyla Market</p>
          <h1 className="apply-hub-page__title">{t.careersHeroTitle}</h1>
          <p className="apply-hub-page__lead">{t.careersHeroLead}</p>
          <p className="apply-hub-page__note">{t.careersHeroNote}</p>
        </header>

        <section className="apply-hub-page__section" aria-labelledby="careers-open-heading">
          <h2 id="careers-open-heading" className="apply-hub-page__section-title">
            {t.careersOpenTitle}
          </h2>
          <p className="apply-hub-page__section-lead">{t.careersOpenLead}</p>

          {loadState === 'loading' && (
            <div className="apply-hub-page__state" aria-busy="true" aria-live="polite">
              <div className="apply-hub-page__skeleton" />
              <div className="apply-hub-page__skeleton" />
              <p className="apply-hub-page__state-text">{t.careersLoading}</p>
            </div>
          )}

          {loadState === 'error' && (
            <div className="apply-hub-page__state" role="alert">
              <h3 className="apply-hub-page__state-title">{t.careersLoadErrorTitle}</h3>
              <p className="apply-hub-page__state-text">{error || t.careersLoadError}</p>
              <button type="button" className="btn btn--primary" onClick={load}>
                {t.careersRetry}
              </button>
            </div>
          )}

          {loadState === 'loaded' && vacancies.length === 0 && (
            <div className="apply-hub-page__state" role="status">
              <h3 className="apply-hub-page__state-title">{t.careersEmptyTitle}</h3>
              <p className="apply-hub-page__state-text">{t.careersEmptyLead}</p>
            </div>
          )}

          {loadState === 'loaded' && vacancies.length > 0 && (
            <ul className="apply-hub-page__list">
              {vacancies.map((vacancy) => {
                const display = getPublicVacancyDisplay(vacancy)
                return (
                  <li key={vacancy.id} className="apply-hub-card">
                    <div className="apply-hub-card__body">
                      <h3 className="apply-hub-card__title">{display.title}</h3>
                      {display.positionName ? (
                        <p className="apply-hub-card__position">{display.positionName}</p>
                      ) : null}
                      {display.description ? (
                        <p className="apply-hub-card__desc">{display.description}</p>
                      ) : null}
                    </div>
                    <Link
                      className="btn btn--primary apply-hub-card__cta"
                      to={applyPathForSlug(vacancy.slug)}
                    >
                      {t.careersApplyCta}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
