import { Navigate, useParams } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { canViewEmployeeSchedule } from '../../config/permissions'
import EmployeeScheduleSection from '../../components/admin/sections/EmployeeScheduleSection'
import '../../components/admin/admin-shared.css'

/** Страница персонального графика сотрудника */
export default function PlatformEmployeeSchedule() {
  const { employeeId } = useParams()
  const { user } = useSession()

  if (!canViewEmployeeSchedule(user, employeeId)) {
    return <Navigate to="/platform/academy/cabinet" replace />
  }

  return (
    <div className="platform-employee-schedule">
      <EmployeeScheduleSection employeeId={employeeId} />
    </div>
  )
}
