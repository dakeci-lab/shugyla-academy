import { Navigate } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { canViewTeamSchedule, getEmployeeSchedulePath } from '../../config/permissions'
import WorkScheduleSection from '../../components/admin/sections/WorkScheduleSection'
import '../../components/admin/admin-shared.css'

/** Общий график работы сотрудников */
export default function PlatformWorkSchedule() {
  const { user } = useSession()

  if (!canViewTeamSchedule(user)) {
    return <Navigate to={getEmployeeSchedulePath(user)} replace />
  }

  return (
    <div className="platform-work-schedule">
      <WorkScheduleSection />
    </div>
  )
}
