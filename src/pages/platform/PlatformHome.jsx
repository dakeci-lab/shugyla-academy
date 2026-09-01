import { useSession } from '../../context/SessionContext'
import { isAdmin } from '../../data/roles'
import { participatesInStoreSchedule } from '../../utils/employeeData'
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
