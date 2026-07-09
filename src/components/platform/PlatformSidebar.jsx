import { NavLink } from 'react-router-dom'
import DataModeBadge from '../admin/DataModeBadge'
import { PLATFORM_NAV } from '../../platform/platformNav'
import './PlatformSidebar.css'

/** Боковое меню Shugyla Platform */
export default function PlatformSidebar() {
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
        {PLATFORM_NAV.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `platform-sidebar__link ${isActive ? 'platform-sidebar__link--active' : ''}`
            }
          >
            <span className="platform-sidebar__icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="platform-sidebar__footer">
        <DataModeBadge />
        <NavLink to="/vacancies" className="platform-sidebar__back">
          Публичные вакансии
        </NavLink>
      </div>
    </aside>
  )
}
