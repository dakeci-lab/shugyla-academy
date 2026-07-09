import { Link } from 'react-router-dom'
import { getUserStandardsSummary } from '../utils/standardsData'
import '../pages/Standards.css'

/** Компактный блок стандартов на dashboard */
export default function StandardsDashboardBlock({ userId, user }) {
  const summary = getUserStandardsSummary(userId, user)

  return (
    <section className="dashboard-page__section standards-dash-block">
      <h2 className="dashboard-page__heading">Стандарты компании</h2>
      <div className="standards-dash-block__card">
        <div className="standards-dash-block__stats">
          <p>
            <span className="standards-dash-block__label">Не ознакомлено:</span>{' '}
            <strong>{summary.unacknowledgedCount}</strong>
          </p>
          <p>
            <span className="standards-dash-block__label">Важные:</span>{' '}
            <strong>{summary.importantUnacknowledgedCount}</strong>
          </p>
        </div>
        <Link to="/platform/standards" className="btn btn--primary btn--sm">
          Открыть
        </Link>
      </div>
    </section>
  )
}
