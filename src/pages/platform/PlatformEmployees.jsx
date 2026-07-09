import EmployeesSection from '../../components/admin/sections/EmployeesSection'
import '../../components/admin/admin-shared.css'

/** Список сотрудников — учётные записи, роли и статус */
export default function PlatformEmployees() {
  return (
    <div className="platform-employees">
      <EmployeesSection />
    </div>
  )
}
