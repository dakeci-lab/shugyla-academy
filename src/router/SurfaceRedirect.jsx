import { useEffect } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import {
  getCareersHomePath,
  getCareersUrl,
  getPlatformUrl,
} from './hostSurface'

function ExternalRedirect({ target }) {
  const { t } = useLanguage()

  useEffect(() => {
    window.location.replace(target)
  }, [target])

  return (
    <main className="apply-page">
      <div className="apply-page__card apply-page__closed" role="status">
        <p>{t.surfaceRedirecting}</p>
        <a className="btn btn--primary" href={target}>
          {t.surfaceContinue}
        </a>
      </div>
    </main>
  )
}

export function CareersExternalRedirect({ route = 'home' }) {
  const location = useLocation()
  const { slug } = useParams()
  const safeSlug = encodeURIComponent(String(slug || ''))
  const relativePath =
    route === 'vacancy'
      ? `vacancies/${safeSlug}`
      : route === 'apply'
        ? `apply/${safeSlug}`
        : ''
  const target = `${getCareersUrl(relativePath, location.search)}${location.hash || ''}`
  return <ExternalRedirect target={target} />
}

export function PlatformExternalRedirect() {
  const location = useLocation()
  const target = `${getPlatformUrl(location.pathname, location.search)}${location.hash || ''}`
  return <ExternalRedirect target={target} />
}

export function CareersHomeRedirect() {
  const location = useLocation()
  return (
    <Navigate
      to={`${getCareersHomePath()}${location.search || ''}${location.hash || ''}`}
      replace
    />
  )
}
