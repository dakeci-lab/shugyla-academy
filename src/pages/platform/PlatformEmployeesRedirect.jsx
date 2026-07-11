import { Navigate } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { getEmployeesSectionPath } from '../../config/permissions'

/** Перенаправление /platform/employees в доступный подраздел */
export default function PlatformEmployeesRedirect() {
  const { user } = useSession()
  return <Navigate to={getEmployeesSectionPath(user)} replace />
}
