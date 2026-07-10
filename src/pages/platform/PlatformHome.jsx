import { useSession } from '../../context/SessionContext'
import TimeTrackerSection from '../../components/admin/sections/TimeTrackerSection'
import './PlatformHome.css'

/** Главная страница платформы */
export default function PlatformHome() {
  const { user } = useSession()

  return (
    <div className="platform-home">
      <TimeTrackerSection variant="home" employeeId={user?.id} />
    </div>
  )
}
