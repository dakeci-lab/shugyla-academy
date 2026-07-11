import { useSession } from '../../context/SessionContext'
import { isAdmin } from '../../data/roles'
import TimeTrackerSection from '../../components/admin/sections/TimeTrackerSection'
import OwnerDashboard from '../../components/admin/OwnerDashboard'
import './PlatformHome.css'

/** Главная страница платформы */
export default function PlatformHome() {
  const { user } = useSession()

  if (isAdmin(user?.role)) {
    return (
      <div className="platform-home platform-home--owner">
        <OwnerDashboard />
      </div>
    )
  }

  return (
    <div className="platform-home">
      <TimeTrackerSection variant="home" employeeId={user?.id} />
    </div>
  )
}
