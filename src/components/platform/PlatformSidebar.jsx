import { NavLink } from 'react-router-dom'
import DataModeBadge from '../admin/DataModeBadge'
import { useSession } from '../../context/SessionContext'
import { PLATFORM_NAV } from '../../platform/platformNav'
import { filterPlatformNav } from '../../platform/platformAccess'
import './PlatformSidebar.css'

/** Боковое меню Shugyla Platform */
export default function PlatformSidebar() {
  const { user } = useSession()
  const navItems = filterPlatformNav(PLATFORM_NAV, user?.role)

  return (
    <aside className="platform-sidebar">
      <div className="platform-sidebar__header">
        <span className="platform-sidebar__logo-icon">S</span>
        <div className="platform-sidebar__brand">
          <span className="platform-sidebar__title">Shugyla Platform</span>
          <span className="platform-sidebar__subtitle">Внутренняя платформа</span>
        </div>
      </div>

      <nav className="platform-sidebar__nav" aria-label="Разделы платформы">
        {navItems.map((item) =>
          item.children ? (
            <div key={item.id} className="platform-sidebar__group">
              <div className="platform-sidebar__group-label">{item.label}</div>
              {item.children.map((child) => (
                <NavLink
                  key={child.id}
                  to={child.path}
                  end={child.end}
                  className={({ isActive }) =>
                    [
                      'platform-sidebar__link',
                      'platform-sidebar__link--sub',
                      isActive ? 'platform-sidebar__link--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                  }
                >
                  {child.label}
                </NavLink>
              ))}
            </div>
          ) : (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                [
                  'platform-sidebar__link',
                  isActive ? 'platform-sidebar__link--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              }
            >
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      <div className="platform-sidebar__footer">
        <DataModeBadge />
      </div>
    </aside>
  )
}
