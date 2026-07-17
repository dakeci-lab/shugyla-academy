import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { getEmployeeProfilePath } from '../../config/permissions'

/**
 * Совместимость: старый персональный график
 * `/platform/employees/:employeeId/schedule` → карточка сотрудника.
 */
export default function PlatformEmployeeSchedule() {
  const { employeeId } = useParams()
  const [searchParams] = useSearchParams()

  if (!employeeId || !/^\d+$/.test(employeeId)) {
    return <Navigate to="/platform/employees/list" replace />
  }

  const nextParams = new URLSearchParams(searchParams)
  const query = nextParams.toString()
  const target = `${getEmployeeProfilePath(employeeId)}${query ? `?${query}` : ''}#schedule`

  return <Navigate to={target} replace />
}
