import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { isAdmin } from '../../data/roles'
import { participatesInStoreSchedule } from '../../utils/employeeData'
import TimeTrackerSection from '../../components/admin/sections/TimeTrackerSection'
import OwnerDashboard from '../../components/admin/OwnerDashboard'
import './PlatformHome.css'

const VIOLATION_LABELS = {
  clock_in: 'Сотрудник не начал смену',
  clock_out: 'Сотрудник не завершил смену',
}

/** Главная страница платформы */
export default function PlatformHome() {
  const { user } = useSession()
  const [searchParams] = useSearchParams()
  const violationContext = useMemo(() => {
    const employee = searchParams.get('employee')
    const shift = searchParams.get('shift')
    const violation = searchParams.get('violation')
    if (!employee || !shift || !violation) return null
    return {
      employeeId: employee,
      shiftId: shift,
      violation,
      label: VIOLATION_LABELS[violation] || 'Нарушение тайм-трекера',
    }
  }, [searchParams])

  if (isAdmin(user?.role)) {
    return (
      <div className="platform-home platform-home--owner">
        {violationContext ? (
          <section className="platform-home__violation-banner" style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>{violationContext.label}</h2>
            <p style={{ margin: 0 }}>
              Тип: {violationContext.violation}. Сотрудник #{violationContext.employeeId}. Смена{' '}
              {violationContext.shiftId.slice(0, 8)}…
            </p>
            <p style={{ margin: '8px 0 0' }}>
              <Link to={`/platform/employees/${violationContext.employeeId}`}>
                Открыть карточку сотрудника
              </Link>
              {' · '}
              <Link to="/platform/settings/notifications">Журнал нарушений</Link>
            </p>
          </section>
        ) : null}
        <OwnerDashboard />
      </div>
    )
  }

  // Online (remote) staff are outside store presence / shift check-in UI.
  if (!participatesInStoreSchedule(user)) {
    return <div className="platform-home" />
  }

  return (
    <div className="platform-home">
      <TimeTrackerSection variant="home" employeeId={user?.id} />
    </div>
  )
}
