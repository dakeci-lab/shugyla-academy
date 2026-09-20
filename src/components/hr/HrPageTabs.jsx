import { Link, useLocation } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { ROUTE_KEYS, canAccessRoute } from '../../config/permissions'
import './HrPageTabs.css'

const TABS = [
  { id: 'candidates', label: 'Кандидаты', path: '/platform/hr/candidates', routeKey: ROUTE_KEYS.HR_CANDIDATES },
  { id: 'vacancies', label: 'Вакансии', path: '/platform/hr/vacancies', routeKey: ROUTE_KEYS.HR_VACANCIES },
]

/**
 * Page-level tabs of the single «HR» section. Each tab is its own route (deep
 * links and per-page data loading stay as they were); the bar is shown on top
 * of both pages so they read as one page. The candidate status funnel lives
 * in the «Фильтр» popover, not here.
 */
export default function HrPageTabs() {
  const { user } = useSession()
  const { pathname } = useLocation()
  const visible = TABS.filter((tab) => canAccessRoute(user, tab.routeKey))

  return (
    <div className="candidates-status-tabs" role="tablist" aria-label="Раздел HR">
      {visible.map((tab) => {
        const active = pathname === tab.path || pathname.startsWith(`${tab.path}/`)
        return (
          <Link
            key={tab.id}
            to={tab.path}
            role="tab"
            aria-selected={active}
            className={active ? 'candidates-status-tab is-active' : 'candidates-status-tab'}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
