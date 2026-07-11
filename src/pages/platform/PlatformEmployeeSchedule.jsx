import { Navigate, useParams } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import {
  canViewEmployeeSchedule,
  canViewTeamSchedule,
} from '../../config/permissions'
import EmployeeScheduleSection from '../../components/admin/sections/EmployeeScheduleSection'
import '../../components/admin/admin-shared.css'

/** Страница персонального графика сотрудника (редактирование — только для администратора) */
export default function PlatformEmployeeSchedule() {
  const { employeeId } = useParams()
  const { user } = useSession()

  if (!canViewEmployeeSchedule(user, employeeId)) {
    return <Navigate to="/platform/academy/cabinet" replace />
  }

  if (!canViewTeamSchedule(user)) {
    return <Navigate to="/platform/employees/schedule" replace />
  }

  return (
    <div className="platform-employee-schedule">
      <EmployeeScheduleSection employeeId={employeeId} />
    </div>
  )
}
