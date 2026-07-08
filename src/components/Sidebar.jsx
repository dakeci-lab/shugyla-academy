import { NavLink } from 'react-router-dom'
import './Sidebar.css'

/** Пункты бокового меню админ-панели */
export const ADMIN_MENU_ITEMS = [
  { id: 'overview', label: 'Обзор', icon: '◉' },
  { id: 'employees', label: 'Сотрудники', icon: '◎' },
  { id: 'courses', label: 'Курсы', icon: '▤' },
  { id: 'paths', label: 'Маршруты', icon: '⤳' },
  { id: 'standards', label: 'Стандарты', icon: '◫' },
  { id: 'recruitment', label: 'Найм', icon: '◑' },
  { id: 'tests', label: 'Тесты', icon: '✎' },
  { id: 'certification', label: 'Аттестация', icon: '◈' },
  { id: 'progress', label: 'Прогресс', icon: '↗' },
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
          <span className="sidebar__title">Shugyla Academy</span>
          <span className="sidebar__subtitle">Админ-панель</span>
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
        <NavLink to="/dashboard" className="sidebar__back">
          Личный кабинет
        </NavLink>
        <NavLink to="/academy" className="sidebar__back sidebar__back--muted">
          ← На главную
        </NavLink>
      </div>
    </aside>
  )
}
