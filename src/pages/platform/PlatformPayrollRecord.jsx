import { Navigate } from 'react-router-dom'
import { getPayrollListPath } from '../../utils/salaryPayroll'

/** Карточка расчёта больше не используется — вся работа в ведомости */
export default function PlatformPayrollRecord() {
  return <Navigate to={getPayrollListPath()} replace />
}
