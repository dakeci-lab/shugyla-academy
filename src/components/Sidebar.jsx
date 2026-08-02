import { NavLink } from 'react-router-dom'
import './Sidebar.css'

/** Пункты бокового меню legacy-админ-панели (без Academy Learning). */
export const ADMIN_MENU_ITEMS = [
  { id: 'overview', label: 'Обзор', icon: '◉' },
  { id: 'employees', label: 'Сотрудники', icon: '◎' },
  { id: 'standards', label: 'Стандарты', icon: '◫' },
  { id: 'recruitment', label: 'Найм', icon: '◑' },
]

/**
 * Боковое меню админ-панели
 */
export default function Sidebar({ activeTab, onTabChange }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__logo-icon">S</span>
        <div className="sidebar__brand">
          <span className="sidebar__title">Shugyla Platform</span>
          <span className="sidebar__subtitle">Админ</span>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="Разделы админ-панели">
        {ADMIN_MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar__link ${activeTab === item.id ? 'sidebar__link--active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            <span className="sidebar__icon" aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <NavLink to="/platform" className="sidebar__back">
          Панель платформы
        </NavLink>
        <NavLink to="/platform" className="sidebar__back sidebar__back--muted">
          На платформу
        </NavLink>
      </div>
    </aside>
  )
}
