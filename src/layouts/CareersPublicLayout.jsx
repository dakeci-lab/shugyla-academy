import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import CareersHeader from '../components/careers/CareersHeader'
import { useLanguage } from '../context/LanguageContext'
import './CareersPublicLayout.css'

/**
 * Public careers shell for /apply and /vacancies.
 * Never shows platform nav, profile, or session identity.
 */
export default function CareersPublicLayout() {
  const { pathname } = useLocation()
  const { t } = useLanguage()

  useEffect(() => {
    const prev = document.title
    document.title = t.careersDocumentTitle || 'Работа в Shugyla Market'
    return () => {
      document.title = prev
    }
  }, [pathname, t.careersDocumentTitle])

  return (
    <div className="careers-public-layout">
      <CareersHeader />
      <Outlet />
    </div>
  )
}
