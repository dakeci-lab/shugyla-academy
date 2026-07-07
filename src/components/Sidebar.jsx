import { NavLink } from 'react-router-dom'
import './Sidebar.css'

/** Пункты бокового меню админ-панели */
const MENU_ITEMS = [
  { id: 'overview', label: 'Обзор', icon: '📊' },
  { id: 'employees', label: 'Сотрудники', icon: '👥' },
  { id: 'courses', label: 'Курсы', icon: '📚' },
  { id: 'tests', label: 'Тесты', icon: '📝' },
  { id: 'certification', label: 'Аттестация', icon: '🎓' },
  { id: 'progress', label: 'Прогресс', icon: '📈' },
]

/**
 * Боковое меню админ-панели
 */
export default function Sidebar({ activeTab, onTabChange }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__logo-icon">S</span>
        <span className="sidebar__title">Админ-панель</span>
      </div>

      <nav className="sidebar__nav">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar__link ${activeTab === item.id ? 'sidebar__link--active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            <span className="sidebar__icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <NavLink to="/academy" className="sidebar__back">
          ← На главную
        </NavLink>
      </div>
    </aside>
  )
}
