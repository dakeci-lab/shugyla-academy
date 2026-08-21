import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import CareersHeader from '../components/careers/CareersHeader'
import CareersFooter from '../components/careers/CareersFooter'
import { useLanguage } from '../context/LanguageContext'
import '../components/careers/careers-tokens.css'
import './CareersPublicLayout.css'

const MONTSERRAT_LINK_ID = 'careers-montserrat-font'
const MONTSERRAT_HREF =
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap'

/**
 * Public careers shell for /apply and /vacancies.
 * Never shows platform nav, profile, or session identity.
 * Montserrat is injected only while this layout is mounted (not on /platform).
 */
export default function CareersPublicLayout({ children }) {
  const { pathname } = useLocation()
  const { t } = useLanguage()

  useEffect(() => {
    const prev = document.title
    document.title = t.careersDocumentTitle || 'Работа в Shugyla Market'
    return () => {
      document.title = prev
    }
  }, [pathname, t.careersDocumentTitle])

  useEffect(() => {
    let link = document.getElementById(MONTSERRAT_LINK_ID)
    if (!link) {
      link = document.createElement('link')
      link.id = MONTSERRAT_LINK_ID
      link.rel = 'stylesheet'
      link.href = MONTSERRAT_HREF
      document.head.appendChild(link)
    }
    return () => {
      const existing = document.getElementById(MONTSERRAT_LINK_ID)
      existing?.remove()
    }
  }, [])

  return (
    <div className="careers-public-layout">
      <CareersHeader />
      <div className="careers-public-layout__main">{children || <Outlet />}</div>
      <CareersFooter />
    </div>
  )
}
