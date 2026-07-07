import { Link } from 'react-router-dom'
import { getRole } from '../data/roles'
import { getCourseAllowedRoleLabels } from '../utils/auth'
import Header from './Header'
import './AccessDenied.css'

/**
 * Страница «Нет доступа» — при попытке открыть курс не своей роли
 */
export default function AccessDenied({ course, userRole }) {
  const role = getRole(userRole)
  const allowedLabels = getCourseAllowedRoleLabels(course)

  return (
    <div className="access-denied">
      <Header />

      <main className="access-denied__main container">
        <div className="access-denied__card">
          <span className="access-denied__icon" aria-hidden="true">🔒</span>
          <h1 className="access-denied__title">Нет доступа к этому курсу</h1>

          <p className="access-denied__text">
            Курс <strong>«{course.title}»</strong> недоступен для вашей роли
            {role && <> — <strong>{role.label}</strong></>}.
          </p>

          {allowedLabels.length > 0 && (
            <p className="access-denied__allowed">
              Доступен для: {allowedLabels.join(', ')}
            </p>
          )}

          {role?.description && (
            <p className="access-denied__hint">{role.description}</p>
          )}

          <div className="access-denied__actions">
            <Link to="/dashboard" className="btn btn--primary">
              Мои курсы
            </Link>
            <Link to="/academy" className="btn btn--outline">
              На главную
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
