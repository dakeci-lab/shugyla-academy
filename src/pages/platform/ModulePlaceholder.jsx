import { Link } from 'react-router-dom'
import './ModulePlaceholder.css'

/** Заготовка раздела платформы */
export default function ModulePlaceholder({
  title,
  description,
  icon = null,
  hint = 'Раздел в разработке',
  actionLabel,
  actionTo,
}) {
  return (
    <div className="module-placeholder">
      {icon && (
        <div className="module-placeholder__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="module-placeholder__title">{title}</h2>
      {description && <p className="module-placeholder__desc">{description}</p>}
      <p className="module-placeholder__hint">{hint}</p>
      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn btn--primary">
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
