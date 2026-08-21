import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { fetchPublishedVacanciesForApply } from '../services/publicApplyVacanciesService'
import {
  getPublicVacancyContentBlocks,
  getPublicVacancyDisplay,
  getPublicVacancyFacts,
  getPublicVacancyPills,
} from '../utils/careersVacancyDisplay'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import { useLanguage } from '../context/LanguageContext'
import { getCareersHomePath } from '../router/hostSurface'
import CareersPhoto from '../components/careers/CareersPhoto'
import photoTeamEmployee from '../assets/brand/photos/photo-team-employee.jpg'
import '../components/careers/CareersPhoto.css'
import './VacancyDetail.css'

function BackChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

function ContentBlock({ block }) {
  if (!block) return null
  return (
    <section className="vacancy-detail__block" aria-labelledby={`vacancy-block-${block.key}`}>
      <h3 id={`vacancy-block-${block.key}`}>{block.title}</h3>
      {block.lines?.length ? (
        <ul>
          {block.lines.map((line) => (
            <li key={`${block.key}-${line}`}>{line}</li>
          ))}
        </ul>
      ) : block.text ? (
        <p>{block.text}</p>
      ) : null}
    </section>
  )
}

/** Публичная детальная страница вакансии — /vacancies/:slug */
export default function VacancyDetailPage() {
  const { slug } = useParams()
  const location = useLocation()
  const { t, lang } = useLanguage()
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
  const facts = useMemo(
    () => getPublicVacancyFacts(vacancy || {}, t, lang),
    [vacancy, t, lang]
  )
  const pills = useMemo(() => getPublicVacancyPills(vacancy || {}, t), [vacancy, t])
  const blocks = useMemo(
    () => getPublicVacancyContentBlocks(vacancy || {}, t, lang),
    [vacancy, t, lang]
  )
  const homePath = `${getCareersHomePath()}${location.search || ''}`
  const applyPath = vacancy
    ? `/apply/${encodeURIComponent(vacancy.slug)}${location.search || ''}`
    : homePath

  const sideFacts = facts.filter((fact) =>
    ['store', 'city', 'employment', 'schedule', 'salary'].includes(fact.key)
  )

  if (loadState === 'loading') {
    return (
      <div className="vacancy-detail">
        <main className="vacancy-detail__main">
          <div className="vacancy-detail__state" aria-busy="true">
            <p>{t.careersLoading}</p>
          </div>
        </main>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="vacancy-detail">
        <main className="vacancy-detail__main">
          <div className="vacancy-detail__state" role="alert">
            <p>{error || t.careersLoadError}</p>
            <button type="button" className="vacancy-detail__btn" onClick={load}>
              {t.careersRetry}
            </button>
          </div>
        </main>
      </div>
    )
  }

  if (!vacancy) {
    return (
      <div className="vacancy-detail">
        <main className="vacancy-detail__main">
          <div className="vacancy-detail__state">
            <h1>{t.careersClosedTitle}</h1>
            <Link to={homePath} className="vacancy-detail__btn">
              {t.careersClosedCta}
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="vacancy-detail">
      <main className="vacancy-detail__main">
        <Link to={homePath} className="vacancy-detail__back">
          <BackChevron />
          {t.careersAllVacanciesLink}
        </Link>

        <div className="vacancy-detail__grid">
          <div className="vacancy-detail__primary">
            <h1 className="vacancy-detail__title">{display.title}</h1>

            {pills.length ? (
              <div className="vacancy-detail__pills">
                {pills.map((pill) => (
                  <span key={pill.key} className="vacancy-detail__pill">
                    {pill.value}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="vacancy-detail__media vacancy-detail__media--mobile">
              <CareersPhoto
                src={photoTeamEmployee}
                alt={t.careersVacancyPhotoLabel}
                className="vacancy-detail__ph"
                objectPosition="center 18%"
              />
            </div>

            <ContentBlock block={blocks.duties} />
            <ContentBlock block={blocks.expectations} />
            <ContentBlock block={blocks.offers} />

            <Link to={applyPath} className="vacancy-detail__btn vacancy-detail__btn--desktop">
              {t.careersRespondCta}
            </Link>
          </div>

          <aside className="vacancy-detail__aside">
            {sideFacts.length ? (
              <div className="vacancy-detail__side-card">
                <h2 className="vacancy-detail__side-title">{t.careersVacancyAboutTitle}</h2>
                <ul>
                  {display.positionName || display.title ? (
                    <li>{display.positionName || display.title}</li>
                  ) : null}
                  {sideFacts.map((fact) => (
                    <li key={fact.key}>
                      <span className="vacancy-detail__side-label">{fact.label}</span>
                      {fact.value}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="vacancy-detail__media vacancy-detail__media--desktop">
              <CareersPhoto
                src={photoTeamEmployee}
                alt={t.careersVacancyPhotoLabel}
                className="vacancy-detail__ph vacancy-detail__ph--tall"
                objectPosition="center 18%"
              />
            </div>
          </aside>
        </div>
      </main>

      <div className="vacancy-detail__sticky-cta sticky-cta">
        <Link to={applyPath} className="vacancy-detail__btn vacancy-detail__btn--block">
          {t.careersRespondCta}
        </Link>
      </div>
    </div>
  )
}
