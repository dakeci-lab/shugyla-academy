import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { LOGIN_PATH } from '../router/authRoutes'
import AdminLayout from '../layouts/AdminLayout'
import OverviewSection from '../components/admin/sections/OverviewSection'
import EmployeesSection from '../components/admin/sections/EmployeesSection'
import StandardsSection from '../components/admin/sections/StandardsSection'
import RecruitmentSection from '../components/admin/sections/RecruitmentSection'

/** Контент активного раздела (legacy shell; Academy Learning UI removed). */
function AdminContent({ activeTab }) {
  switch (activeTab) {
    case 'overview':
      return <OverviewSection />
    case 'employees':
      return <EmployeesSection />
    case 'standards':
      return <StandardsSection />
    case 'recruitment':
      return <RecruitmentSection />
    default:
      return <OverviewSection />
  }
}

/**
 * Админ-панель — legacy shell (routes redirect to /platform).
 * Kept for non-Academy section components; not mounted in App routes.
 */
export default function Admin() {
  const navigate = useNavigate()
  const { user, logout } = useSession()
  const [activeTab, setActiveTab] = useState('overview')

  function handleLogout() {
    logout()
    navigate(LOGIN_PATH)
  }

  return (
    <AdminLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      userName={user?.name}
      onLogout={handleLogout}
    >
      <AdminContent activeTab={activeTab} />
    </AdminLayout>
  )
}
