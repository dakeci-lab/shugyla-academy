import { Navigate, useParams } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { canViewEmployeeProfile } from '../../config/permissions'
import EmployeeProfileSection from '../../components/admin/sections/EmployeeProfileSection'
import '../../components/admin/admin-shared.css'

/** Единая карточка сотрудника */
export default function PlatformEmployeeProfile() {
  const { employeeId } = useParams()
  const { user } = useSession()

  if (!employeeId || !/^\d+$/.test(employeeId)) {
    return <Navigate to="/platform/employees/list" replace />
  }

  if (!canViewEmployeeProfile(user, employeeId)) {
    return <Navigate to="/platform/academy/cabinet" replace />
  }

  return (
    <div className="platform-employee-profile">
      <EmployeeProfileSection employeeId={employeeId} />
    </div>
  )
}
