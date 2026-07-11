import WorkScheduleSection from '../../components/admin/sections/WorkScheduleSection'
import '../../components/admin/admin-shared.css'

/** Общий график работы сотрудников (для админа — вся команда, для остальных — только своя строка) */
export default function PlatformWorkSchedule() {
  return (
    <div className="platform-work-schedule">
      <WorkScheduleSection />
    </div>
  )
}
