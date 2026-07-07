import './admin-shared.css'

/** Карточка статистики для раздела «Обзор» */
export default function StatCard({ value, label, icon, variant = 'default' }) {
  return (
    <div className={`admin-stat-card admin-stat-card--${variant}`}>
      {icon && <span className="admin-stat-card__icon">{icon}</span>}
      <span className="admin-stat-card__value">{value}</span>
      <span className="admin-stat-card__label">{label}</span>
    </div>
  )
}
