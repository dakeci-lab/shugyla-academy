import { useEffect } from 'react'
import LangSwitch from '../components/LangSwitch'
import { useLanguage } from '../context/LanguageContext'
import { getCareersUrl } from '../router/hostSurface'
import './CorporateHome.css'

const CONTACT_EMAIL = 'academy@shugyla.kz'

export default function CorporateHome() {
  const { t } = useLanguage()
  const careersUrl = getCareersUrl()

  useEffect(() => {
    const previousTitle = document.title
    document.title = t.corporateDocumentTitle
    return () => {
      document.title = previousTitle
    }
  }, [t.corporateDocumentTitle])

  return (
    <main className="corporate-home">
      <div className="corporate-home__language">
        <LangSwitch />
      </div>
      <section className="corporate-home__card" aria-labelledby="corporate-home-title">
        <div className="corporate-home__mark" aria-hidden="true">
          S
        </div>
        <p className="corporate-home__brand">Shugyla Market</p>
        <h1 id="corporate-home-title" className="corporate-home__title">
          {t.corporateTitle}
        </h1>
        <p className="corporate-home__text">{t.corporateContactLead}</p>
        <a className="corporate-home__contact" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        <a className="btn btn--primary corporate-home__jobs" href={careersUrl}>
          {t.corporateJobsLink}
        </a>
      </section>
    </main>
  )
}
