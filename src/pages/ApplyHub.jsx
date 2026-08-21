import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchPublishedVacanciesForApply } from '../services/publicApplyVacanciesService'
import { getPublicVacancyDisplay } from '../utils/careersVacancyDisplay'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import { useLanguage } from '../context/LanguageContext'
import { CAREERS_CONTACT } from '../components/careers/careersContact'
import patternTile from '../assets/brand/pattern/pattern-tile.svg'
import './ApplyHub.css'

function scrollToId(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function PhotoPlaceholder({ label, className = '' }) {
  return (
    <div className={`careers-ph ${className}`.trim()} aria-hidden="true">
      <span
        className="careers-ph__pattern"
        style={{ backgroundImage: `url(${patternTile})` }}
      />
      <div className="careers-ph__inner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <circle cx="9" cy="10" r="2" />
          <path d="M21 16.5l-5.2-5.2a2 2 0 0 0-2.8 0L4 20" />
        </svg>
        <span className="careers-ph__label">{label}</span>
      </div>
    </div>
  )
}

function VacancyBriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" />
      <path d="M3 12.5h18" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function getVacancyMetaParts(vacancy, t) {
  const parts = []
  if (vacancy?.employmentType) {
    parts.push(t.employmentTypes[vacancy.employmentType] || vacancy.employmentType)
  }
  if (vacancy?.city) parts.push(String(vacancy.city).trim())
  return parts.filter(Boolean)
}

/** Единственный публичный список вакансий — jobs `/`, local `/apply`. */
export default function ApplyHubPage() {
  const location = useLocation()
  const { t, lang } = useLanguage()
  const [vacancies, setVacancies] = useState([])
  const [selectedCity, setSelectedCity] = useState('')
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

  const cities = useMemo(() => {
    const byKey = new Map()
    vacancies.forEach((vacancy) => {
      const city = String(vacancy.city || '').trim()
      if (!city) return
      const key = city.toLocaleLowerCase(lang === 'kz' ? 'kk-KZ' : 'ru-RU')
      if (!byKey.has(key)) byKey.set(key, city)
    })
    return [...byKey.values()].sort((a, b) =>
      a.localeCompare(b, lang === 'kz' ? 'kk' : 'ru')
    )
  }, [lang, vacancies])

  const visibleVacancies = useMemo(() => {
    if (!selectedCity) return vacancies
    return vacancies.filter(
      (vacancy) =>
        String(vacancy.city || '').trim().toLocaleLowerCase() ===
        selectedCity.toLocaleLowerCase()
    )
  }, [selectedCity, vacancies])

  const benefits = [
    {
      key: 'stability',
      title: t.careersBenefitStabilityTitle,
      text: t.careersBenefitStabilityText,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      ),
    },
    {
      key: 'growth',
      title: t.careersBenefitGrowthTitle,
      text: t.careersBenefitGrowthText,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 21V10" />
          <path d="M12 10C12 6 9 4 5 4c0 4 2 7 7 7" />
          <path d="M12 10c0-3.5 2.5-5 6-5 0 3.5-1.8 6.2-6 6" />
        </svg>
      ),
    },
    {
      key: 'team',
      title: t.careersBenefitTeamTitle,
      text: t.careersBenefitTeamText,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
          <circle cx="17.5" cy="9" r="2.3" />
          <path d="M15.8 14.3c2.6.3 4.7 2.3 4.7 5.2" />
        </svg>
      ),
    },
    {
      key: 'care',
      title: t.careersBenefitCareTitle,
      text: t.careersBenefitCareText,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 20s-7-4.4-9.3-8.8C1 8 2.4 4.8 5.6 4.1 8 3.6 10.3 5 12 7.4 13.7 5 16 3.6 18.4 4.1c3.2.7 4.6 3.9 2.9 7.1C19 15.6 12 20 12 20z" />
        </svg>
      ),
    },
  ]

  const mailtoHref = `mailto:${CAREERS_CONTACT.email}`

  return (
    <div className="apply-hub-page">
      <main className="apply-hub-page__main">
        <section className="careers-hero" aria-labelledby="careers-hero-title">
          <div className="careers-hero__copy">
            <p className="careers-hero__eyebrow">{t.careersHeroEyebrow}</p>
            <h1 id="careers-hero-title" className="careers-hero__title">
              {t.careersHeroTitle}
            </h1>
            <p className="careers-hero__lead">{t.careersHeroLead}</p>
            <div className="careers-hero__actions">
              <button
                type="button"
                className="careers-btn careers-btn--primary"
                onClick={() => scrollToId('careers-open-vacancies')}
              >
                {t.careersHeroPrimaryCta}
              </button>
              <button
                type="button"
                className="careers-btn careers-btn--secondary"
                onClick={() => scrollToId('careers-about')}
              >
                {t.careersHeroSecondaryCta}
              </button>
            </div>
          </div>
          <PhotoPlaceholder label={t.careersHeroPhotoLabel} className="careers-hero__media" />
        </section>

        <section className="careers-benefits" aria-label={t.careersBenefitStabilityTitle}>
          <div className="careers-benefits__grid">
            {benefits.map((benefit) => (
              <article key={benefit.key} className="careers-benefit-card">
                <div className="careers-benefit-card__icon" aria-hidden="true">
                  {benefit.icon}
                </div>
                <h3 className="careers-benefit-card__title">{benefit.title}</h3>
                <p className="careers-benefit-card__text">{benefit.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="careers-vacancies"
          id="careers-open-vacancies"
          aria-labelledby="careers-open-heading"
        >
          <div className="careers-vacancies__head">
            <div>
              <h2 id="careers-open-heading" className="careers-vacancies__title">
                {t.careersOpenTitle}
              </h2>
              <p className="careers-vacancies__lead">{t.careersOpenLead}</p>
            </div>
            {loadState === 'loaded' && vacancies.length > 0 ? (
              <a className="careers-link-arrow" href="#careers-open-vacancies">
                {t.careersAllVacanciesLink}
                <ChevronIcon />
              </a>
            ) : null}
          </div>

          {cities.length > 1 ? (
            <label className="careers-vacancies__filter">
              <span>{t.careersCityFilter}</span>
              <select
                className="careers-vacancies__filter-control"
                value={selectedCity}
                onChange={(event) => setSelectedCity(event.target.value)}
              >
                <option value="">{t.careersAllCities}</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {loadState === 'loading' && (
            <div className="careers-vacancies__state" aria-busy="true" aria-live="polite">
              <div className="careers-vacancies__skeleton" />
              <div className="careers-vacancies__skeleton" />
              <p className="careers-vacancies__state-text">{t.careersLoading}</p>
            </div>
          )}

          {loadState === 'error' && (
            <div className="careers-vacancies__state" role="alert">
              <h3 className="careers-vacancies__state-title">{t.careersLoadErrorTitle}</h3>
              <p className="careers-vacancies__state-text">{error || t.careersLoadError}</p>
              <button type="button" className="careers-btn careers-btn--primary" onClick={load}>
                {t.careersRetry}
              </button>
            </div>
          )}

          {loadState === 'loaded' && vacancies.length === 0 && (
            <div className="careers-vacancies__state" role="status">
              <h3 className="careers-vacancies__state-title">{t.careersEmptyTitle}</h3>
              <p className="careers-vacancies__state-text">{t.careersEmptyLead}</p>
            </div>
          )}

          {loadState === 'loaded' && visibleVacancies.length > 0 && (
            <ul className="careers-vacancy-list">
              {visibleVacancies.map((vacancy) => {
                const display = getPublicVacancyDisplay(vacancy)
                const meta = getVacancyMetaParts(vacancy, t)
                return (
                  <li key={vacancy.id}>
                    <Link
                      className="careers-vacancy-card"
                      to={`/vacancies/${encodeURIComponent(vacancy.slug)}${location.search || ''}`}
                    >
                      <span className="careers-vacancy-card__icon" aria-hidden="true">
                        <VacancyBriefcaseIcon />
                      </span>
                      <span className="careers-vacancy-card__body">
                        <span className="careers-vacancy-card__title">{display.title}</span>
                        {meta.length ? (
                          <span className="careers-vacancy-card__meta">
                            {meta.map((part, index) => (
                              <span key={`${vacancy.id}-${part}`}>
                                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                                {part}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      <span className="careers-vacancy-card__chev" aria-hidden="true">
                        <ChevronIcon />
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="careers-about" id="careers-about" aria-labelledby="careers-about-title">
          <div
            className="careers-about__band"
            style={{
              '--careers-pattern': `url(${patternTile})`,
            }}
          >
            <span className="careers-about__pattern" aria-hidden="true" />
            <div className="careers-about__copy">
              <h2 id="careers-about-title">{t.careersAboutTitle}</h2>
              <p>{t.careersAboutLead}</p>
              <button
                type="button"
                className="careers-btn careers-btn--outline-white"
                onClick={() => scrollToId('careers-contact')}
              >
                {t.careersAboutCta}
              </button>
            </div>
            <PhotoPlaceholder
              label={t.careersAboutPhotoLabel}
              className="careers-about__media"
            />
          </div>
        </section>

        <section
          className="careers-contact"
          id="careers-contact"
          aria-labelledby="careers-contact-title"
        >
          <div className="careers-contact__band">
            <div className="careers-contact__copy">
              <h3 id="careers-contact-title">{t.careersContactTitle}</h3>
              <p>{t.careersContactLead}</p>
            </div>
            <div className="careers-contact__info">
              <a className="careers-contact__row" href={CAREERS_CONTACT.phoneHref}>
                <span aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.5 21 3 12.5 3 3c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                  </svg>
                </span>
                {CAREERS_CONTACT.phoneDisplay}
              </a>
              <a className="careers-contact__row" href={mailtoHref}>
                <span aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <path d="M3.5 6.5l8.5 6 8.5-6" />
                  </svg>
                </span>
                {CAREERS_CONTACT.email}
              </a>
            </div>
            <a className="careers-btn careers-btn--secondary" href={mailtoHref}>
              {t.careersContactCta}
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}
