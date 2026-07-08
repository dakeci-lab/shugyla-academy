import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import AdminLayout from '../layouts/AdminLayout'
import OverviewSection from '../components/admin/sections/OverviewSection'
import EmployeesSection from '../components/admin/sections/EmployeesSection'
import CoursesSection from '../components/admin/sections/CoursesSection'
import LearningPathsSection from '../components/admin/sections/LearningPathsSection'
import StandardsSection from '../components/admin/sections/StandardsSection'
import RecruitmentSection from '../components/admin/sections/RecruitmentSection'
import TestsSection from '../components/admin/sections/TestsSection'
import CertificationSection from '../components/admin/sections/CertificationSection'
import ProgressSection from '../components/admin/sections/ProgressSection'

/** Контент активного раздела */
function AdminContent({ activeTab }) {
  switch (activeTab) {
    case 'overview':
      return <OverviewSection />
    case 'employees':
      return <EmployeesSection />
    case 'courses':
      return <CoursesSection />
    case 'paths':
      return <LearningPathsSection />
    case 'standards':
      return <StandardsSection />
    case 'recruitment':
      return <RecruitmentSection />
    case 'tests':
      return <TestsSection />
    case 'certification':
      return <CertificationSection />
    case 'progress':
      return <ProgressSection />
    default:
      return <OverviewSection />
  }
}

/**
 * Админ-панель — /admin
 * Доступна только пользователям с manage_users
 */
export default function Admin() {
  const navigate = useNavigate()
  const { user, logout } = useSession()
  const [activeTab, setActiveTab] = useState('overview')

  function handleLogout() {
    logout()
    navigate('/academy')
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
