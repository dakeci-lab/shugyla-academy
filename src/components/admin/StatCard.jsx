import './admin-shared.css'

/** Карточка статистики для раздела «Обзор» */
export default function StatCard({ value, label, icon, hint, variant = 'default', wide = false }) {
  return (
    <div className={`admin-stat-card admin-stat-card--${variant} ${wide ? 'admin-stat-card--wide' : ''}`}>
      {icon && <span className="admin-stat-card__icon">{icon}</span>}
      <span className="admin-stat-card__value">{value}</span>
      <span className="admin-stat-card__label">{label}</span>
      {hint && <span className="admin-stat-card__hint">{hint}</span>}
    </div>
  )
}
