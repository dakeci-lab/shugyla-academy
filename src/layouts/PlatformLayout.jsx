import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import PlatformSidebar from '../components/platform/PlatformSidebar'
import { getPlatformSection } from '../platform/platformNav'
import { useSession } from '../context/SessionContext'
import './PlatformLayout.css'

/** Оболочка Shugyla Platform — sidebar + контент */
export default function PlatformLayout() {
  const { user, logout } = useSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const section = getPlatformSection(pathname)

  function handleLogout() {
    logout()
    navigate('/academy')
  }

  return (
    <div className="platform-layout">
      <PlatformSidebar />

      <div className="platform-layout__main">
        <header className="platform-layout__topbar">
          <div className="platform-layout__topbar-info">
            <h1 className="platform-layout__title">{section.title}</h1>
            <p className="platform-layout__desc">{section.description}</p>
          </div>
          <div className="platform-layout__topbar-user">
            <Link to="/profile" className="platform-layout__profile-link">
              Профиль
            </Link>
            <span className="platform-layout__user-name">{user?.name}</span>
            <button type="button" className="btn btn--outline btn--sm" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </header>

        <div className="platform-layout__content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
